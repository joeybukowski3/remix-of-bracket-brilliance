/**
 * mlb-k-v4-production-adapter.mjs
 *
 * Maps the artifacts the daily MLB K pipeline already writes into the inputs
 * the V4 model wants, and returns the versioned `v4` block that sits ALONGSIDE
 * `legacy`, `v2` and `v3` in k-props-v2-shadow.json.
 *
 * NOTHING NEW IS FETCHED. Every field below is already produced by a step that
 * runs today:
 *
 *   strikeout-prop-details.json
 *     .pitcherLast10Starts                  pitcher recent windows (date/outs/K/BF)
 *     .pitcherVenueSplits.{home,away}.season  whole-season workload + K totals
 *     .opponentLastFiveVsStartersSummary.rows  the opponent's last 10 games,
 *                                            each with the opposing starter's
 *                                            name, outs and strikeouts
 *     .opponentContext.last10.kRate          opponent recent team K rate
 *   k-props-v2-shadow.json  .v2 / .v3        league anchors, opponent K rates
 *   k-workload-shadow.json  .role            starter / opener / reliever
 *   team-wrc-plus.json                       opponent wRC+ ranks
 *   start-log (research artifact)            opposing-starter BASELINES
 *
 * THE ONE GENUINELY NEW JOIN. Production already ships what opposing starters
 * DID against an offence (`opponentLastFiveVsStartersSummary`). It has never
 * shipped what those pitchers NORMALLY do, which is the denominator that turns
 * a raw average into a relative effect. That denominator comes from the start
 * log, restricted to starts strictly before each observation's own date.
 *
 * STARTERS ONLY, like V3. Openers and relievers are declined with an explicit
 * flag rather than being pushed through a starter-shaped innings model.
 *
 * NO MARKET INPUT.
 */
import { computeKProjectionV4, V4_SUPPORTED_ROLES, declineV4 } from "../mlb-k/compute-k-projection-v4.mjs";
import {
  createStartLogBaselineResolver,
  normalizePitcherKey,
} from "../mlb-k/mlb-k-opponent-starter-context.mjs";
import { K_PROJECTION_V4_MODEL_VERSION, V4_DEFAULTS } from "../mlb-k/mlb-k-projection-v4-core.mjs";

export { K_PROJECTION_V4_MODEL_VERSION, V4_SUPPORTED_ROLES, V4_DEFAULTS };

/** League levels used only when the slate carries no context of its own. */
export const LEAGUE_IP_PER_START_FALLBACK = 5.0;
export const LEAGUE_BF_PER_IP_FALLBACK = 4.3;
export const LEAGUE_K_RATE_FALLBACK = 0.2187;

const TEAM_ALIASES = Object.freeze({
  ARZ: "ARI", AZ: "ARI", CHW: "CWS", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WSN: "WSH",
});

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function normalizeTeam(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return TEAM_ALIASES[code] ?? code;
}

/** "5.1" -> 16 outs. Baseball fractional innings are thirds, not decimals. */
export function inningsTextToOuts(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (!text.includes(".")) {
    const whole = Number(text);
    return Number.isFinite(whole) ? Math.round(whole * 3) : null;
  }
  const [whole, frac] = text.split(".");
  const w = Number(whole);
  const f = Number(frac);
  if (!Number.isFinite(w) || !Number.isFinite(f)) return null;
  return w * 3 + f;
}

/** The pitcher's own recent starts, newest first, normalized for the model. */
export function buildPitcherStarts(detail) {
  const ten = Array.isArray(detail?.pitcherLast10Starts) ? detail.pitcherLast10Starts : [];
  const five = Array.isArray(detail?.pitcherLastFiveStarts) ? detail.pitcherLastFiveStarts : [];
  const source = ten.length >= five.length ? ten : five;
  return source
    .map((start) => {
      const outs = finite(start?.outsRecorded) ?? inningsTextToOuts(start?.inningsPitched);
      if (outs === null || outs < 0 || !start?.date) return null;
      return {
        date: String(start.date),
        outs,
        strikeouts: finite(start?.strikeouts),
        battersFaced: finite(start?.battersFaced),
        opponent: normalizeTeam(start?.opponentAbbr ?? start?.opponent),
      };
    })
    .filter((start) => start && start.strikeouts !== null);
}

/**
 * Whole-season workload and strikeout totals from the venue splits, which
 * cover every start rather than only the recent window. Returned in the shape
 * `computeKProjectionV4` expects for `seasonOverride`.
 */
