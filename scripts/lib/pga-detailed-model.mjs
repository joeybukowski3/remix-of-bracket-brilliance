const REQUIRED_STAT_FIELDS = [
  "sgApp",
  "par4ScoringAverage",
  "drivingAccuracy",
  "bogeyAvoidance",
  "sgAtG",
  "birdie125150",
  "sgPutt",
  "birdieUnder125",
];

export const REQUIRED_MODEL_FIELDS = [
  "SG: Approach the Green",
  "Par 4 Scoring Average",
  "Driving Accuracy %",
  "Bogey Avoidance",
  "SG: Around the Green",
  "TrendRank",
  "Birdie or Better 125-150 yds",
  "SG: Putting",
  "Birdie or Better <125 yds",
  "Course True SG",
];

const RANK_FIELDS = [
  ["SG: Approach the Green", "SG: Approach the Green_rank", "desc"],
  ["Par 4 Scoring Average", "Par 4 Scoring Average_rank", "asc"],
  ["Driving Accuracy %", "Driving Accuracy %_rank", "desc"],
  ["Bogey Avoidance", "Bogey Avoidance_rank", "asc"],
  ["SG: Around the Green", "SG: Around the Green_rank", "desc"],
  ["Birdie or Better 125-150 yds", "Birdie or Better 125-150 yds_rank", "desc"],
  ["SG: Putting", "SG: Putting_rank", "desc"],
  ["Birdie or Better <125 yds", "Birdie or Better <125 yds_rank", "desc"],
];

export function normalizePgaPlayerName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildDetailedTournamentData({ field, stats, statsMeta, trend, history, config, generatedAt = new Date().toISOString() }) {
  validateInputs({ field, stats, statsMeta, trend, history, config, generatedAt });

  const statsByPlayer = uniqueMap(stats, (row) => row.player, "PGA stats");
  const trendByPlayer = uniqueMap(trend.players, (row) => row.player, "JKB Trend");
  const openHistory = history.rounds.filter((round) => normalizeEvent(round.eventName) === normalizeEvent(config.history.eventName));
  const courseScores = buildCourseHistoryScores(
    openHistory,
    config.history.courseName,
    config.history.venueMinimumRounds ?? 2,
  );
  const finishes = buildEventFinishes(openHistory);

  const rows = field.players.map((player) => {
    const key = normalizePgaPlayerName(player);
    const stat = statsByPlayer.get(key);
    const trendPlayer = trendByPlayer.get(key);
    const historyScore = courseScores.get(key);
    const playerFinishes = finishes.get(key) ?? new Map();
    const missingStatFields = REQUIRED_STAT_FIELDS.filter((statKey) => !finite(stat?.[statKey]));

    return {
      "Player Name": player,
      Salary: null,
      "HT # Rounds": historyScore?.rounds ?? null,
      "Course True SG": historyScore?.score ?? null,
      "2021": playerFinishes.get(2021) ?? null,
      "2022": playerFinishes.get(2022) ?? null,
      "2023": playerFinishes.get(2023) ?? null,
      "2024": playerFinishes.get(2024) ?? null,
      "2025": playerFinishes.get(2025) ?? null,
      "SG: Approach the Green": numberOrNull(stat?.sgApp),
      "SG: Around the Green": numberOrNull(stat?.sgAtG),
      "SG: Putting": numberOrNull(stat?.sgPutt),
      "Par 4 Scoring Average": numberOrNull(stat?.par4ScoringAverage),
      "Driving Accuracy %": numberOrNull(stat?.drivingAccuracy),
      "Bogey Avoidance": numberOrNull(stat?.bogeyAvoidance),
      "Birdie or Better 125-150 yds": numberOrNull(stat?.birdie125150),
      "Birdie or Better <125 yds": numberOrNull(stat?.birdieUnder125),
      TrendRank: numberOrNull(trendPlayer?.rank),
      "SG: Approach the Green_rank": null,
      "SG: Around the Green_rank": null,
      "SG: Putting_rank": null,
      "Par 4 Scoring Average_rank": null,
      "Driving Accuracy %_rank": null,
      "Bogey Avoidance_rank": null,
      "Birdie or Better 125-150 yds_rank": null,
      "Birdie or Better <125 yds_rank": null,
      hasStatProfile: Boolean(stat),
      missingStatFields,
      dataCompletenessScore: 0,
      "Model Data Generated At": generatedAt,
    };
  });

  for (const [rawField, rankField, direction] of RANK_FIELDS) {
    applyCompetitionRanks(rows, rawField, rankField, direction);
  }

  for (const row of rows) {
    row.dataCompletenessScore = REQUIRED_MODEL_FIELDS.reduce(
      (count, fieldName) => count + (finite(row[fieldName]) ? 1 : 0),
      0,
    );
  }

  return validateDetailedTournamentData(rows, { field, config, generatedAt });
}

