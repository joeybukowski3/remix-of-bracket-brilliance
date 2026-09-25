/**
 * Point-in-time offensive snap-count features (nflverse/PFR `snap_counts`).
 *
 * RESEARCH/SHADOW INPUT ONLY -- nothing here feeds the public production projection.
 *
 * Every feature for a target (season, week) is computed strictly from REG games with (season, week) chronologically BEFORE the target, so a
 * target-week row, a partially published current week, or any later week can never contribute. Definitions are frozen alongside the shadow
 * candidate coefficients (see `shadow-candidates/spec.ts`); changing them requires a new candidate version.
 */

export const SNAP_FEATURE_VERSION = "point-in-time-snap-features-v1" as const;
/** Trailing window, in games with a snap-count row, crossing season boundaries. */
export const SNAP_TRAILING_GAMES = 3;

export type SnapCountRow = {
  season: number;
  week: number;
  pfrPlayerId: string;
  team: string;
  position: string;
  offenseSnaps: number;
  /** nflverse `offense_pct` as a 0..1 fraction. */
  offensePct: number | null;
};

export type SnapSourceProvenance = {
  season: number | null;
  filename: string;
  sha256: string;
  retrievedDateUtc: string;
  rowCount: number;
};

export type PointInTimeSnapFeatures = {
  featureVersion: typeof SNAP_FEATURE_VERSION;
  target: { season: number; week: number };
  /** True when at least one prior game with a usable snap share exists. */
  available: boolean;
  /** Mean `offense_pct` over the last SNAP_TRAILING_GAMES prior games. */
  snapShareL3: number | null;
  /** Mean offensive snaps over the same games. */
  offenseSnapsL3: number | null;
  /** Mean `offense_pct` over prior games of the TARGET season. */
  snapShareSeasonToDate: number | null;
  /** Prior target-season games with offense_snaps > 0. */
  gamesPlayedSeasonPrior: number;
  gamesUsedL3: number;
  lastGame: { season: number; week: number; team: string } | null;
  sourceGames: readonly { season: number; week: number; team: string; offenseSnaps: number; offensePct: number | null }[];
};

export type SnapIndex = ReadonlyMap<string, readonly SnapCountRow[]>;

const chron = (row: { season: number; week: number }): number => row.season * 100 + row.week;

function requireNumber(value: string | undefined, field: string): number {
  const parsed = Number(value);
  if (value === undefined || value === "" || !Number.isFinite(parsed)) throw new Error(`Invalid snap-count field ${field}: "${value}"`);
  return parsed;
}

/** Parses verified nflverse snap rows; non-REG rows are dropped, malformed numeric fields throw. */
export function parseSnapCountRows(rows: readonly Record<string, string>[]): SnapCountRow[] {
  const out: SnapCountRow[] = [];
  for (const row of rows) {
    if (String(row.game_type ?? "").toUpperCase() !== "REG") continue;
    const pfrPlayerId = String(row.pfr_player_id ?? "").trim();
    if (!pfrPlayerId) continue;
    const pctRaw = row.offense_pct;
    const pct = pctRaw === undefined || pctRaw === "" ? null : requireNumber(pctRaw, "offense_pct");
    if (pct != null && (pct < 0 || pct > 1.0001)) throw new Error(`offense_pct out of range for ${pfrPlayerId}: ${pct}`);
    out.push({
      season: requireNumber(row.season, "season"), week: requireNumber(row.week, "week"),
      pfrPlayerId, team: String(row.team ?? "").trim().toLowerCase(), position: String(row.position ?? "").trim(),
      offenseSnaps: requireNumber(row.offense_snaps || "0", "offense_snaps"), offensePct: pct,
    });
  }
  return out;
}

/** Index by PFR id, chronological; a player with two rows in one week (mid-week trade) keeps the higher share. */
export function buildSnapIndex(rows: readonly SnapCountRow[]): SnapIndex {
  const byPlayer = new Map<string, Map<number, SnapCountRow>>();
  for (const row of rows) {
    const games = byPlayer.get(row.pfrPlayerId) ?? new Map<number, SnapCountRow>();
    const existing = games.get(chron(row));
    if (!existing || (row.offensePct ?? -1) > (existing.offensePct ?? -1)) games.set(chron(row), row);
    byPlayer.set(row.pfrPlayerId, games);
  }
  const index = new Map<string, SnapCountRow[]>();
  for (const [id, games] of byPlayer) index.set(id, [...games.values()].sort((a, b) => chron(a) - chron(b)));
  return index;
}

const mean = (values: readonly number[]): number | null => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function pointInTimeSnapFeatures(index: SnapIndex, pfrPlayerId: string | null, target: { season: number; week: number }): PointInTimeSnapFeatures {
  const cutoff = chron(target);
  const prior = (pfrPlayerId ? index.get(pfrPlayerId) ?? [] : []).filter((row) => chron(row) < cutoff);
  const usable = prior.filter((row) => row.offensePct != null);
  const last = usable.slice(-SNAP_TRAILING_GAMES);
  const seasonPrior = prior.filter((row) => row.season === target.season);
  const lastRow = last.length ? last[last.length - 1] : null;
  return {
    featureVersion: SNAP_FEATURE_VERSION, target: { season: target.season, week: target.week },
    available: last.length > 0,
    snapShareL3: mean(last.map((row) => row.offensePct as number)),
    offenseSnapsL3: mean(last.map((row) => row.offenseSnaps)),
    snapShareSeasonToDate: mean(seasonPrior.filter((row) => row.offensePct != null).map((row) => row.offensePct as number)),
    gamesPlayedSeasonPrior: seasonPrior.filter((row) => row.offenseSnaps > 0).length,
    gamesUsedL3: last.length,
    lastGame: lastRow ? { season: lastRow.season, week: lastRow.week, team: lastRow.team } : null,
    sourceGames: last.map((row) => ({ season: row.season, week: row.week, team: row.team, offenseSnaps: row.offenseSnaps, offensePct: row.offensePct })),
  };
}

/** gsis_id -> pfr_id from the manifest-verified nflverse players cache. */
export function buildGsisToPfr(players: readonly Record<string, string>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of players) {
    const gsis = String(row.gsis_id ?? "").trim(); const pfr = String(row.pfr_id ?? "").trim();
    if (gsis && pfr && !map.has(gsis)) map.set(gsis, pfr);
  }
  return map;
}

/** `gsis:00-0012345` (canonical fantasy player id) -> raw GSIS id. */
export const rawGsisId = (playerId: string): string | null => (playerId.startsWith("gsis:") ? playerId.slice(5) : null);

/**
 * Prior weeks of `season` (weeks < `targetWeek`) whose row count looks incomplete. nflverse publishes a week's snap counts after its games; a
 * Monday-night game may lag a Tuesday generation. Consumers must treat these as `lagging`, never as complete.
 */
export function laggingPriorWeeks(rows: readonly SnapCountRow[], season: number, targetWeek: number, minRowsPerCompleteWeek = 1000): number[] {
  const counts = new Map<number, number>();
  for (const row of rows) if (row.season === season && row.week < targetWeek) counts.set(row.week, (counts.get(row.week) ?? 0) + 1);
  const lagging: number[] = [];
  for (let week = 1; week < targetWeek; week += 1) if ((counts.get(week) ?? 0) < minRowsPerCompleteWeek) lagging.push(week);
  return lagging;
}
