/** Read-only comparison of two complete Current OVR / spread states. */
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { buildCurrentRatingBoard } from "../../src/lib/nfl/currentRating2026.ts";
import { buildPowerNumberBoard } from "../../src/lib/nfl/jkbPowerNumber2026.ts";
import { buildPublicProjectionBoard } from "../../src/lib/nfl/publicProjection2026.ts";
import { validateNflV03ReviewArtifact } from "../../src/lib/nfl/v03Review.ts";
import { validateNflV04ProjectionArtifact } from "../../src/lib/nfl/v04Projection.ts";
import { validateTeamPerformanceAnalyticsArtifact } from "../../src/lib/nfl/teamPerformanceAnalytics.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const arg = (name: string) => {
  const value = process.argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value) throw new Error(`Missing ${name}`);
  return resolve(value);
};
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const oldPerformance = validateTeamPerformanceAnalyticsArtifact(read(arg("--old-performance")));
const newPerformance = validateTeamPerformanceAnalyticsArtifact(read(arg("--new-performance")));
const oldSpread = read(arg("--old-spreads"));
const newSpread = read(arg("--new-spreads"));
const output = arg("--output");
if (!relative(ROOT, output).startsWith("..")) throw new Error("Comparison output must be outside the repository");
const weekArg = process.argv.find((item) => item.startsWith("--week="));
const week = weekArg ? Number(weekArg.slice(7)) : 7;
if (oldPerformance._meta.season !== 2026 || newPerformance._meta.season !== 2026) throw new Error("Expected 2026 performance artifacts");
if (!newPerformance._meta.coverage || !newPerformance._meta.coverage.teamGames.length) throw new Error("New performance lacks verified team-game provenance");
const schedule = read(resolve(ROOT, "public/data/nfl/2026/games.json"));
const weekKickoffs = schedule.games.filter((game: { week: number; seasonType: string }) => game.week === week && game.seasonType === "REG")
  .map((game: { dateUtc: string }) => Date.parse(game.dateUtc));
if (!weekKickoffs.length) throw new Error(`No scheduled Week ${week} games`);
const firstKickoff = Math.min(...weekKickoffs);
const coverage = newPerformance._meta.coverage;
for (const [label, timestamp] of [["source retrieval", coverage.sourceRetrievedAt], ["game-data cutoff", coverage.gameDataCutoffAt],
  ["old spread generation", oldSpread.provenance?.generatedAt], ["corrected spread generation", newSpread.provenance?.generatedAt]] as const) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) >= firstKickoff) {
    throw new Error(`${label} is missing or is not before the first Week ${week} kickoff; refusing retrospective comparison`);
  }
}
const v03Path = resolve(ROOT, "public/data/nfl/2026/preseason-power-ratings.json");
const v04Path = resolve(ROOT, "public/data/nfl/2026/projected-power-ratings-v04.json");
const preseasonV03 = validateNflV03ReviewArtifact("preseason", 2026, read(v03Path), v03Path);
const v04Board = buildPublicProjectionBoard(validateNflV04ProjectionArtifact(read(v04Path), v04Path));
const board = (performanceAnalytics: typeof oldPerformance) => {
  const rating = buildCurrentRatingBoard({ season: 2026, v04Board, preseasonV03, performanceAnalytics });
  const power = buildPowerNumberBoard(rating);
  return new Map(power.teams.map((row) => [row.abbr, row]));
};
const oldBoard = board(oldPerformance);
const newBoard = board(newPerformance);
const teams = [...oldBoard.keys()].sort().map((team) => {
  const old = oldBoard.get(team)!;
  const corrected = newBoard.get(team)!;
  return { team, oldOVR: old.currentOVR, correctedOVR: corrected.currentOVR, deltaOVR: corrected.currentOVR - old.currentOVR,
    oldRank: old.currentOVRRank, correctedRank: corrected.currentOVRRank, rankChange: old.currentOVRRank - corrected.currentOVRRank,
    oldPowerNumber: old.powerNumber, correctedPowerNumber: corrected.powerNumber, deltaPowerNumber: corrected.powerNumber - old.powerNumber };
});
const oldGames = Object.values(oldSpread.projections).filter((game: any) => game.week === week) as any[];
const newGames = new Map((Object.values(newSpread.projections).filter((game: any) => game.week === week) as any[]).map((game) => [game.gameId, game]));
const spreads = oldGames.map((old) => {
  const corrected = newGames.get(old.gameId);
  if (!corrected) throw new Error(`Corrected spread missing ${old.gameId}`);
  return { gameId: old.gameId, awayTeam: old.awayTeam, homeTeam: old.homeTeam,
    oldHomeMargin: old.projectedHomeMargin, correctedHomeMargin: corrected.projectedHomeMargin,
    deltaHomeMargin: corrected.projectedHomeMargin - old.projectedHomeMargin,
    oldDisplay: old.formattedJkbSpread, correctedDisplay: corrected.formattedJkbSpread };
}).sort((a, b) => Math.abs(b.deltaHomeMargin) - Math.abs(a.deltaHomeMargin));
if (spreads.length !== newGames.size) throw new Error("Week game sets differ");
const comparison = {
  season: 2026, week,
  oldSource: { generatedAt: oldPerformance._meta.generatedAt, throughWeek: oldPerformance._meta.throughWeek, includedGameCount: oldPerformance._meta.includedGameCount },
  correctedSource: { generatedAt: newPerformance._meta.generatedAt, throughWeek: newPerformance._meta.throughWeek,
    includedGameCount: newPerformance._meta.includedGameCount, ...newPerformance._meta.coverage },
  teams, spreads,
};
writeFileSync(output, `${JSON.stringify(comparison, null, 2)}\n`);
console.log(`Compared ${teams.length} teams and ${spreads.length} Week ${week} spreads -> ${output}`);
