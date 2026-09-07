/**
 * RESEARCH ONLY -- study mlb-k-projection-v3-workload-model
 *
 * Full readable v3 decomposition for Gavin Williams (2026-09-06 vs DET) and
 * three additional pitchers, reconstructed from pregame inputs only.
 *
 * The Gavin row is a VALIDATION EXAMPLE, not a fitting target: no weight, cap or
 * threshold anywhere in the model was chosen by looking at it. His 2026-09-06
 * start is also the last slate in the archive and has no graded outcome, so it
 * is reported as a pregame decomposition with the market line shown for context
 * and never used as an input.
 *
 * The three additional pitchers are picked deterministically from the graded
 * sample -- largest v3-minus-v2 workload move up, largest move down, and the
 * median absolute move -- so the selection cannot be steered toward flattering
 * cases.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { PRODUCTION_ALPHA, projectWithAlpha, recoverLeagueAnchor } from "./lib/mlb-k-shrinkage-helpers.mjs";
import { round } from "./lib/mlb-k-shrinkage-metrics.mjs";
import { attachV3Workload, buildEvaluationRows, buildLeagueCentreIndex, loadSources } from "./lib/mlb-k-v3-dataset.mjs";

import { DEFAULTS } from "../mlb-k/mlb-k-workload-v3-core.mjs";
import { OPPONENT_DEFAULTS } from "../mlb-k/mlb-k-opponent-sp-workload-v3.mjs";
import { SAMPLE_SIZE_ALPHA_K, sampleSizeAlpha } from "../lib/mlb-k-projection-v3.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
const BASE = path.join(ROOT, "data", "mlb", "k-research", "high-line-calibration");
mkdirSync(OUT, { recursive: true });

const writeJson = (file, payload) => writeFileSync(path.join(OUT, file), `${JSON.stringify(payload, null, 2)}\n`);

const selected = JSON.parse(readFileSync(path.join(OUT, "selected-config.json"), "utf8"));
const CONFIG = selected.config ?? DEFAULTS;
const OPP = selected.opponentConfig ?? OPPONENT_DEFAULTS;

const sources = loadSources(ROOT);
const dataset = buildEvaluationRows(sources);
const { rows: gradedRows, startLog, logByPitcher, leagueIndex } = dataset;

/**
 * The Gavin row is UNGRADED (2026-09-06 has no resolved outcome in the
 * archive), so it is not in the evaluation set. It is rebuilt here directly
 * from the pregame archive, using exactly the same enrichment the evaluation
 * rows get.
 */
const archive = sources.archive;
const venueByKey = new Map(sources.venue.entries.map((e) => [`${e.slateDate}|${e.pitcherId}`, e]));
const bfByKey = new Map(sources.seasonBf.entries.map((e) => [`${e.slateDate}|${e.pitcherId}`, e]));
const leagueIpAsOfDate = (date) => {
  const dates = leagueIndex.dates;
  let value = null;
  for (const d of dates) {
    if (d < date) value = leagueIndex.index.get(d);
    else break;
  }
  return value ?? leagueIndex.finalMean;
};

const gavinPregame = archive.rows.find(
  (row) => row.slateDate === "2026-09-06" && String(row.pitcher ?? "").includes("Gavin Williams"),
);
if (!gavinPregame) throw new Error("Gavin Williams 2026-09-06 row not found in the pregame archive");

const enrich = (row) => {
  const key = `${row.slateDate}|${row.pitcherId}`;
  return {
    ...row,
    // The evaluation rows get this in buildEvaluationRows; a raw archive row
    // (an ungraded slate, like Gavin's) has to have it recovered here too.
    leagueAnchor: row.leagueAnchor ?? recoverLeagueAnchor(row.v2OpponentEnvRate, row.v2MatchupAdjustment),
    seasonSplit: venueByKey.get(key) ?? null,
    seasonBattersFaced: bfByKey.get(key)?.seasonBattersFaced ?? null,
    pitcherLog: logByPitcher.get(row.pitcherId) ?? [],
    leagueIpPerStart: leagueIpAsOfDate(row.slateDate),
  };
};

const allForCentre = [...gradedRows, enrich(gavinPregame)];
const leagueCentreIndex = buildLeagueCentreIndex({
  rows: allForCentre,
  startLog,
  logByPitcher,
  leagueIndex,
});

