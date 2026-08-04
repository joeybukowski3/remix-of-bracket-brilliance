/**
 * Parsing and normalization for the three nflverse Phase 4 sources.
 *
 *   injuries_{season}.csv      game status, practice status, injury text, gsis_id
 *   roster_weekly_{season}.csv gsis_id -> pfr_id crosswalk, roster/reserve status
 *   snap_counts_{season}.csv   pfr_player_id, offense/defense snaps and published pct
 *
 * Every mapping here is closed: an unexpected non-blank status value is a
 * validation failure, never a silent passthrough or a guessed bucket. That is
 * deliberate — a new upstream designation must be reviewed by a human before it
 * can reach the matchup page.
 *
 * Attribution: nflverse (https://github.com/nflverse/nflverse-data).
 * Snap counts originate with Pro-Football-Reference.
 */

/** Game designations from the official weekly report. Blank is a real state. */
export const GAME_STATUS = Object.freeze({
  OUT: "OUT",
  DOUBTFUL: "DOUBTFUL",
  QUESTIONABLE: "QUESTIONABLE",
});

export const PRACTICE_STATUS = Object.freeze({
  DID_NOT_PARTICIPATE: "DID_NOT_PARTICIPATE",
  LIMITED: "LIMITED",
  FULL: "FULL",
});

export const RESERVE_STATUS = Object.freeze({ RESERVE: "RESERVE" });

const GAME_STATUS_MAP = new Map([
  ["out", GAME_STATUS.OUT],
  ["doubtful", GAME_STATUS.DOUBTFUL],
  ["questionable", GAME_STATUS.QUESTIONABLE],
]);

const PRACTICE_STATUS_MAP = new Map([
  ["did not participate in practice", PRACTICE_STATUS.DID_NOT_PARTICIPATE],
  ["limited participation in practice", PRACTICE_STATUS.LIMITED],
  ["full participation in practice", PRACTICE_STATUS.FULL],
]);

/**
 * Roster status codes. Only RES normalizes to RESERVE.
 *
 * The RES/* sub-codes (R01, R04, R05, R06, R48) demonstrably separate IR from
 * PUP/NFI in the data, but nflverse publishes no authoritative dictionary for
 * them, so they are deliberately collapsed to a single generic RESERVE. Do not
 * label them IR, PUP or NFI until that dictionary is confirmed.
 */
const ROSTER_STATUS_CODES = new Set(["ACT", "INA", "DEV", "RES", "CUT", "RET", "EXE", "TRD", "TRC"]);

/** Specialists whose participation is never a relevance signal. */
export const EXCLUDED_POSITIONS = Object.freeze(["K", "P", "LS"]);

const OFFENSE_POSITIONS = new Set(["QB", "RB", "FB", "HB", "WR", "TE", "T", "OT", "G", "OG", "C", "OL"]);
const DEFENSE_POSITIONS = new Set([
  "DE", "DT", "DL", "NT", "LB", "OLB", "ILB", "MLB", "CB", "S", "FS", "SS", "DB", "EDGE",
]);

/**
 * Offensive/defensive unit for a source position label.
 *
 * The injury feed's own `position` is the authority: it is the label the NFL
 * report carries, it is 100% populated, and it is the field the row is about.
 * The roster's depth_chart_position is finer (OLB vs LB) and is preserved
 * separately for presentation, but it never decides the unit.
 *
 * EDGE is accepted if a source ever emits it; it is never synthesized from
 * DE/LB, because the injury feed does not distinguish edge rushers.
 */
export function positionUnit(position) {
  const key = String(position ?? "").trim().toUpperCase();
  if (key === "") return null;
  if (EXCLUDED_POSITIONS.includes(key)) return null;
  if (OFFENSE_POSITIONS.has(key)) return "offense";
  if (DEFENSE_POSITIONS.has(key)) return "defense";
  return null;
}

export function isExcludedPosition(position) {
  return EXCLUDED_POSITIONS.includes(String(position ?? "").trim().toUpperCase());
}

export function normalizeGameStatus(raw, context = "") {
  const value = String(raw ?? "").trim();
  if (value === "") return null;
  const mapped = GAME_STATUS_MAP.get(value.toLowerCase());
  if (!mapped) {
    throw new Error(
      `Unknown report_status "${value}"${context ? ` (${context})` : ""}; refusing to guess a designation`
    );
  }
  return mapped;
}

export function normalizePracticeStatus(raw, context = "") {
  const value = String(raw ?? "").trim();
  if (value === "") return null;
  const mapped = PRACTICE_STATUS_MAP.get(value.toLowerCase());
  if (!mapped) {
    throw new Error(
      `Unknown practice_status "${value}"${context ? ` (${context})` : ""}; refusing to guess participation`
    );
  }
  return mapped;
}

/** ACT / INA / DEV are never Reserve. Practice squad is not an injury. */
export function normalizeReserveStatus(rosterStatus, context = "") {
  const value = String(rosterStatus ?? "").trim().toUpperCase();
  if (value === "") return null;
  if (!ROSTER_STATUS_CODES.has(value)) {
    throw new Error(
      `Unknown roster status "${value}"${context ? ` (${context})` : ""}; refusing to guess reserve state`
    );
  }
  return value === "RES" ? RESERVE_STATUS.RESERVE : null;
}

