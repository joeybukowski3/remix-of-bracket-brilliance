/**
 * JKB projected spread model — nfl-spread-v0.1.0.
 *
 * A predictive point-margin model, deliberately separate from the descriptive
 * public power rating (nfl-power-v0.3.1). The two share the same football
 * inputs but are calibrated for different jobs:
 *
 *   nfl-power-v0.3.1  balanced descriptive team rating, 40/40/20, 1-99 scale
 *   nfl-spread-v0.1.0 future scoring margin, 45/35/20, points scale
 *
 * The 45/35 split exists because Phase 8 backtesting found offence modestly
 * more predictive of future margin than defence; the public rating stays
 * balanced because it describes a season rather than forecasting one.
 *
 * MARKET DATA NEVER ENTERS THIS MODULE. No spread, moneyline, total, ATS or
 * over/under value participates in the sample, the opponent adjustment, the
 * composite, the beta fit or the prediction. Market comparison happens only in
 * the consumer layer, after a projection already exists.
 *
 * EPA is the Phase 6 nflfastR play-by-play definition (matchup-epa-v1); the
 * legacy stats_team_week EPA is never used here.
 */

export const NFL_SPREAD_MODEL_VERSION = "nfl-spread-v0.1.0";

/** Composite weights. Defence is inverted before weighting. */
export const SPREAD_WEIGHTS = Object.freeze({ off: 0.45, def: 0.35, pdg: 0.2 });

/** Prior-season games-equivalent. Validated in Phase 8B against K = 0,2,3,4,6. */
export const SPREAD_PRIOR_K = 2;

/** Fixed league-wide home-field advantage, in points. Never fitted. */
export const SPREAD_HFA_POINTS = 2.0;

/**
 * A game counts as an available input only once it has actually finished.
 *
 * Kickoff alone is not enough: a Sunday 1pm result is not known to another
 * Sunday 1pm game. Three and a half hours is the practical NFL game length, so
 * `kickoff + 3.5h <= targetKickoff` reproduces what a pre-kickoff production
 * run could genuinely have seen. Week numbers are never used for this.
 */
export const GAME_COMPLETION_MS = 3.5 * 60 * 60 * 1000;

export const SPREAD_EPA_DEFINITION = "matchup-epa-v1";
export const SPREAD_EPA_SOURCE = "nflverse play-by-play (nflfastR EPA)";

/** Prior-season weight for one team: K / (K + completed current-season games). */
export function priorWeight(nCurrent, k = SPREAD_PRIOR_K) {
  if (!Number.isInteger(nCurrent) || nCurrent < 0) {
    throw new Error(`priorWeight: nCurrent must be a non-negative integer, got ${nCurrent}`);
  }
  return k / (k + nCurrent);
}

/**
 * One row per team per completed regular-season game, joined to its EPA record
 * and its opponent's (which is this team's defence).
 */
export function buildTeamGameLog({ games, results, epaByKey }) {
  const finals = new Map();
  for (const r of results) {
    if (r.seasonType === "REG" && r.final === true) finals.set(r.gameId, r);
  }
  const rows = [];
  for (const g of games) {
    if (g.seasonType !== "REG") continue;
    const res = finals.get(g.gameId);
    if (!res) continue;
    const kickoff = g.dateUtc ? Date.parse(g.dateUtc) : Number.NaN;
    if (!Number.isFinite(kickoff)) continue;

    for (const side of ["home", "away"]) {
      const team = side === "home" ? res.homeAbbr : res.awayAbbr;
      const opponent = side === "home" ? res.awayAbbr : res.homeAbbr;
      const own = epaByKey.get(`${g.gameId}|${team}`);
      const opp = epaByKey.get(`${g.gameId}|${opponent}`);
      if (!own || !opp) continue;
      if (own.opponent !== opponent) {
        throw new Error(`${g.gameId}: EPA opponent ${own.opponent} does not match results ${opponent}`);
      }
      rows.push({
        gameId: g.gameId,
        season: g.season,
        week: g.week,
        kickoff,
        team,
        opponent,
        margin: side === "home" ? res.homeScore - res.awayScore : res.awayScore - res.homeScore,
        offEpa: own.offEpa,
        offPlays: own.offPlays,
        defEpa: opp.offEpa,
        defPlays: opp.offPlays,
      });
    }
  }
  rows.sort((a, b) => a.kickoff - b.kickoff || a.gameId.localeCompare(b.gameId));
  return rows;
}