export function buildSeasonOverride(detail) {
  const splits = detail?.pitcherVenueSplits ?? null;
  if (!splits) return null;
  let games = 0;
  let outs = 0;
  let strikeouts = 0;
  let battersFaced = 0;
  let sawBf = false;
  for (const site of ["home", "away"]) {
    const season = splits?.[site]?.season ?? null;
    const g = finite(season?.gamesUsed);
    const o = finite(season?.totalOuts);
    if (g === null || o === null || g <= 0) continue;
    games += g;
    outs += o;
    strikeouts += finite(season?.strikeouts) ?? 0;
    const bf = finite(season?.battersFaced);
    if (bf !== null) { battersFaced += bf; sawBf = true; }
  }
  if (games <= 0 || outs <= 0) return null;
  const innings = outs / 3;
  return {
    starts: games,
    innings,
    ipPerStart: innings / games,
    kPerIP: strikeouts > 0 ? strikeouts / innings : null,
    bfPerIP: sawBf && battersFaced > 0 ? battersFaced / innings : null,
  };
}

/**
 * The opponent's recent games, as observations the context module can score.
 *
 * Production's summary already restricts this to the opponent's most recent
 * games and records each opposing starter by name, outs and strikeouts. Rows
 * flagged invalid, undated, or dated on/after the slate are dropped here so
 * the leakage assertion downstream never has to reject the whole row.
 */
export function buildOpponentObservations(detail, slateDate) {
  const rows = detail?.opponentLastFiveVsStartersSummary?.rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && row.valid !== false && row.date && String(row.date) < String(slateDate))
    .map((row) => ({
      date: String(row.date),
      pitcherKey: normalizePitcherKey(row.opposingStartingPitcher),
      outs: finite(row.opposingStarterOuts),
      strikeouts: finite(row.opposingStarterStrikeouts),
    }))
    .filter((row) => row.pitcherKey && row.outs !== null && row.strikeouts !== null);
}

/** Normalizes the research start log into baseline-resolver rows. */
export function buildStartLogRows(startLog) {
  const starts = Array.isArray(startLog) ? startLog : (startLog?.starts ?? []);
  return starts
    .map((start) => ({
      date: start?.date ? String(start.date) : null,
      pitcherKey: normalizePitcherKey(start?.pitcher),
      outs: finite(start?.outs),
      strikeouts: finite(start?.strikeouts),
      opponent: normalizeTeam(start?.opponent),
    }))
    .filter((start) => start.date && start.pitcherKey && start.outs !== null && start.strikeouts !== null);
}

/** Opponent wRC+ ranks from the production team table. */
export function lookupWrcRanks(wrcTable, opponentAbbr) {
  const teams = Array.isArray(wrcTable?.teams) ? wrcTable.teams : [];
  const target = normalizeTeam(opponentAbbr);
  const row = teams.find((team) => normalizeTeam(team?.abbreviation) === target);
  return {
    wrcRankRecent: finite(row?.recentRank),
    wrcRankSeason: finite(row?.seasonRank),
  };
}

/**
 * Recovers the league K-rate anchor the same way the V3 adapter does, so V3
 * and V4 are regressed toward the identical league level and a difference
 * between them can never be an artifact of two different anchors.
 */
export function resolveLeagueContext({ v3Block = null, v2Block = null, leagueContext = null } = {}) {
  const kRate = finite(leagueContext?.kRate)
    ?? finite(v3Block?.leagueKRate)
    ?? LEAGUE_K_RATE_FALLBACK;
  const ipPerStart = finite(v3Block?.inputs?.leagueIPPerStart) ?? LEAGUE_IP_PER_START_FALLBACK;
  const bfPerIP = finite(v3Block?.inputs?.leagueBFPerIP) ?? LEAGUE_BF_PER_IP_FALLBACK;
  return {
    kRate,
    ipPerStart,
    bfPerIP,
    kPerIP: kRate * bfPerIP,
    source: v3Block?.inputs?.leagueIPPerStart != null ? "slate-league-context" : "fallback",
  };
}

/**
 * Opponent strikeout splits.
 *
 * `kRateVsHand` prefers the true handedness split; production frequently has
 * it unavailable (HAND_SPLIT_UNAVAILABLE), in which case the projected LINEUP
 * K rate is used, since a projected lineup already encodes the handedness
 * matchup. Percent-scaled fields are converted to fractions here so the model
 * only ever sees rates.
 */