const REQUIRED_INJURY_COLUMNS = [
  "season", "season_type", "team", "week", "gsis_id", "position", "full_name",
  "report_primary_injury", "report_secondary_injury", "report_status",
  "practice_primary_injury", "practice_secondary_injury", "practice_status",
];

const REQUIRED_ROSTER_COLUMNS = [
  "season", "week", "game_type", "team", "gsis_id", "pfr_id", "position",
  "depth_chart_position", "status", "status_description_abbr",
];

const REQUIRED_SNAP_COLUMNS = [
  "game_id", "season", "game_type", "week", "player", "pfr_player_id", "position",
  "team", "opponent", "offense_snaps", "offense_pct", "defense_snaps", "defense_pct",
  "st_snaps", "st_pct",
];

function assertColumns(rows, required, label) {
  if (rows.length === 0) throw new Error(`${label}: source contained no data rows`);
  const present = new Set(Object.keys(rows[0]));
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(`${label}: missing required columns ${missing.join(", ")}`);
  }
}

function toInt(value, label) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed)) throw new Error(`${label}: expected an integer, got "${value}"`);
  return parsed;
}

function toPct(value, label) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1.5) {
    throw new Error(`${label}: expected a 0-1 fraction, got "${value}"`);
  }
  return parsed;
}

/**
 * Regular-season injury rows, normalized. Postseason is dropped: "last game"
 * and season snap share are defined over the regular season only.
 */
export function parseInjuryRows(rows, { season }) {
  assertColumns(rows, REQUIRED_INJURY_COLUMNS, "injuries");
  const parsed = [];
  const skipped = { nonRegularSeason: 0, missingGsisId: 0, excludedPosition: 0, unmappedPosition: 0 };

  for (const row of rows) {
    if (String(row.season_type).trim().toUpperCase() !== "REG") {
      skipped.nonRegularSeason += 1;
      continue;
    }
    const week = toInt(row.week, "injuries.week");
    const context = `${row.team} wk${week} ${row.full_name}`;
    const gsisId = String(row.gsis_id ?? "").trim();
    if (gsisId === "") {
      skipped.missingGsisId += 1;
      continue;
    }
    const position = String(row.position ?? "").trim().toUpperCase();
    if (isExcludedPosition(position)) {
      skipped.excludedPosition += 1;
      continue;
    }
    const unit = positionUnit(position);
    if (unit === null) {
      skipped.unmappedPosition += 1;
      continue;
    }

    parsed.push({
      season: toInt(row.season, "injuries.season"),
      week,
      team: String(row.team).trim().toUpperCase(),
      gsisId,
      playerName: String(row.full_name).trim(),
      position,
      unit,
      gameStatus: normalizeGameStatus(row.report_status, context),
      practiceStatus: normalizePracticeStatus(row.practice_status, context),
      reportPrimaryInjury: String(row.report_primary_injury ?? "").trim() || null,
      reportSecondaryInjury: String(row.report_secondary_injury ?? "").trim() || null,
      practicePrimaryInjury: String(row.practice_primary_injury ?? "").trim() || null,
      practiceSecondaryInjury: String(row.practice_secondary_injury ?? "").trim() || null,
      // Raw source values retained for provenance/debugging.
      rawReportStatus: String(row.report_status ?? "").trim() || null,
      rawPracticeStatus: String(row.practice_status ?? "").trim() || null,
    });
    if (season != null && parsed[parsed.length - 1].season !== season) {
      throw new Error(`injuries: row season ${parsed[parsed.length - 1].season} != requested ${season}`);
    }
  }

  return { rows: parsed, skipped };
}

/** Regular-season weekly roster rows, normalized. */
export function parseRosterRows(rows, { season }) {
  assertColumns(rows, REQUIRED_ROSTER_COLUMNS, "weekly_rosters");
  const parsed = [];
  const skipped = { nonRegularSeason: 0, missingGsisId: 0 };

  for (const row of rows) {
    if (String(row.game_type ?? "").trim().toUpperCase() !== "REG") {
      skipped.nonRegularSeason += 1;
      continue;
    }
    const gsisId = String(row.gsis_id ?? "").trim();
    if (gsisId === "") {
      skipped.missingGsisId += 1;
      continue;
    }
    const week = toInt(row.week, "weekly_rosters.week");
    const rosterStatus = String(row.status ?? "").trim().toUpperCase();
    parsed.push({
      season: toInt(row.season, "weekly_rosters.season"),
      week,
      team: String(row.team).trim().toUpperCase(),
      gsisId,
      pfrId: String(row.pfr_id ?? "").trim() || null,
      espnId: String(row.espn_id ?? "").trim() || null,
      position: String(row.position ?? "").trim().toUpperCase() || null,
      depthChartPosition: String(row.depth_chart_position ?? "").trim().toUpperCase() || null,
      rosterStatus,
      rosterStatusCode: String(row.status_description_abbr ?? "").trim().toUpperCase() || null,
      reserveStatus: normalizeReserveStatus(rosterStatus, `${row.team} wk${week} ${row.gsis_id}`),
    });
    if (season != null && parsed[parsed.length - 1].season !== season) {
      throw new Error(`weekly_rosters: row season ${parsed[parsed.length - 1].season} != requested ${season}`);
    }
  }

  return { rows: parsed, skipped };
}

