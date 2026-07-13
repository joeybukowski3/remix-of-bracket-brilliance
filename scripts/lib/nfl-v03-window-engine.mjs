/**
 * Pure final-eight window and review-state helpers for nfl-power-v0.3.0.
 *
 * This module performs no file access, provider calls, artifact generation, or
 * rating calculations. Callers supply schedule/result records joined with a
 * valid dateUtc kickoff timestamp.
 */

export const NFL_V03_WINDOW_SIZE = 8;
export const NFL_V03_WINDOW_ORDERING_METHOD =
  "dateUtc ascending, then week ascending, then gameId ascending";

export const NFL_V03_CONTEXT_FLAGS = Object.freeze([
  "rested-starters",
  "backup-qb",
  "eliminated-noncompetitive",
  "neutral-site",
  "week18-anomaly",
]);

export const NFL_V03_CONTEXT_FLAG_ORIGINS = Object.freeze(["manual", "screen"]);
export const NFL_V03_MANUAL_ADJUSTMENT_COMPONENTS = Object.freeze(["qb", "coaching"]);
export const NFL_V03_MANUAL_ADJUSTMENT_STATUSES = Object.freeze([
  "active",
  "expired",
  "superseded",
]);

const COMPONENT_BOUNDS = Object.freeze({ qb: 0.75, coaching: 0.25 });
const CONTEXT_FLAG_SET = new Set(NFL_V03_CONTEXT_FLAGS);
const CONTEXT_FLAG_ORIGIN_SET = new Set(NFL_V03_CONTEXT_FLAG_ORIGINS);
const ADJUSTMENT_COMPONENT_SET = new Set(NFL_V03_MANUAL_ADJUSTMENT_COMPONENTS);
const ADJUSTMENT_STATUS_SET = new Set(NFL_V03_MANUAL_ADJUSTMENT_STATUSES);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

function canonicalTeamSet(canonicalTeams) {
  if (canonicalTeams == null) return null;

  const values =
    canonicalTeams instanceof Set
      ? [...canonicalTeams]
      : Array.isArray(canonicalTeams)
        ? canonicalTeams
        : Array.isArray(canonicalTeams.teams)
          ? canonicalTeams.teams
          : null;
  if (!values) {
    throw new Error("canonical teams must be a Set, an array, or an object with a teams array");
  }

  const teams = new Set();
  for (const value of values) {
    const team = typeof value === "string" ? value : value?.abbr;
    if (!isNonEmptyString(team)) {
      throw new Error("canonical teams must contain abbreviations or objects with an abbr");
    }
    teams.add(team.trim());
  }
  return teams;
}

function parseValidDate(value) {
  if (!isNonEmptyString(value)) return null;
  const trimmed = value.trim();
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const date = new Date(timestamp);
    if (
      date.getUTCFullYear() !== Number(dateOnly[1]) ||
      date.getUTCMonth() + 1 !== Number(dateOnly[2]) ||
      date.getUTCDate() !== Number(dateOnly[3])
    ) {
      return null;
    }
  }
  return { value: trimmed, timestamp };
}

function requireGameShape(game, index = null) {
  const label = index == null ? "game" : `game at index ${index}`;
  if (!game || typeof game !== "object" || Array.isArray(game)) {
    throw new Error(`${label} must be an object`);
  }
  if (!isNonEmptyString(game.gameId)) throw new Error(`${label} requires gameId`);
  if (!Number.isInteger(game.week) || game.week < 1) {
    throw new Error(`${label} ${game.gameId} has invalid week`);
  }
  if (!parseValidDate(game.dateUtc)) {
    throw new Error(`${label} ${game.gameId} has invalid dateUtc`);
  }
  if (!isNonEmptyString(game.homeAbbr) || !isNonEmptyString(game.awayAbbr)) {
    throw new Error(`${label} ${game.gameId} requires homeAbbr and awayAbbr`);
  }
}

function gameIsFinal(game) {
  if (CANCELLED_STATUSES.has(game.status)) return false;
  if ("final" in game && game.final !== true) return false;
  if ("status" in game && game.status !== "final") return false;
  return game.final === true || game.status === "final";
}

