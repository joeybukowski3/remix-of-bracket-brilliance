/**
 * Shared engine for the NFL total-model "scoring support" compact
 * per-team-game aggregate (EPA/play, traditional down-and-distance success
 * rate, explosive-play rate -- offense side only; defense-allowed is derived
 * downstream by reading the opponent's offense row for the same game).
 *
 * This module is the SINGLE source of truth for the aggregation semantics.
 * Both the research builder
 * (scripts/analysis/nfl-total-model-research/fetch-scoring-support-cache.mjs)
 * and the production refresh
 * (scripts/refresh-nfl-scoring-support-cache.mjs) import it, so the two can
 * never silently disagree about what counts as an eligible play, what
 * "traditional success" means, or what an "explosive play" is. Parity is
 * additionally proven end-to-end in
 * src/lib/nfl/props/totals/scoringSupportProductionParity.test.ts (the
 * committed production CSVs must reproduce the committed research CSVs
 * row-for-row for the completed seasons).
 *
 * Definitions mirror scripts/analysis/nfl-performance-backtest/lib/
 * metrics-engine.mjs exactly (same eligible-play filter, same traditional
 * success-rate thresholds, same explosive-play thresholds), UNFILTERED for
 * garbage time -- see docs/modeling/JKB_MODELING_MASTER_SPEC.md Phase C.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

export const SCORING_SUPPORT_PBP_COLUMNS = [
  "game_id", "season", "season_type", "week", "posteam", "defteam",
  "qtr", "down", "ydstogo", "yards_gained", "pass", "rush",
  "two_point_attempt", "epa",
];

export const SCORING_SUPPORT_COMPACT_COLUMNS = [
  "game_id", "season", "week", "team", "opponent",
  "eligible_plays", "off_epa_sum", "success_num", "success_den", "explosive_count",
];

export const SCORING_SUPPORT_ELIGIBLE_PLAY_FILTER =
  "(pass == 1 OR rush == 1) AND epa is present AND posteam is present AND two_point_attempt != 1";
export const SCORING_SUPPORT_SUCCESS_RATE_DEFINITION =
  "Traditional down-and-distance: 1st >= 0.4*ydstogo, 2nd >= 0.6*ydstogo, 3rd/4th >= ydstogo. NOT nflfastR's EPA>0 `success` field.";
export const SCORING_SUPPORT_EXPLOSIVE_PLAY_DEFINITION =
  "pass play with yards_gained >= 15, or rush play with yards_gained >= 10.";
export const SCORING_SUPPORT_GARBAGE_TIME_FILTER =
  "NOT APPLIED -- unfiltered (all plays). Documented simplification vs. production performanceComposite2026.ts.";
export const SCORING_SUPPORT_SOURCE_LABEL = "nflverse (play-by-play, nflfastR EPA)";
export const SCORING_SUPPORT_ATTRIBUTION = "EPA/play-by-play data: nflverse / nflfastR";

/**
 * Canonical team-code normalization. Deliberately identical to the alias
 * table in src/lib/nfl/identity/identity.ts's normalizeNflTeamAbbr AND to
 * the research builder's own local map -- JAC/JAX -> jax, LA/LAR -> lar,
 * WAS/WSH -> wsh, AZ/ARI -> ari, everything else lower-cased. Kept inline
 * (not imported from the .ts identity module) so this pure .mjs engine has
 * no TypeScript build dependency at runtime, matching every other
 * scripts/lib/*-core.mjs.
 */
const TEAM_ALIASES = {
  JAC: "jax", JAX: "jax",
  LA: "lar", LAR: "lar",
  WAS: "wsh", WSH: "wsh",
  AZ: "ari", ARI: "ari",
};
export function normalizeScoringSupportTeam(code) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return null;
  return TEAM_ALIASES[c] ?? c.toLowerCase();
}

export function nflverseScoringSupportPbpUrl(season) {
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
}

export function splitCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

