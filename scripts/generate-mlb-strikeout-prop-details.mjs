/** Generate per-pitcher strikeout prop detail data. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStarterPregameKContext, buildStrikeoutPropDetail } from "./lib/mlb-strikeout-prop-details-core.mjs";
import { fetchOpponentContext } from "./lib/mlb-opponent-k-context.mjs";
import {
  buildLeagueReferenceContext,
  fetchLeagueReferencePlateAppearances,
} from "./lib/mlb-strikeout-reference-context.mjs";
import {
  buildTeamAbbrById,
  buildTeamIdByAbbr,
  fetchAllTeams,
  fetchOpponentLastFiveGamesDetail,
  fetchPitcherSeasonStarts,
  fetchTeamRecentCompletedGames,
} from "./lib/mlb-strikeout-prop-details-fetch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const DEFAULT_INPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const OUTPUT_PATH = path.join(DATA_DIR, "strikeout-prop-details.json");
const SOURCE_LABEL = "mlb_stats_api+baseball_savant";
const MLB_TEAM_COUNT = 30;
const OPPONENT_RECENT_GAMES_LIMIT = 10;
const OPPONENT_RECENT_GAMES_LOOKBACK_DAYS = 45;

function parseArgs(argv) {
  const args = { dryRun: false, input: DEFAULT_INPUT_PATH };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--input=")) args.input = path.resolve(arg.slice("--input=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function dedupePitcherRows(pitchers) {
  const seen = new Set();
  const rows = [];
  for (const pitcher of pitchers ?? []) {
    if (!pitcher?.pitcherId || !pitcher?.pitcher || !pitcher?.team || !pitcher?.opponent) continue;
    const dedupeKey = `${pitcher.gamePk ?? pitcher.gameId ?? pitcher.gameKey}|${pitcher.pitcherId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push(pitcher);
  }
  return rows;
}

function positiveId(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let raw;
  try {
    raw = JSON.parse(readFileSync(args.input, "utf8"));
  } catch (error) {
    throw new Error(`Could not read/parse ${args.input}: ${error.message}`);
  }

  const slateDate = raw?.date;
  if (!slateDate) throw new Error(`${args.input} is missing a "date" field — cannot determine slate date.`);
  const season = Number(String(slateDate).slice(0, 4));
  if (!Number.isInteger(season)) throw new Error(`Could not derive a season from slate date "${slateDate}".`);

  const pitcherRows = dedupePitcherRows(raw.pitchers);
  console.log(`[strikeout-prop-details] slate ${slateDate} (season ${season}): ${pitcherRows.length} pitcher rows to process`);

  const teams = await fetchAllTeams(season);
  if (!teams.length) throw new Error("Could not resolve the MLB team list — required for every row.");
  const teamAbbrById = buildTeamAbbrById(teams);
  const teamIdByAbbr = buildTeamIdByAbbr(teams);

  console.log(`[reference-context] fetching league plate-appearance reference for ${teams.length} teams...`);
  const leagueReference = await fetchLeagueReferencePlateAppearances(teams, season, slateDate);
  const referenceContextCache = new Map();
  const referenceFor = (team, cutoffDate, pitcherHand) => {
    if (!team || !cutoffDate) return null;
    const normalizedHand = pitcherHand === "L" || pitcherHand === "R" ? pitcherHand : null;
    const cacheKey = `${cutoffDate}|${normalizedHand ?? "unknown"}`;
    if (!referenceContextCache.has(cacheKey)) {
      referenceContextCache.set(cacheKey, buildLeagueReferenceContext(
        leagueReference.rowsByTeam,
        cutoffDate,
        normalizedHand,
        { expectedTeamCount: MLB_TEAM_COUNT },
      ));
    }
    return referenceContextCache.get(cacheKey).get(team) ?? null;
  };

  const boxscoreCache = new Map();
  const pitcherStartsCache = new Map();
  const opponentGamesCache = new Map();
  const opponentContextCache = new Map();
  const opposingStarterStartsCache = new Map();
  const details = [];
  const warnings = [];
  let successCount = 0;
  let partialCount = 0;

  if (leagueReference.errors.length) {
    warnings.push(`visual reference ranks unavailable for ${leagueReference.errors.length} team feed(s): ${leagueReference.errors.join(", ")}`);
  }

  for (const pitcher of pitcherRows) {
    const gamePk = positiveId(pitcher.gamePk ?? pitcher.gameId);
    const teamId = positiveId(pitcher.teamId) ?? teamIdByAbbr.get(pitcher.team) ?? null;
    const opponentId = positiveId(pitcher.opponentId) ?? teamIdByAbbr.get(pitcher.opponent) ?? null;
    const sourceWarnings = [];
    if (gamePk == null) sourceWarnings.push("GAME_PK_UNRESOLVED");
    if (teamId == null) sourceWarnings.push("TEAM_ID_UNRESOLVED");
    if (opponentId == null) sourceWarnings.push("OPPONENT_ID_UNRESOLVED");

    if (!pitcherStartsCache.has(pitcher.pitcherId)) {
      pitcherStartsCache.set(
        pitcher.pitcherId,
        fetchPitcherSeasonStarts(pitcher.pitcherId, season, slateDate, teamAbbrById),
      );
    }
    const { starts, error: startsError } = await pitcherStartsCache.get(pitcher.pitcherId);
    if (startsError) {
      sourceWarnings.push("API_REQUEST_FAILED");
      warnings.push(`${pitcher.pitcher}: pitcher last-5-starts unavailable (${startsError.message})`);
    }

    const pitcherHand = pitcher.hand === "L" || pitcher.hand === "R" ? pitcher.hand : null;
    const startsWithPregameOpponentContext = starts.map((start) => {
      const reference = referenceFor(start.opponentAbbr, start.date, pitcherHand);
      return {
        ...start,
        opponentKRateRankL30: reference?.opponentKRateRankL30 ?? null,
        opponentKRateRankL30VsHand: reference?.opponentKRateRankL30VsHand ?? null,
        opponentWrcPlusRankL30: reference?.opponentWrcPlusRankL30 ?? null,
        opponentMetricsCutoff: start.date ?? null,
      };
    });

    let opponentGameRows = [];
    let opponentContext = null;
    if (opponentId == null) {
      warnings.push(`${pitcher.pitcher}: could not resolve team id for opponent "${pitcher.opponent}"`);
    } else {
      if (!opponentGamesCache.has(pitcher.opponent)) {
        opponentGamesCache.set(
          pitcher.opponent,
          (async () => {
            const { games, error } = await fetchTeamRecentCompletedGames(opponentId, slateDate, {
              limit: OPPONENT_RECENT_GAMES_LIMIT,
              lookbackDays: OPPONENT_RECENT_GAMES_LOOKBACK_DAYS,
            });
            if (error) return { rows: [], error };
            return { rows: await fetchOpponentLastFiveGamesDetail(opponentId, games, boxscoreCache), error: null };
          })(),
        );
      }
      const { rows, error: opponentError } = await opponentGamesCache.get(pitcher.opponent);
      if (opponentError) {
        sourceWarnings.push("OPPONENT_API_REQUEST_FAILED");
        warnings.push(`${pitcher.opponent}: opponent last-10-games unavailable (${opponentError.message})`);
      }
      opponentGameRows = await Promise.all(rows.map(async (game) => {
        if (game.opposingStartingPitcherId == null || !game.date) {
          return { ...game, opposingStarterSeasonKPerGame: null, opposingStarterLastFiveKPerGamePrior: null };
        }
        if (!opposingStarterStartsCache.has(game.opposingStartingPitcherId)) {
          opposingStarterStartsCache.set(
            game.opposingStartingPitcherId,
            fetchPitcherSeasonStarts(game.opposingStartingPitcherId, season, slateDate, teamAbbrById),
          );
        }
        const starterHistory = await opposingStarterStartsCache.get(game.opposingStartingPitcherId);
        if (starterHistory.error) {
          sourceWarnings.push("OPPOSING_STARTER_HISTORY_FAILED");
          return { ...game, opposingStarterSeasonKPerGame: null, opposingStarterLastFiveKPerGamePrior: null };
        }
        const pregame = buildStarterPregameKContext(starterHistory.starts, game.date);
        return {
          ...game,
          opposingStarterSeasonKPerGame: pregame.seasonKPerGame,
          opposingStarterLastFiveKPerGamePrior: pregame.lastFiveKPerGame,
        };
      }));

      if (!opponentContextCache.has(pitcher.opponent)) {
        opponentContextCache.set(
          pitcher.opponent,
          fetchOpponentContext(opponentId, pitcher.opponent, season, slateDate),
        );
      }
      opponentContext = await opponentContextCache.get(pitcher.opponent);
      if (opponentContext?.warnings?.length) {
        sourceWarnings.push(...opponentContext.warnings.map((warning) => warning.split(":")[0]));
        warnings.push(...opponentContext.warnings.map((warning) => `${pitcher.opponent}: ${warning}`));
      }
    }

    const detail = buildStrikeoutPropDetail({
      pitcher: pitcher.pitcher,
      team: pitcher.team,
      opponent: pitcher.opponent,
      slateDate,
      gameDate: slateDate,
      gamePk,
      pitcherId: pitcher.pitcherId,
      teamId,
      opponentId,
      pitcherStarts: startsWithPregameOpponentContext,
      opponentLastFiveGames: opponentGameRows,
      sourceWarnings,
      generatedAt: new Date().toISOString(),
      source: SOURCE_LABEL,
      pitcherHand,
      opponentReference: referenceFor(pitcher.opponent, slateDate, pitcherHand),
    });
    detail.opponentContext = opponentContext;
    details.push(detail);

    if (detail.pitcherRecentStarts.length > 0 && detail.opponentLastFiveGames.length > 0) successCount += 1;
    else partialCount += 1;
  }

  const rankFieldCoverage = (records, read) => records.reduce((count, record) => count + (read(record) != null ? 1 : 0), 0);
  const historicalStarts = details.flatMap((detail) => detail.pitcherRecentStarts ?? []);
  const referenceRankDiagnostics = {
    records: details.length,
    opponentReferencePresent: details.filter((detail) => detail.opponentReference != null).length,
    currentDay: {
      opponentKRateRankL30: rankFieldCoverage(details, (d) => d.opponentReference?.opponentKRateRankL30),
      opponentKRateRankL30VsHand: rankFieldCoverage(details, (d) => d.opponentReference?.opponentKRateRankL30VsHand),
      opponentWrcPlusRankL30: rankFieldCoverage(details, (d) => d.opponentReference?.opponentWrcPlusRankL30),
      opponentWrcPlusRankL30VsHand: rankFieldCoverage(details, (d) => d.opponentReference?.opponentWrcPlusRankL30VsHand),
      opponentWrcPlusRankL10: rankFieldCoverage(details, (d) => d.opponentReference?.opponentWrcPlusRankL10),
    },
    historicalStartRows: historicalStarts.length,
    historicalOpponentWrcPlusRankL30: rankFieldCoverage(historicalStarts, (s) => s.opponentWrcPlusRankL30),
    leagueReferenceFeedErrors: leagueReference.errors,
  };
  const referenceRanksDegraded = referenceRankDiagnostics.currentDay.opponentWrcPlusRankL30 === 0
    && details.length > 0;
  if (referenceRanksDegraded) {
    warnings.push("opponent visual-reference ranks are entirely absent for this slate (Savant plate-appearance feed likely degraded)");
  }

  const payload = {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    source: SOURCE_LABEL,
    sources: {
      pitcherAndTeamStrikeouts: "MLB Stats API",
      opponentExpectedBattingAverage: "Baseball Savant Statcast",
      visualReferenceRanks: "Baseball Savant Statcast plate appearances (strict pregame cutoffs)",
    },
    date: slateDate,
    diagnostics: {
      referenceRanks: referenceRankDiagnostics,
      referenceRanksDegraded,
      warnings,
    },
    details,
  };

  console.log(`[strikeout-prop-details] built ${details.length} detail records (${successCount} full, ${partialCount} partial/unavailable)`);
  if (warnings.length) {
    console.warn(`[strikeout-prop-details] ${warnings.length} warning(s):`);
    for (const warning of warnings.slice(0, 25)) console.warn(`  - ${warning}`);
    if (warnings.length > 25) console.warn(`  ... and ${warnings.length - 25} more`);
  }

  if (args.dryRun) {
    console.log("[strikeout-prop-details] --dry-run: not writing output file.");
    return;
  }
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[strikeout-prop-details] wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`[strikeout-prop-details] FAILED: ${error.message}`);
  process.exit(1);
});