function gameIncludesTeam(game, team) {
  return game.homeAbbr === team || game.awayAbbr === team;
}

function compareGamesByKickoff(a, b) {
  return (
    Date.parse(a.dateUtc) - Date.parse(b.dateUtc) ||
    a.week - b.week ||
    a.gameId.localeCompare(b.gameId)
  );
}

function cloneGame(game) {
  return { ...game };
}

/** Return completed regular-season games in deterministic kickoff order. */
export function sortCompletedRegularSeasonGames(games) {
  if (!Array.isArray(games)) {
    throw new Error("sortCompletedRegularSeasonGames: games must be an array");
  }
  games.forEach((game, index) => requireGameShape(game, index));
  return games
    .filter((game) => game.seasonType === "REG" && gameIsFinal(game))
    .slice()
    .sort(compareGamesByKickoff);
}

/** Select one team's canonical last eight completed regular-season games. */
export function selectFinalEightWindow(team, games, canonicalTeams = null) {
  if (!isNonEmptyString(team)) {
    throw new Error("selectFinalEightWindow: team is required");
  }
  if (!Array.isArray(games)) {
    throw new Error("selectFinalEightWindow: games must be an array");
  }
  const normalizedTeam = team.trim();
  const knownTeams = canonicalTeamSet(canonicalTeams);
  if (knownTeams && !knownTeams.has(normalizedTeam)) {
    throw new Error(`Unknown team abbreviation "${normalizedTeam}"`);
  }

  const teamGames = games.filter(
    (game) => game && typeof game === "object" && gameIncludesTeam(game, normalizedTeam)
  );
  teamGames.forEach((game, index) => requireGameShape(game, index));
  if (knownTeams) {
    for (const game of teamGames) {
      if (!knownTeams.has(game.homeAbbr) || !knownTeams.has(game.awayAbbr)) {
        const unknown = !knownTeams.has(game.homeAbbr) ? game.homeAbbr : game.awayAbbr;
        throw new Error(`Unknown team abbreviation "${unknown}" in game ${game.gameId}`);
      }
    }
  }

  let excludedNonFinalCount = 0;
  let excludedPostseasonCount = 0;
  for (const game of teamGames) {
    if (!gameIsFinal(game)) excludedNonFinalCount += 1;
    else if (game.seasonType !== "REG") excludedPostseasonCount += 1;
  }

  const completed = sortCompletedRegularSeasonGames(teamGames);
  const selected = completed.slice(-NFL_V03_WINDOW_SIZE).map(cloneGame);
  return {
    team: normalizedTeam,
    windowGames: selected,
    windowSize: selected.length,
    shortWindow: selected.length < NFL_V03_WINDOW_SIZE,
    firstKickoff: selected[0]?.dateUtc ?? null,
    lastKickoff: selected.at(-1)?.dateUtc ?? null,
    excludedNonFinalCount,
    excludedPostseasonCount,
    orderingMethod: NFL_V03_WINDOW_ORDERING_METHOD,
  };
}

/** Build deterministic canonical windows for every supplied canonical team. */
export function buildTeamFinalEightWindows(games, canonicalTeams = null) {
  if (!Array.isArray(games)) {
    throw new Error("buildTeamFinalEightWindows: games must be an array");
  }
  games.forEach((game, index) => requireGameShape(game, index));

  const suppliedTeams = canonicalTeamSet(canonicalTeams);
  if (suppliedTeams) {
    for (const game of games) {
      if (!suppliedTeams.has(game.homeAbbr)) {
        throw new Error(`Unknown team abbreviation "${game.homeAbbr}" in game ${game.gameId}`);
      }
      if (!suppliedTeams.has(game.awayAbbr)) {
        throw new Error(`Unknown team abbreviation "${game.awayAbbr}" in game ${game.gameId}`);
      }
    }
  }

  const teams = suppliedTeams ?? new Set(games.flatMap((game) => [game.homeAbbr, game.awayAbbr]));
  return [...teams]
    .sort((a, b) => a.localeCompare(b))
    .map((team) => selectFinalEightWindow(team, games, teams));
}