/** Builds the full readable decomposition the work unit asks for. */
function decompose(row) {
  const [attached] = attachV3Workload([row], {
    startLog,
    logByPitcher,
    config: CONFIG,
    opponentConfig: OPP,
    leagueCentreIndex,
  });
  const v3 = attached.v3;
  const bf = v3.battersFaced.projectedBattersFaced;
  const { alpha, source } = sampleSizeAlpha(row.seasonBattersFaced, SAMPLE_SIZE_ALPHA_K);

  const v3Projection = projectWithAlpha({
    alpha,
    pitcherSkillRate: row.v2PitcherSkillRate,
    leagueAnchor: row.leagueAnchor,
    matchupAdjustment: row.v2MatchupAdjustment,
    projectedBF: bf,
  });
  const v2Replay = projectWithAlpha({
    alpha: PRODUCTION_ALPHA,
    pitcherSkillRate: row.v2PitcherSkillRate,
    leagueAnchor: row.leagueAnchor,
    matchupAdjustment: row.v2MatchupAdjustment,
    projectedBF: row.v2ProjectedBF,
  });

  const line = row.kLine;
  const edge = v3Projection && Number.isFinite(line) ? v3Projection.projectedKs - line : null;

  return {
    identity: {
      pitcher: row.pitcher,
      pitcherId: row.pitcherId,
      slateDate: row.slateDate,
      team: row.team,
      opponent: row.opponent,
      pitcherIsHome: row.pitcherIsHome,
      handedness: row.handedness,
      gamePk: row.gamePk,
    },
    workload: {
      seasonIPPerStart: v3.workload.seasonIPPerStart,
      last10IPPerStart: v3.workload.last10IPPerStart,
      last5IPPerStart: v3.workload.last5IPPerStart,
      last10RawIPPerStart: v3.workload.last10RawIPPerStart,
      last5RawIPPerStart: v3.workload.last5RawIPPerStart,
      neutralIP: v3.workload.neutralIP,
      currentRegimeAdjustment: v3.workload.currentRegimeAdjustment,
      siteAdjustment: v3.workload.siteAdjustment,
      opponentAdjustment: v3.workload.opponentAdjustment,
      finalProjectedIP: v3.workload.finalProjectedIP,
      v2ProjectedInnings: row.v2ProjectedInnings,
    },
    regime: v3.regime,
    site: v3.site,
    opponent: v3.opponent,
    battersFaced: {
      expectedBFPerIP: v3.battersFaced.expectedBFPerIP,
      projectedBattersFaced: bf,
      v2ProjectedBattersFaced: row.v2ProjectedBF,
    },
    kRate: {
      rawPitcherSkillRate: round(row.v2PitcherSkillRate),
      leagueAnchor: round(row.leagueAnchor),
      seasonBattersFaced: row.seasonBattersFaced,
      sampleSizeAlpha: round(alpha),
      alphaSource: source,
      productionAlpha: PRODUCTION_ALPHA,
      shrunkSkillRateV3: round(v3Projection ? v3Projection.shrunkKRate : null),
      shrunkSkillRateV2: round(v2Replay ? v2Replay.shrunkKRate : null),
      opponentEnvironmentRate: round(row.v2OpponentEnvRate),
      matchupAdjustment: round(row.v2MatchupAdjustment),
      finalKRateV3: round(v3Projection ? v3Projection.projectedKRate : null),
      finalKRateV2: round(v2Replay ? v2Replay.projectedKRate : null),
    },
    final: {
      projectedKsV3: round(v3Projection ? v3Projection.projectedKs : null),
      projectedKsV2Replay: round(v2Replay ? v2Replay.projectedKs : null),
      projectedKsV2AsShipped: round(row.v2ProjectedKs),
      marketLine: line,
      oddsOver: row.oddsOver ?? null,
      oddsUnder: row.oddsUnder ?? null,
      edgeVsLine: round(edge),
      direction: edge === null ? null : edge > 0 ? "over" : edge < 0 ? "under" : "neutral",
      actualKs: row.actualKs ?? null,
      actualIP: row.actualIP ?? null,
      actualBF: row.actualBF ?? null,
    },
    flags: v3.flags,
  };
}