/** Index a team-game log by team, preserving kickoff order. */
export function indexLogByTeam(log) {
  const byTeam = new Map();
  for (const row of log) {
    if (!byTeam.has(row.team)) byTeam.set(row.team, []);
    byTeam.get(row.team).push(row);
  }
  return byTeam;
}

/**
 * One team's weighted sample as of `cutoffMs`.
 *
 * EPA sums weighted numerators over weighted denominators — rates are never
 * averaged. Point differential is a per-game observation, so it uses a weighted
 * mean over games with no play-count denominator.
 *
 * Returns null when the team has no eligible history at all.
 */
export function teamSample(teamRows, { cutoffMs, season, k = SPREAD_PRIOR_K }) {
  const available = teamRows.filter((r) => r.kickoff + GAME_COMPLETION_MS <= cutoffMs);
  const current = available.filter((r) => r.season === season);
  const prior = available.filter((r) => r.season === season - 1);
  if (current.length === 0 && prior.length === 0) return null;

  const w = priorWeight(current.length, k);
  const weighted = [
    ...prior.map((r) => ({ row: r, weight: w })),
    ...current.map((r) => ({ row: r, weight: 1 })),
  ];

  let offEpa = 0, offPlays = 0, defEpa = 0, defPlays = 0, marginW = 0, weightSum = 0;
  const opponents = [];
  for (const { row, weight } of weighted) {
    offEpa += weight * row.offEpa;
    offPlays += weight * row.offPlays;
    defEpa += weight * row.defEpa;
    defPlays += weight * row.defPlays;
    marginW += weight * row.margin;
    weightSum += weight;
    opponents.push({ team: row.opponent, weight });
  }
  if (!(offPlays > 0) || !(defPlays > 0) || !(weightSum > 0)) return null;

  return {
    team: teamRows[0].team,
    off: offEpa / offPlays,
    def: defEpa / defPlays,
    pdg: marginW / weightSum,
    opponents,
    priorWeight: w,
    priorGames: prior.length,
    currentGames: current.length,
    sampleGames: weighted.length,
    sampleGameIds: weighted.map(({ row }) => row.gameId),
    priorSeason: prior.length > 0 ? season - 1 : null,
  };
}

/** Every team's sample at one cutoff. */
export function leagueSnapshot(byTeam, teams, options) {
  const snapshot = new Map();
  for (const team of teams) {
    const rows = byTeam.get(team);
    if (!rows || rows.length === 0) continue;
    const sample = teamSample(rows, options);
    if (sample) snapshot.set(team, sample);
  }
  return snapshot;
}

/**
 * One-pass opponent adjustment, matching the validated v0.3 method.
 *
 * Phase 8 measured an iterative solve at 0.005 MAE better with slightly worse
 * winner accuracy, so the simpler validated method is kept deliberately.
 */
export function adjustOnePass(snapshot) {
  const teams = [...snapshot.keys()];
  if (teams.length === 0) throw new Error("adjustOnePass: empty snapshot");
  const avg = (pick) => teams.reduce((s, t) => s + pick(snapshot.get(t)), 0) / teams.length;
  const leagueOff = avg((s) => s.off);
  const leagueDef = avg((s) => s.def);
  const leaguePdg = avg((s) => s.pdg);

  const adjusted = new Map();
  for (const team of teams) {
    const s = snapshot.get(team);
    const opps = s.opponents.filter((o) => snapshot.has(o.team));
    const wsum = opps.reduce((a, o) => a + o.weight, 0);
    const oppMean = (pick) =>
      wsum > 0 ? opps.reduce((a, o) => a + o.weight * pick(snapshot.get(o.team)), 0) / wsum : 0;

    adjusted.set(team, {
      ...s,
      offAdj: s.off - (oppMean((x) => x.def) - leagueDef),
      defAdj: s.def - (oppMean((x) => x.off) - leagueOff),
      pdgAdj: s.pdg + (oppMean((x) => x.pdg) - leaguePdg),
    });
  }
  return adjusted;
}

/** Population z-scores. A zero-variance league is a hard failure, never 0/0. */
export function populationZ(values, label) {
  const n = values.length;
  if (n === 0) throw new Error(`populationZ: no values for ${label}`);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (!(sd > 0) || !Number.isFinite(sd)) {
    throw new Error(`populationZ: zero or non-finite standard deviation for ${label}`);
  }
  return values.map((v) => (v - mean) / sd);
}