function teamMargin(game, team) {
  if (!gameIncludesTeam(game, team)) {
    throw new Error(`Team ${team} did not play in game ${game.gameId}`);
  }
  if (!isFiniteNumber(game.homeScore) || !isFiniteNumber(game.awayScore)) {
    throw new Error(`Game ${game.gameId} requires finite homeScore and awayScore`);
  }
  const margin =
    game.homeAbbr === team
      ? game.homeScore - game.awayScore
      : game.awayScore - game.homeScore;
  if (!isFiniteNumber(margin)) throw new Error(`Game ${game.gameId} produced an invalid margin`);
  return margin;
}

/** Screen one Week 18 team result against only its prior completed-game baseline. */
export function calculateWeek18Anomaly(team, week18Game, priorGames) {
  if (!isNonEmptyString(team)) throw new Error("calculateWeek18Anomaly: team is required");
  if (!Array.isArray(priorGames)) {
    throw new Error("calculateWeek18Anomaly: priorGames must be an array");
  }
  const normalizedTeam = team.trim();
  requireGameShape(week18Game);
  if (week18Game.week !== 18) {
    throw new Error(`Game ${week18Game.gameId} is not Week 18`);
  }
  if (week18Game.seasonType !== "REG" || !gameIsFinal(week18Game)) {
    throw new Error(`Game ${week18Game.gameId} must be a completed regular-season game`);
  }
  const actualMargin = teamMargin(week18Game, normalizedTeam);
  const week18Kickoff = Date.parse(week18Game.dateUtc);

  const baselineGames = sortCompletedRegularSeasonGames(priorGames).filter(
    (game) =>
      game.gameId !== week18Game.gameId &&
      game.season === week18Game.season &&
      gameIncludesTeam(game, normalizedTeam) &&
      Date.parse(game.dateUtc) < week18Kickoff
  );
  const margins = baselineGames.map((game) => teamMargin(game, normalizedTeam));
  if (margins.length === 0) {
    return {
      team: normalizedTeam,
      gameId: week18Game.gameId,
      week: 18,
      actualMargin,
      priorMeanMargin: null,
      priorStandardDeviation: null,
      zScore: null,
      candidate: false,
      reason: "insufficient-prior-games",
      priorGameCount: 0,
      priorGameIds: [],
      thresholdStandardDeviations: 2,
    };
  }

  const priorMeanMargin = margins.reduce((sum, margin) => sum + margin, 0) / margins.length;
  const variance =
    margins.reduce((sum, margin) => sum + (margin - priorMeanMargin) ** 2, 0) /
    margins.length;
  const priorStandardDeviation = Math.sqrt(variance);
  const delta = actualMargin - priorMeanMargin;
  let zScore;
  let candidate;
  let reason;

  if (priorStandardDeviation === 0) {
    zScore = delta === 0 ? 0 : null;
    candidate = delta !== 0;
    reason = candidate
      ? "week-18-margin-deviates-from-zero-variance-prior-baseline"
      : "week-18-margin-matches-zero-variance-prior-baseline";
  } else {
    zScore = delta / priorStandardDeviation;
    if (!isFiniteNumber(zScore)) throw new Error("Week 18 anomaly calculation was not finite");
    candidate = Math.abs(zScore) >= 2;
    reason = candidate
      ? "absolute-z-score-at-least-2"
      : "absolute-z-score-below-2";
  }

  return {
    team: normalizedTeam,
    gameId: week18Game.gameId,
    week: 18,
    actualMargin,
    priorMeanMargin,
    priorStandardDeviation,
    zScore,
    candidate,
    reason,
    priorGameCount: baselineGames.length,
    priorGameIds: baselineGames.map((game) => game.gameId),
    thresholdStandardDeviations: 2,
  };
}