export function validateDetailedTournamentData(rows, { field, config, generatedAt }) {
  if (!Array.isArray(rows) || rows.length !== field.players.length || rows.length < 100) {
    throw new Error(`Detailed package row count ${rows?.length ?? 0} does not match the ${field.players.length}-player field.`);
  }

  const expected = new Set(field.players.map(normalizePgaPlayerName));
  const names = rows.map((row) => normalizePgaPlayerName(row["Player Name"]));
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new Error("Detailed package contains a blank or duplicate player identity.");
  }
  if (names.some((name) => !expected.has(name))) {
    throw new Error("Detailed package contains a player outside the current tournament field.");
  }
  if (rows.some((row) => REQUIRED_MODEL_FIELDS.some((fieldName) => !(fieldName in row)))) {
    throw new Error("Detailed package is missing a required normalized model category.");
  }
  if (rows.some((row) => row["Model Data Generated At"] !== generatedAt)) {
    throw new Error("Detailed package generation timestamps are missing or inconsistent.");
  }

  const eligible = rows.filter((row) => row.dataCompletenessScore >= 5).length;
  if (eligible < 50) {
    throw new Error(`Detailed package has suspiciously low evidence coverage (${eligible}/${rows.length}).`);
  }

  const coverage = Object.fromEntries(
    REQUIRED_MODEL_FIELDS.map((fieldName) => [fieldName, rows.filter((row) => finite(row[fieldName])).length]),
  );
  return { rows, coverage, eligible, ineligible: rows.length - eligible, slug: config.slug };
}

function validateInputs({ field, stats, statsMeta, trend, history, config, generatedAt }) {
  if (!field?.validated || !Array.isArray(field.players) || field.players.length < 100) {
    throw new Error("Current field is absent, unvalidated, or suspiciously empty.");
  }
  if (field.tournamentId !== config.field.tournamentId || field.tournamentSlug !== config.field.tournamentSlug) {
    throw new Error(`Current field ${field.tournamentId}/${field.tournamentSlug} does not match ${config.slug}.`);
  }
  assertFreshTimestamp(field.fetchedAt, generatedAt, "Current field");
  if (!Array.isArray(stats) || stats.length < 100 || REQUIRED_STAT_FIELDS.some((key) => stats.filter((row) => finite(row[key])).length < 75)) {
    throw new Error("PGA stats are missing a required category or have suspiciously low coverage.");
  }
  if (!statsMeta?.syncedAt || Date.parse(statsMeta.syncedAt) > Date.parse(generatedAt) + 60_000) {
    throw new Error("PGA stats metadata timestamp is invalid.");
  }
  assertFreshTimestamp(statsMeta.syncedAt, generatedAt, "PGA stats");
  if (trend?.schemaVersion !== "jkb-trend-rankings-v2" || trend?.validation?.status !== "valid" || !Array.isArray(trend.players)) {
    throw new Error("JKB Trend must use the corrected, validated v2 artifact.");
  }
  assertFreshTimestamp(trend.generatedAt, generatedAt, "JKB Trend");
  if (history?.schemaVersion !== "pga-round-history-actual-strokes-v2" || history?.health?.status !== "available" || !Array.isArray(history.rounds)) {
    throw new Error("PGA round history must use the validated actual-strokes artifact.");
  }
  assertFreshTimestamp(history.generatedAt, generatedAt, "PGA round history");
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(generated) || Math.abs(Date.now() - generated) > 24 * 60 * 60 * 1000) {
    throw new Error("Detailed package generation timestamp is invalid or stale.");
  }
}