// ------------------------------- Gavin -------------------------------

const gavinRow = enrich(gavinPregame);
const gavin = decompose(gavinRow);
gavin.note =
  "Validation example only. No v3 weight, cap or threshold was chosen by inspecting this row. " +
  "The 2026-09-06 slate is the last in the archive and carries no graded outcome, so the market " +
  "line is shown for context and is never a model input.";
gavin.recentStartsUsed = gavinRow.pitcherLog
  .filter((s) => s.date < "2026-09-06")
  .sort((a, b) => (a.date < b.date ? 1 : -1))
  .slice(0, 10)
  .map((s) => ({
    date: s.date,
    opponent: s.opponent,
    site: s.isHome ? "home" : "away",
    ip: round(s.ip, 3),
    bf: s.bf,
    pitches: s.pitches,
    strikeouts: s.strikeouts,
    hits: s.hits,
    walks: s.walks,
  }));
writeJson("gavin-williams-v3.json", gavin);

// ------------------------------- three more -------------------------------

const [withV3] = [
  attachV3Workload(gradedRows, { startLog, logByPitcher, config: CONFIG, opponentConfig: OPP, leagueCentreIndex }),
];
const moved = withV3
  .filter((row) => Number.isFinite(row.v3.battersFaced.projectedBattersFaced) && Number.isFinite(row.v2ProjectedBF))
  .map((row) => ({ row, shift: row.v3.battersFaced.projectedBattersFaced - row.v2ProjectedBF }))
  .sort((a, b) => a.shift - b.shift || a.row.pitcherId - b.row.pitcherId);

const picks = [
  { label: "largest v3 workload move DOWN vs v2", entry: moved[0] },
  { label: "median absolute v3 workload move", entry: [...moved].sort((a, b) => Math.abs(a.shift) - Math.abs(b.shift) || a.row.pitcherId - b.row.pitcherId)[Math.floor(moved.length / 2)] },
  { label: "largest v3 workload move UP vs v2", entry: moved[moved.length - 1] },
];

writeJson("additional-case-studies.json", {
  study: "mlb-k-projection-v3-workload-model",
  generatedAt: new Date().toISOString(),
  selectionRule:
    "Deterministic and outcome-blind: the largest v3-minus-v2 projected batters-faced move down, the " +
    "median absolute move, and the largest move up, with pitcherId as a tie-break. Outcomes are shown " +
    "but were not used to choose the rows.",
  cases: picks.map((pick) => ({
    label: pick.label,
    bfShiftVsV2: round(pick.entry.shift),
    ...decompose(pick.entry.row),
  })),
});

console.log(
  JSON.stringify(
    {
      gavin: {
        season: gavin.workload.seasonIPPerStart,
        last10: gavin.workload.last10IPPerStart,
        last5: gavin.workload.last5IPPerStart,
        neutral: gavin.workload.neutralIP,
        regime: gavin.workload.currentRegimeAdjustment,
        site: gavin.workload.siteAdjustment,
        opponent: gavin.workload.opponentAdjustment,
        finalIP: gavin.workload.finalProjectedIP,
        v2IP: gavin.workload.v2ProjectedInnings,
        bfPerIp: gavin.battersFaced.expectedBFPerIP,
        bf: gavin.battersFaced.projectedBattersFaced,
        v2Bf: gavin.battersFaced.v2ProjectedBattersFaced,
        alpha: gavin.kRate.sampleSizeAlpha,
        kRateV3: gavin.kRate.finalKRateV3,
        kRateV2: gavin.kRate.finalKRateV2,
        ksV3: gavin.final.projectedKsV3,
        ksV2: gavin.final.projectedKsV2Replay,
        line: gavin.final.marketLine,
        edge: gavin.final.edgeVsLine,
        direction: gavin.final.direction,
        detSeasonDelta: gavin.opponent.opponentSeasonDelta,
        detOverRate: gavin.opponent.opponentOverExpectedRate,
      },
      additional: picks.map((p) => ({
        label: p.label,
        pitcher: p.entry.row.pitcher,
        date: p.entry.row.slateDate,
        bfShift: round(p.entry.shift),
      })),
    },
    null,
    1,
  ),
);