/** Return Week 18 screen candidates only; no context flags are created. */
export function findWeek18AnomalyCandidates(games, canonicalTeams = null) {
  const knownTeams = canonicalTeamSet(canonicalTeams);
  const completed = sortCompletedRegularSeasonGames(games);
  if (knownTeams) {
    for (const game of completed) {
      if (!knownTeams.has(game.homeAbbr) || !knownTeams.has(game.awayAbbr)) {
        const unknown = !knownTeams.has(game.homeAbbr) ? game.homeAbbr : game.awayAbbr;
        throw new Error(`Unknown team abbreviation "${unknown}" in game ${game.gameId}`);
      }
    }
  }

  const candidates = [];
  for (const game of completed.filter((candidate) => candidate.week === 18)) {
    for (const team of [game.homeAbbr, game.awayAbbr].sort((a, b) => a.localeCompare(b))) {
      const result = calculateWeek18Anomaly(team, game, completed);
      if (result.candidate) candidates.push(result);
    }
  }
  return candidates;
}

function addRequiredString(source, normalized, errors, field) {
  if (!isNonEmptyString(source[field])) {
    errors.push(`${field} is required`);
  } else {
    normalized[field] = source[field].trim();
  }
}

function validateTeam(source, normalized, errors, knownTeams) {
  addRequiredString(source, normalized, errors, "team");
  if (normalized.team && knownTeams && !knownTeams.has(normalized.team)) {
    errors.push(`unknown team abbreviation "${normalized.team}"`);
  }
}

function addValidDate(source, normalized, errors, field) {
  const parsed = parseValidDate(source[field]);
  if (!parsed) errors.push(`${field} must be a valid date`);
  else normalized[field] = parsed.value;
}

/** Validate and normalize one context-flag entry without mutating it. */
export function validateContextFlag(entry, canonicalTeams = null) {
  const errors = [];
  const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  const normalized = {};
  const knownTeams = canonicalTeamSet(canonicalTeams);

  addRequiredString(source, normalized, errors, "gameId");
  validateTeam(source, normalized, errors, knownTeams);
  addRequiredString(source, normalized, errors, "flag");
  if (normalized.flag && !CONTEXT_FLAG_SET.has(normalized.flag)) {
    errors.push(`invalid context flag "${normalized.flag}"`);
  }
  addRequiredString(source, normalized, errors, "origin");
  if (normalized.origin && !CONTEXT_FLAG_ORIGIN_SET.has(normalized.origin)) {
    errors.push(`invalid context flag origin "${normalized.origin}"`);
  }
  addRequiredString(source, normalized, errors, "enteredBy");
  addValidDate(source, normalized, errors, "date");
  addRequiredString(source, normalized, errors, "note");

  if (normalized.origin === "manual") {
    addRequiredString(source, normalized, errors, "source");
  } else if (source.source == null) {
    normalized.source = null;
  } else if (isNonEmptyString(source.source)) {
    normalized.source = source.source.trim();
  } else {
    errors.push("source must be null or a non-empty string");
  }
  if ("confirmed" in source) {
    if (typeof source.confirmed !== "boolean") errors.push("confirmed must be a boolean");
    else normalized.confirmed = source.confirmed;
  }

  const valid = errors.length === 0;
  return { valid, errors, normalizedEntry: valid ? normalized : null };
}

/** Validate a context-flag collection and retain index-specific failures. */
export function validateContextFlags(entries, canonicalTeams = null) {
  if (!Array.isArray(entries)) {
    return { valid: false, errors: ["context flags must be an array"], normalizedEntries: null };
  }
  const errors = [];
  const normalizedEntries = [];
  entries.forEach((entry, index) => {
    const result = validateContextFlag(entry, canonicalTeams);
    if (result.valid) normalizedEntries.push(result.normalizedEntry);
    else errors.push(...result.errors.map((error) => `[${index}] ${error}`));
  });
  const valid = errors.length === 0;
  return { valid, errors, normalizedEntries: valid ? normalizedEntries : null };
}