/** Regular-season snap rows, normalized. Special-teams columns are retained
 *  for provenance but are never used for relevance or percentages. */
export function parseSnapRows(rows, { season }) {
  assertColumns(rows, REQUIRED_SNAP_COLUMNS, "snap_counts");
  const parsed = [];
  const skipped = { nonRegularSeason: 0, missingPfrId: 0 };

  for (const row of rows) {
    if (String(row.game_type ?? "").trim().toUpperCase() !== "REG") {
      skipped.nonRegularSeason += 1;
      continue;
    }
    const pfrId = String(row.pfr_player_id ?? "").trim();
    if (pfrId === "") {
      skipped.missingPfrId += 1;
      continue;
    }
    const label = `snap_counts ${row.game_id} ${row.player}`;
    parsed.push({
      gameId: String(row.game_id).trim(),
      season: toInt(row.season, "snap_counts.season"),
      week: toInt(row.week, "snap_counts.week"),
      team: String(row.team).trim().toUpperCase(),
      opponent: String(row.opponent).trim().toUpperCase(),
      pfrId,
      playerName: String(row.player).trim(),
      position: String(row.position ?? "").trim().toUpperCase() || null,
      offenseSnaps: toInt(row.offense_snaps, `${label}.offense_snaps`),
      offensePct: toPct(row.offense_pct, `${label}.offense_pct`),
      defenseSnaps: toInt(row.defense_snaps, `${label}.defense_snaps`),
      defensePct: toPct(row.defense_pct, `${label}.defense_pct`),
      stSnaps: toInt(row.st_snaps, `${label}.st_snaps`),
    });
    if (season != null && parsed[parsed.length - 1].season !== season) {
      throw new Error(`snap_counts: row season ${parsed[parsed.length - 1].season} != requested ${season}`);
    }
  }

  return { rows: parsed, skipped };
}

const REQUIRED_PLAYER_COLUMNS = ["gsis_id", "pfr_id", "espn_id", "display_name", "position"];

/**
 * League-wide player rows from the nflverse `players` release.
 *
 * This is the authoritative gsis_id -> pfr_id crosswalk. weekly_rosters carries
 * pfr_id too, but leaves it blank on 11,189 of 44,697 2025 regular-season rows
 * — including established starters — so roster alone resolves only ~81% of
 * injury records. players.csv lifts that to 99.74%.
 */
export function parsePlayerRows(rows) {
  assertColumns(rows, REQUIRED_PLAYER_COLUMNS, "players");
  const parsed = [];
  for (const row of rows) {
    const gsisId = String(row.gsis_id ?? "").trim();
    const pfrId = String(row.pfr_id ?? "").trim();
    if (gsisId === "" || pfrId === "") continue;
    parsed.push({
      gsisId,
      pfrId,
      espnId: String(row.espn_id ?? "").trim() || null,
      playerName: String(row.display_name ?? "").trim() || null,
      position: String(row.position ?? "").trim().toUpperCase() || null,
    });
  }
  return { rows: parsed };
}

/**
 * gsis_id -> { pfrId, espnId, source }.
 *
 * Roster-first, then the league-wide players file. Both are nflverse-authored
 * ID tables keyed on gsis_id; neither involves name matching. A genuine
 * conflict (two different pfr_ids for one gsis_id) keeps the roster value and
 * is reported rather than silently resolved.
 */
export function buildCrosswalk(rosterRows, playerRows = []) {
  const crosswalk = new Map();
  const conflicts = [];

  for (const row of rosterRows) {
    if (!row.pfrId) continue;
    const existing = crosswalk.get(row.gsisId);
    if (!existing) {
      crosswalk.set(row.gsisId, { pfrId: row.pfrId, espnId: row.espnId ?? null, source: "weekly_rosters" });
      continue;
    }
    if (existing.pfrId !== row.pfrId) {
      conflicts.push({ gsisId: row.gsisId, kept: existing.pfrId, rejected: row.pfrId, source: "weekly_rosters" });
    } else if (!existing.espnId && row.espnId) {
      crosswalk.set(row.gsisId, { ...existing, espnId: row.espnId });
    }
  }

  for (const row of playerRows) {
    const existing = crosswalk.get(row.gsisId);
    if (!existing) {
      crosswalk.set(row.gsisId, { pfrId: row.pfrId, espnId: row.espnId ?? null, source: "players" });
      continue;
    }
    if (existing.pfrId !== row.pfrId) {
      conflicts.push({ gsisId: row.gsisId, kept: existing.pfrId, rejected: row.pfrId, source: "players" });
    } else if (!existing.espnId && row.espnId) {
      crosswalk.set(row.gsisId, { ...existing, espnId: row.espnId });
    }
  }

  return { crosswalk, conflicts };
}