/**
 * Composite strength z for every team.
 *
 * 0.45·z(offAdj) + 0.35·z(−defAdj) + 0.20·z(pdgAdj), unrounded and unclamped.
 * Defence is negated first because a lower EPA allowed is better.
 */
export function compositeStrength(adjusted, weights = SPREAD_WEIGHTS) {
  const teams = [...adjusted.keys()];
  const zOff = populationZ(teams.map((t) => adjusted.get(t).offAdj), "offAdj");
  const zDef = populationZ(teams.map((t) => -adjusted.get(t).defAdj), "defAdj (inverted)");
  const zPdg = populationZ(teams.map((t) => adjusted.get(t).pdgAdj), "pdgAdj");

  const out = new Map();
  teams.forEach((team, i) => {
    const z = weights.off * zOff[i] + weights.def * zDef[i] + weights.pdg * zPdg[i];
    if (!Number.isFinite(z)) throw new Error(`compositeStrength: non-finite composite for ${team}`);
    out.set(team, { ...adjusted.get(team), zOff: zOff[i], zDef: zDef[i], zPdg: zPdg[i], compositeZ: z });
  });
  return out;
}

/** Home-field advantage for one game. Neutral sites get exactly zero. */
export function homeFieldFor(neutralSite, hfa = SPREAD_HFA_POINTS) {
  return neutralSite ? 0 : hfa;
}

/**
 * Fit beta by closed form, with the fixed HFA removed from the target first.
 *
 * beta = Σ[d·(margin − HFA)] / Σ[d²]
 *
 * HFA is NOT fitted — it is subtracted as a known constant, leaving beta as the
 * model's only free parameter.
 */
export function fitBeta(observations, hfa = SPREAD_HFA_POINTS) {
  let numerator = 0;
  let denominator = 0;
  let used = 0;
  for (const o of observations) {
    if (!Number.isFinite(o.strengthDiff) || !Number.isFinite(o.margin)) continue;
    const home = homeFieldFor(o.neutralSite, hfa);
    numerator += o.strengthDiff * (o.margin - home);
    denominator += o.strengthDiff * o.strengthDiff;
    used += 1;
  }
  if (used === 0) throw new Error("fitBeta: no usable observations");
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    throw new Error("fitBeta: zero or non-finite denominator");
  }
  const beta = numerator / denominator;
  if (!Number.isFinite(beta)) throw new Error("fitBeta: non-finite beta");
  return { beta, observations: used };
}

/**
 * Project one game.
 *
 * projectedHomeMargin = beta·(compositeZ_home − compositeZ_away) + HFA
 * Positive means the HOME team is favoured by that many points.
 */
export function projectGame({ homeStrength, awayStrength, neutralSite, beta, hfa = SPREAD_HFA_POINTS }) {
  if (!Number.isFinite(homeStrength) || !Number.isFinite(awayStrength)) {
    throw new Error("projectGame: non-finite team strength");
  }
  if (!Number.isFinite(beta)) throw new Error("projectGame: non-finite beta");
  const strengthDiff = homeStrength - awayStrength;
  const neutralMargin = beta * strengthDiff;
  const homeFieldAdvantage = homeFieldFor(neutralSite, hfa);
  return {
    strengthDiff,
    neutralMargin,
    homeFieldAdvantage,
    projectedHomeMargin: neutralMargin + homeFieldAdvantage,
  };
}

/**
 * Conventional spread notation from a projected home margin.
 *
 * +3.2 -> home favoured, "Home -3.2"; -2.1 -> "Away -2.1"; 0 -> pick'em.
 * Rounding happens here and only here — callers keep the unrounded margin.
 */
export function toConventionalSpread(projectedHomeMargin, { homeTeam, awayTeam }) {
  const rounded = Math.round(projectedHomeMargin * 10) / 10;
  if (rounded === 0) {
    return { favoriteTeam: null, line: 0, display: "PK" };
  }
  const favoriteTeam = rounded > 0 ? homeTeam : awayTeam;
  const line = -Math.abs(rounded);
  return { favoriteTeam, line, display: `${favoriteTeam.toUpperCase()} ${line.toFixed(1)}` };
}