/** Validate and normalize one bounded preseason manual adjustment. */
export function validateManualAdjustment(entry, canonicalTeams = null) {
  const errors = [];
  const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
  const normalized = {};
  const knownTeams = canonicalTeamSet(canonicalTeams);

  validateTeam(source, normalized, errors, knownTeams);
  addRequiredString(source, normalized, errors, "component");
  if (normalized.component && !ADJUSTMENT_COMPONENT_SET.has(normalized.component)) {
    errors.push(`invalid adjustment component "${normalized.component}"`);
  }
  if (!isFiniteNumber(source.value)) {
    errors.push("value is required and must be a finite number");
  } else {
    normalized.value = source.value;
    const bound = COMPONENT_BOUNDS[normalized.component];
    if (bound != null && Math.abs(source.value) > bound) {
      errors.push(`${normalized.component} adjustment must have absolute value <= ${bound}`);
    }
  }
  addRequiredString(source, normalized, errors, "author");
  addValidDate(source, normalized, errors, "date");
  addRequiredString(source, normalized, errors, "rationale");
  addRequiredString(source, normalized, errors, "sourceRef");
  addValidDate(source, normalized, errors, "reviewBy");
  if (source.expires === "in-season-activation") {
    normalized.expires = source.expires;
  } else {
    addValidDate(source, normalized, errors, "expires");
  }
  addRequiredString(source, normalized, errors, "status");
  if (normalized.status && !ADJUSTMENT_STATUS_SET.has(normalized.status)) {
    errors.push(`invalid adjustment status "${normalized.status}"`);
  }

  const valid = errors.length === 0;
  return { valid, errors, normalizedEntry: valid ? normalized : null };
}

function normalizeActivityOptions(options) {
  if (options == null) return { asOfDate: null, inSeasonActive: false };
  if (typeof options === "boolean") return { asOfDate: null, inSeasonActive: options };
  if (typeof options === "string" || options instanceof Date) {
    return { asOfDate: options, inSeasonActive: false };
  }
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new Error("activity options must supply asOfDate and/or inSeasonActive");
  }
  return {
    asOfDate: options.asOfDate ?? null,
    inSeasonActive: options.inSeasonActive === true,
  };
}

/** Determine active state for status, supplied date, and in-season mode. */
export function isAdjustmentActive(entry, options = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  if (entry.status !== "active") return false;
  const { asOfDate, inSeasonActive } = normalizeActivityOptions(options);
  if (entry.expires === "in-season-activation") return !inSeasonActive;

  const expires = parseValidDate(entry.expires);
  if (!expires) throw new Error("isAdjustmentActive: expires must be a valid date or in-season-activation");
  if (asOfDate == null) return true;
  const comparableAsOf = asOfDate instanceof Date ? asOfDate.toISOString() : asOfDate;
  const parsedAsOf = parseValidDate(comparableAsOf);
  if (!parsedAsOf) throw new Error("isAdjustmentActive: asOfDate must be a valid date");
  return parsedAsOf.timestamp < expires.timestamp;
}

/** Calculate the signed active total for one team without clipping. */
export function calculateActiveAdjustmentTotal(team, entries, options = {}) {
  if (!isNonEmptyString(team)) {
    throw new Error("calculateActiveAdjustmentTotal: team is required");
  }
  if (!Array.isArray(entries)) {
    throw new Error("calculateActiveAdjustmentTotal: entries must be an array");
  }
  const normalizedTeam = team.trim();
  let total = 0;
  for (const entry of entries) {
    if (entry?.team !== normalizedTeam || !isAdjustmentActive(entry, options)) continue;
    if (!isFiniteNumber(entry.value)) {
      throw new Error(`Active adjustment for ${normalizedTeam} requires a finite numeric value`);
    }
    total += entry.value;
  }
  if (!isFiniteNumber(total)) throw new Error(`Active adjustment total for ${normalizedTeam} is not finite`);
  return Object.is(total, -0) ? 0 : total;
}

function collectionOptions(options) {
  if (
    options instanceof Set ||
    Array.isArray(options) ||
    (options && typeof options === "object" && Array.isArray(options.teams))
  ) {
    return { canonicalTeams: options, asOfDate: null, inSeasonActive: false };
  }
  return {
    canonicalTeams: options?.canonicalTeams ?? null,
    asOfDate: options?.asOfDate ?? null,
    inSeasonActive: options?.inSeasonActive === true,
  };
}

