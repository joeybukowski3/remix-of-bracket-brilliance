/** Generates the compact ROS last-eight-points research artifact. */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { buildLastEightPointsRanks } from "../src/lib/fantasy/lastEightPoints.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEASONS = [2025] as const;
const STATS_DIRECTORY = join(ROOT, "data", "nfl", "nflverse", "stats-player-week");
const PLAYERS_PATH = join(ROOT, "data", "nfl", "nflverse", "players", "players.csv");
const MANIFEST_PATH = join(ROOT, "data", "nfl", "nflverse", "stats-player-week", "manifest.json");
const OUTPUT_PATH = join(ROOT, "data", "fantasy", "ros-last8-ppr.json");
const SCORING_VERSION = "jkb-full-ppr-v1.0.0";

type CsvRow = Record<string, string>;

const stats = SEASONS.flatMap((season) =>
  parseCsv(readFileSync(join(STATS_DIRECTORY, `stats_player_week_${season}.csv`), "utf8")) as CsvRow[],
);
const players = parseCsv(readFileSync(PLAYERS_PATH, "utf8")) as CsvRow[];
const playerByGsis = new Map(players.map((row) => [row.gsis_id, row]));

function number(source: CsvRow, key: string): number {
  const value = Number(source[key]);
  if (source[key] === "" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${key} for ${source.player_display_name} Week ${source.week}.`);
  }
  return value;
}

/** Mirrors the immutable jkb-full-ppr-v1.0.0 authority and audits nflverse's PPR field. */
function calculateFullPpr(source: CsvRow): number {
  const twoPointConversions =
    number(source, "passing_2pt_conversions") +
    number(source, "rushing_2pt_conversions") +
    number(source, "receiving_2pt_conversions");
  return (
    number(source, "passing_yards") * 0.04 +
    number(source, "passing_tds") * 4 -
    number(source, "interceptions") * 2 +
    number(source, "rushing_yards") * 0.1 +
    number(source, "rushing_tds") * 6 +
    number(source, "receptions") +
    number(source, "receiving_yards") * 0.1 +
    number(source, "receiving_tds") * 6 -
    (number(source, "sack_fumbles_lost") +
      number(source, "rushing_fumbles_lost") +
      number(source, "receiving_fumbles_lost")) * 2 +
    twoPointConversions * 2 +
    number(source, "special_teams_tds") * 6
  );
}

const games = stats.flatMap((source) => {
  if (source.season_type.toUpperCase() !== "REG") return [];
  const position = source.position.toUpperCase();
  if (!(["QB", "RB", "WR", "TE"] as const).includes(position as "QB" | "RB" | "WR" | "TE")) return [];
  const player = playerByGsis.get(source.player_id);
  const fantasyPoints = calculateFullPpr(source);
  const upstreamPpr = number(source, "fantasy_points_ppr");
  if (Math.abs(fantasyPoints - upstreamPpr) > 0.011) {
    throw new Error(`PPR audit mismatch for ${source.player_display_name} Week ${source.week}.`);
  }
  return [{
    season: number(source, "season"),
    week: number(source, "week"),
    seasonType: "REG",
    playerId: `gsis:${source.player_id}`,
    playerName: source.player_display_name.trim(),
    position: position as "QB" | "RB" | "WR" | "TE",
    fantasyPoints,
    externalIds: {
      gsis: source.player_id,
      pfr: player?.pfr_id || null,
      espn: player?.espn_id || null,
    },
  }];
});

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
  files?: Array<{ season: number; retrievedDateUtc: string; sha256: string; filename: string }>;
};
const sources = SEASONS.map((season) => manifest.files?.find((entry) => entry.season === season));
if (sources.some((source) => !source)) throw new Error("A committed player-week manifest entry is missing.");

const rows = buildLastEightPointsRanks(games);
const outputRows = rows.map(({ games: _games, rank: _rank, poolSize: _poolSize, ...row }) => row);
const artifact = {
  _meta: {
    schemaVersion: "fantasy-ros-last8-points-v2",
    seasons: SEASONS,
    source: "committed nflverse stats_player weekly cache",
    sourceFiles: sources.map((source) => ({ filename: source!.filename, sha256: source!.sha256 })),
    sourceAsOf: sources.map((source) => source!.retrievedDateUtc).sort().at(-1),
    scoringFormat: "PPR",
    scoringVersion: SCORING_VERSION,
    eligibility: "Last eight available 2025 REG player-game rows; prior seasons and postseason excluded",
    summaryBasis: "Total fantasy points across each canonical player's eligible 2025 sample",
    consumerRankBasis: "Current JKB ROS board players with valid samples, ranked within canonical position",
    rowCount: outputRows.length,
  },
  rows: outputRows,
};

const temporaryPath = `${OUTPUT_PATH}.tmp`;
try {
  writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, OUTPUT_PATH);
} catch (error) {
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  throw error;
}
console.log(`Wrote ${outputRows.length} last-eight summaries to ${OUTPUT_PATH}`);