export function resolveOpponentSplits({ detail, v2Row, pitcherHand, wrcTable, opponentAbbr }) {
  const opponent = v2Row?.inputs?.v2Input?.opponent ?? null;
  const hand = String(pitcherHand ?? "").trim().toUpperCase().startsWith("L") ? "L" : "R";
  const vsHand = hand === "L" ? finite(opponent?.vsLhpKRate) : finite(opponent?.vsRhpKRate);

  const lineupRate = finite(opponent?.projectedLineupKRate);
  const lineupFraction = lineupRate === null ? null : (lineupRate > 1 ? lineupRate / 100 : lineupRate);

  const kRateVsHand = (vsHand !== null && vsHand > 0) ? vsHand : lineupFraction;
  const kRateVsHandSource = (vsHand !== null && vsHand > 0)
    ? "opponent.vsHandKRate"
    : (lineupFraction !== null ? "opponent.projectedLineupKRate" : "unavailable");

  const recentKRate = finite(detail?.opponentContext?.last10?.kRate) ?? finite(opponent?.recentKRate);

  return {
    kRateVsHand,
    kRateVsHandSource,
    recentKRate,
    ...lookupWrcRanks(wrcTable, opponentAbbr),
  };
}

/**
 * Builds the full V4 block for one pitcher row.
 *
 * @param {object} args
 * @param {object} args.detail        strikeout-prop-details row
 * @param {object} args.v2Row         k-props-v2-shadow row (for v2/v3 blocks + inputs)
 * @param {object} args.workloadRow   k-workload-shadow row (role)
 * @param {object|object[]} args.startLog research start log (opposing-starter baselines)
 * @param {object} args.wrcTable      team-wrc-plus.json
 * @param {string} args.slateDate
 */
export function buildV4Projection({
  detail = null,
  v2Row = null,
  workloadRow = null,
  startLog = [],
  wrcTable = null,
  slateDate,
  config = V4_DEFAULTS,
} = {}) {
  const role = workloadRow?.role ?? null;
  if (role !== null && !V4_SUPPORTED_ROLES.includes(role)) {
    return declineV4(`ROLE_OUT_OF_V4_SCOPE_${String(role).toUpperCase()}`, slateDate, role);
  }

  const opponentAbbr = normalizeTeam(detail?.opponent ?? v2Row?.pitcher?.opponent);
  const pitcherStarts = buildPitcherStarts(detail);
  const seasonOverride = buildSeasonOverride(detail);
  const opponentObservations = buildOpponentObservations(detail, slateDate);

  // The baseline explicitly EXCLUDES prior starts against this same opponent,
  // so a team that has already suppressed a pitcher cannot have that
  // suppression baked into the denominator it is then measured against.
  const baselineFor = createStartLogBaselineResolver(buildStartLogRows(startLog), {
    excludeOpponent: opponentAbbr,
  });

  const leagueContext = resolveLeagueContext({
    v3Block: v2Row?.v3 ?? null,
    v2Block: v2Row?.v2 ?? null,
  });

  const opponentSplits = resolveOpponentSplits({
    detail,
    v2Row,
    pitcherHand: detail?.pitcherHand ?? v2Row?.pitcher?.handedness,
    wrcTable,
    opponentAbbr,
  });

  const projection = computeKProjectionV4({
    pitcherStarts,
    opponentObservations,
    baselineFor,
    asOfDate: slateDate,
    role,
    leagueContext,
    opponentSplits,
    seasonOverride,
    config,
  });

  const v2Ks = finite(v2Row?.v2?.projectedStrikeouts);
  const v3Ks = finite(v2Row?.v3?.projectedKs);
  const v2Ip = finite(v2Row?.v2?.projectedInnings);
  const v3Ip = finite(v2Row?.v3?.finalProjectedIP);
  const ks = finite(projection.projectedKs);
  const ip = finite(projection.finalProjectedIP);

  return {
    ...projection,
    opponent: opponentAbbr,
    opponentKRateVsHandSource: opponentSplits.kRateVsHandSource,
    leagueContextSource: leagueContext.source,
    // ---- side by side with the models V4 would replace ----
    v4MinusV3Ks: ks === null || v3Ks === null ? null : Number((ks - v3Ks).toFixed(3)),
    v4MinusV2Ks: ks === null || v2Ks === null ? null : Number((ks - v2Ks).toFixed(3)),
    v4MinusV3IP: ip === null || v3Ip === null ? null : Number((ip - v3Ip).toFixed(3)),
    v4MinusV2IP: ip === null || v2Ip === null ? null : Number((ip - v2Ip).toFixed(3)),
  };
}

export default buildV4Projection;