/** Validate adjustment entries, active component uniqueness, and team totals. */
export function validateManualAdjustments(entries, options = {}) {
  if (!Array.isArray(entries)) {
    return {
      valid: false,
      errors: ["manual adjustments must be an array"],
      normalizedEntries: null,
      activeTotals: {},
    };
  }
  const { canonicalTeams, asOfDate, inSeasonActive } = collectionOptions(options);
  const errors = [];
  const normalizedEntries = [];
  entries.forEach((entry, index) => {
    const result = validateManualAdjustment(entry, canonicalTeams);
    if (result.valid) normalizedEntries.push(result.normalizedEntry);
    else errors.push(...result.errors.map((error) => `[${index}] ${error}`));
  });

  const activeTotals = {};
  if (errors.length === 0) {
    const activeOptions = { asOfDate, inSeasonActive };
    const activeByComponent = new Map();
    for (const entry of normalizedEntries) {
      if (!isAdjustmentActive(entry, activeOptions)) continue;
      const key = `${entry.team}:${entry.component}`;
      const matches = activeByComponent.get(key) ?? [];
      matches.push(entry);
      activeByComponent.set(key, matches);
    }
    for (const [key, matches] of activeByComponent) {
      if (matches.length > 1) {
        errors.push(`${key} has ${matches.length} active entries and is ambiguous`);
      }
    }

    const teams = [...new Set(normalizedEntries.map((entry) => entry.team))].sort((a, b) =>
      a.localeCompare(b)
    );
    for (const team of teams) {
      const total = calculateActiveAdjustmentTotal(team, normalizedEntries, activeOptions);
      activeTotals[team] = total;
      if (Math.abs(total) > 1) {
        errors.push(`${team} active adjustment total ${total} exceeds the absolute 1.0 bound`);
      }
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    normalizedEntries: valid ? normalizedEntries : null,
    activeTotals,
  };
}

/**
 * Return the immutable canonical view plus a clearly non-canonical alternate.
 * Screen flags never exclude. Manual flags exclude only when confirmed is the
 * literal boolean true.
 */
export function buildFlaggedGameViews(windowGames, contextFlags) {
  if (!Array.isArray(windowGames)) {
    throw new Error("buildFlaggedGameViews: windowGames must be an array");
  }
  if (!Array.isArray(contextFlags)) {
    throw new Error("buildFlaggedGameViews: contextFlags must be an array");
  }
  const coreGames = windowGames.map((game, index) => {
    if (!game || typeof game !== "object" || !isNonEmptyString(game.gameId)) {
      throw new Error(`window game at index ${index} requires gameId`);
    }
    return cloneGame(game);
  });
  contextFlags.forEach((flag, index) => {
    if (!flag || typeof flag !== "object" || !isNonEmptyString(flag.gameId)) {
      throw new Error(`context flag at index ${index} requires gameId`);
    }
  });

  const flaggedGames = coreGames.flatMap((game) => {
    const flags = contextFlags
      .filter((flag) => flag.gameId === game.gameId)
      .map((flag) => ({ ...flag }));
    if (flags.length === 0) return [];
    const confirmedManualFlags = flags.filter(
      (flag) => flag.origin === "manual" && flag.confirmed === true
    );
    return [{ game: cloneGame(game), flags, confirmedManualFlags }];
  });
  const excludedGameIds = new Set(
    flaggedGames
      .filter((entry) => entry.confirmedManualFlags.length > 0)
      .map((entry) => entry.game.gameId)
  );
  const alternateGames = coreGames
    .filter((game) => !excludedGameIds.has(game.gameId))
    .map(cloneGame);

  return {
    coreWindowGames: coreGames.map(cloneGame),
    flaggedGames,
    alternateGames,
    canonical: {
      label: "canonical",
      games: coreGames.map(cloneGame),
    },
    alternateExcludingConfirmedFlags: {
      label: "alternateExcludingConfirmedFlags",
      canonical: false,
      games: alternateGames.map(cloneGame),
      excludedGameIds: [...excludedGameIds],
      note: "Review-only alternate; it never replaces the canonical final-eight window.",
    },
  };
}