const num = (v) => {
  const t = String(v ?? "").trim();
  if (t === "" || t === "NA") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

function isEligiblePlay(cells, idx) {
  if (int(cells[idx.two_point_attempt]) === 1) return null;
  if (String(cells[idx.posteam] ?? "").trim() === "") return null;
  if (num(cells[idx.epa]) === null) return null;
  if (int(cells[idx.pass]) === 1) return "pass";
  if (int(cells[idx.rush]) === 1) return "rush";
  return null;
}

/** Traditional down-and-distance success -- NOT nflfastR's EPA>0 `success` field. */
function traditionalSuccess(down, ydstogo, yardsGained) {
  if (!(ydstogo > 0) || yardsGained === null) return null;
  if (down === 1) return yardsGained >= 0.4 * ydstogo;
  if (down === 2) return yardsGained >= 0.6 * ydstogo;
  if (down === 3 || down === 4) return yardsGained >= ydstogo;
  return null;
}

function isExplosive(playType, yardsGained) {
  if (yardsGained === null) return false;
  if (playType === "pass") return yardsGained >= 15;
  if (playType === "rush") return yardsGained >= 10;
  return false;
}

function emptyTeamGame(gameId, season, week, team, opponent) {
  return {
    game_id: gameId, season, week, team, opponent,
    eligible_plays: 0, off_epa_sum: 0,
    success_num: 0, success_den: 0,
    explosive_count: 0,
  };
}

/**
 * Aggregate an iterable of raw PBP cell-arrays (already split) to one row
 * per (game_id, team). `idx` maps SCORING_SUPPORT_PBP_COLUMNS -> column
 * index. REG-season filtering is the caller's responsibility for the stream
 * path; this helper also skips non-REG rows itself for the fixture path.
 */
export function aggregateScoringSupportRows(cellRows, idx) {
  const teamGames = new Map();
  let sourceRows = 0;
  let keptRows = 0;
  for (const cells of cellRows) {
    sourceRows += 1;
    if (cells[idx.season_type] !== "REG") continue;
    const playType = isEligiblePlay(cells, idx);
    if (!playType) continue;
    keptRows += 1;

    const gameId = cells[idx.game_id];
    const season = int(cells[idx.season]);
    const week = int(cells[idx.week]);
    const team = normalizeScoringSupportTeam(cells[idx.posteam]);
    const opponent = normalizeScoringSupportTeam(cells[idx.defteam]);
    const key = `${gameId}|${team}`;
    if (!teamGames.has(key)) teamGames.set(key, emptyTeamGame(gameId, season, week, team, opponent));
    const row = teamGames.get(key);

    row.eligible_plays += 1;
    row.off_epa_sum += num(cells[idx.epa]) ?? 0;

    const down = int(cells[idx.down]);
    const ydstogo = num(cells[idx.ydstogo]);
    const yardsGained = num(cells[idx.yards_gained]);
    const success = traditionalSuccess(down, ydstogo, yardsGained);
    if (success !== null) {
      row.success_den += 1;
      if (success) row.success_num += 1;
    }
    if (isExplosive(playType, yardsGained)) row.explosive_count += 1;
  }
  return { rows: [...teamGames.values()], sourceRows, keptRows };
}

/** Stream one season's gzipped nflverse PBP and aggregate it. Network. */
export async function streamScoringSupportSeason(season, { fetchImpl = fetch, userAgent } = {}) {
  const url = nflverseScoringSupportPbpUrl(season);
  const response = await fetchImpl(url, {
    headers: { "User-Agent": userAgent ?? "JoeKnowsBall-nfl-total-model/1.0 (+https://www.joeknowsball.com)", Accept: "application/octet-stream" },
    redirect: "follow",
  });
  if (response.status === 404) return { notPublished: true };
  if (!response.ok) throw new Error(`${season}: HTTP ${response.status} fetching play-by-play`);

  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.byteLength === 0) throw new Error(`${season}: empty play-by-play response`);

  const lines = createInterface({
    input: Readable.from(compressed).pipe(createGunzip()),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let header = null;
  let idx = null;
  const cellRows = [];
  for await (const line of lines) {
    if (line === "") continue;
    if (header === null) {
      header = splitCsvLine(line);
      const missing = SCORING_SUPPORT_PBP_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) throw new Error(`${season}: play-by-play missing columns ${missing.join(", ")}`);
      idx = Object.fromEntries(SCORING_SUPPORT_PBP_COLUMNS.map((c) => [c, header.indexOf(c)]));
      continue;
    }
    cellRows.push(splitCsvLine(line));
  }

  const { rows, sourceRows, keptRows } = aggregateScoringSupportRows(cellRows, idx);
  return {
    notPublished: false,
    rows,
    sourceRows,
    keptRows,
    compressedBytes: compressed.byteLength,
    headerColumnCount: header.length,
  };
}

/** Serialize aggregated rows to the compact CSV, columns fixed and ordered. */
export function serializeScoringSupportCompact(rows) {
  const lines = [SCORING_SUPPORT_COMPACT_COLUMNS.join(",")];
  for (const row of rows) lines.push(SCORING_SUPPORT_COMPACT_COLUMNS.map((c) => row[c]).join(","));
  return lines.join("\n") + "\n";
}