function assertFreshTimestamp(value, generatedAt, label) {
  const timestamp = Date.parse(value);
  const generated = Date.parse(generatedAt);
  const maximumAgeMs = 14 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(timestamp) || timestamp > generated + 60_000 || generated - timestamp > maximumAgeMs) {
    throw new Error(`${label} timestamp is invalid or older than 14 days.`);
  }
}

function buildCourseHistoryScores(rounds, configuredCourseName, venueMinimumRounds) {
  const groupScores = new Map();
  for (const round of rounds) {
    if (!finite(round.strokes)) continue;
    const groupKey = `${round.eventId}|${round.round}`;
    const group = groupScores.get(groupKey) ?? [];
    group.push(round.strokes);
    groupScores.set(groupKey, group);
  }
  const groupMeans = new Map([...groupScores].map(([key, values]) => [key, mean(values)]));
  const byPlayer = new Map();
  for (const round of rounds) {
    const meanScore = groupMeans.get(`${round.eventId}|${round.round}`);
    if (!finite(round.strokes) || !finite(meanScore)) continue;
    const key = normalizePgaPlayerName(round.player);
    const entry = byPlayer.get(key) ?? { venue: [], event: [] };
    const value = meanScore - round.strokes;
    entry.event.push(value);
    if (normalizeEvent(round.courseName) === normalizeEvent(configuredCourseName)) entry.venue.push(value);
    byPlayer.set(key, entry);
  }
  return new Map([...byPlayer].map(([key, values]) => {
    const selected = values.venue.length >= venueMinimumRounds ? values.venue : values.event;
    return [key, { rounds: selected.length, score: round(mean(selected), 3) }];
  }));
}

function buildEventFinishes(rounds) {
  const byPlayer = new Map();
  for (const round of rounds) {
    if (!round.finishText || !Number.isInteger(round.season)) continue;
    const key = normalizePgaPlayerName(round.player);
    const finishes = byPlayer.get(key) ?? new Map();
    if (!finishes.has(round.season)) finishes.set(round.season, String(round.finishText));
    byPlayer.set(key, finishes);
  }
  return byPlayer;
}

function applyCompetitionRanks(rows, rawField, rankField, direction) {
  const sorted = rows
    .filter((row) => finite(row[rawField]))
    .sort((left, right) => {
      const delta = left[rawField] - right[rawField];
      if (delta !== 0) return direction === "asc" ? delta : -delta;
      return String(left["Player Name"]).localeCompare(String(right["Player Name"]));
    });
  let previous = null;
  let rank = 0;
  sorted.forEach((row, index) => {
    if (previous === null || row[rawField] !== previous) rank = index + 1;
    row[rankField] = rank;
    previous = row[rawField];
  });
}

function uniqueMap(rows, getName, label) {
  const result = new Map();
  for (const row of rows) {
    const key = normalizePgaPlayerName(getName(row));
    if (!key) throw new Error(`${label} contains a blank player identity.`);
    if (result.has(key)) throw new Error(`${label} contains duplicate player identity ${key}.`);
    result.set(key, row);
  }
  return result;
}

function normalizeEvent(value) {
  return normalizePgaPlayerName(value).replace(/ golf club| gc/g, "").trim();
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrNull(value) {
  return finite(value) ? value : null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
