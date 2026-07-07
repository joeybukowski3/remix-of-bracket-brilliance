import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NFL_SCHEMA_VERSION } from "../../../scripts/lib/nfl-data-meta.mjs";
import {
  etToUtcIso,
  parseCsv,
  runPipeline,
  transformSeasonRows,
  buildNflverseTeamMap,
} from "../../../scripts/lib/nfl-schedules-results-core.mjs";

const ROOT = resolve(__dirname, "../../..");
const SEASONS = [2022, 2023, 2024, 2025, 2026];
const TEAMS_JSON = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8"));
const CANONICAL_ABBRS = new Set(TEAMS_JSON.teams.map((t: { abbr: string }) => t.abbr));

type GameRecord = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  dateUtc: string | null;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  status: string;
  stadium: string | null;
  isDome: boolean | null;
};

type ResultRecord = GameRecord & {
  homeScore: number;
  awayScore: number;
  winner: string;
  margin: number;
  totalPoints: number;
  final: boolean;
  source: string;
};

function readSeason(season: number) {
  const games = JSON.parse(readFileSync(join(ROOT, `public/data/nfl/${season}/games.json`), "utf-8"));
  const results = JSON.parse(readFileSync(join(ROOT, `public/data/nfl/${season}/results.json`), "utf-8"));
  return { games, results };
}

const FIXTURE_HEADER =
  "game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,roof,stadium";
const FIXTURE_CSV = [
  FIXTURE_HEADER,
  '2025_01_BUF_MIA,2025,REG,1,2025-09-07,13:00,BUF,31,MIA,20,outdoors,Hard Rock Stadium',
  '2025_01_LA_WAS,2025,REG,1,2025-09-07,16:25,LA,17,WAS,17,outdoors,Northwest Stadium',
  '2025_22_SEA_NE,2025,SB,22,2026-02-08,18:30,SEA,29,NE,13,"",Levi\'s Stadium',
  "2026_01_NE_SEA,2026,REG,1,2026-09-09,20:20,NE,,SEA,,outdoors,Lumen Field",
].join("\n");

describe("generated season files (real pipeline output)", () => {
  it("exist for all seasons 2022-2026", () => {
    for (const season of SEASONS) {
      expect(existsSync(join(ROOT, `public/data/nfl/${season}/games.json`)), `${season} games`).toBe(true);
      expect(existsSync(join(ROOT, `public/data/nfl/${season}/results.json`)), `${season} results`).toBe(true);
    }
  });

  it("carry an nfl-v0.1 _meta block naming the nflverse source", () => {
    for (const season of SEASONS) {
      const { games, results } = readSeason(season);
      for (const file of [games, results]) {
        expect(file._meta.schemaVersion).toBe(NFL_SCHEMA_VERSION);
        expect(file._meta.source).toContain("nflverse");
        expect(file._meta.season).toBe(season);
        expect(Array.isArray(file._meta.notes)).toBe(true);
      }
    }
  });

  it("games match the schema shape the standings/schedule pages expect", () => {
    const { games } = readSeason(2025);
    expect(games.games.length).toBeGreaterThan(0);
    for (const game of games.games as GameRecord[]) {
      expect(typeof game.gameId).toBe("string");
      expect(game.season).toBe(2025);
      expect(Number.isInteger(game.week)).toBe(true);
      expect(["REG", "WC", "DIV", "CON", "SB"]).toContain(game.seasonType);
      expect(["final", "scheduled"]).toContain(game.status);
      expect(game.dateUtc === null || !Number.isNaN(Date.parse(game.dateUtc))).toBe(true);
      expect(typeof game.homeTeam).toBe("string");
      expect(typeof game.awayTeam).toBe("string");
    }
  });

  it("every team abbr in every season maps to a canonical team", () => {
    for (const season of SEASONS) {
      const { games } = readSeason(season);
      for (const game of games.games as GameRecord[]) {
        expect(CANONICAL_ABBRS.has(game.homeAbbr), `${game.gameId} home ${game.homeAbbr}`).toBe(true);
        expect(CANONICAL_ABBRS.has(game.awayAbbr), `${game.gameId} away ${game.awayAbbr}`).toBe(true);
      }
    }
  });

  it("has no duplicate gameId within a season and every result maps to a game", () => {
    for (const season of SEASONS) {
      const { games, results } = readSeason(season);
      const ids = (games.games as GameRecord[]).map((g) => g.gameId);
      expect(new Set(ids).size).toBe(ids.length);
      const idSet = new Set(ids);
      for (const result of results.results as ResultRecord[]) {
        expect(idSet.has(result.gameId), `orphan result ${result.gameId}`).toBe(true);
      }
    }
  });

  it("completed results have consistent scores, winner, margin and totals", () => {
    for (const season of [2022, 2025]) {
      const { results } = readSeason(season);
      for (const result of results.results as ResultRecord[]) {
        expect(Number.isInteger(result.homeScore) && result.homeScore >= 0).toBe(true);
        expect(Number.isInteger(result.awayScore) && result.awayScore >= 0).toBe(true);
        expect(result.margin).toBe(Math.abs(result.homeScore - result.awayScore));
        expect(result.totalPoints).toBe(result.homeScore + result.awayScore);
        expect(result.final).toBe(true);
        const expectedWinner =
          result.homeScore === result.awayScore
            ? "TIE"
            : result.homeScore > result.awayScore
              ? result.homeAbbr
              : result.awayAbbr;
        expect(result.winner).toBe(expectedWinner);
      }
    }
  });

  it("2026 has a full 272-game schedule and zero results (documented preseason state)", () => {
    const { games, results } = readSeason(2026);
    expect(games.games).toHaveLength(272);
    expect(results.results).toHaveLength(0);
    expect((games.games as GameRecord[]).every((g) => g.status === "scheduled")).toBe(true);
    expect(results._meta.notes.some((n: string) => n.includes("No 2026 games have been completed"))).toBe(true);
  });

  it("2022 omits the cancelled BUF-CIN game (271 REG results) and documents it", () => {
    const { games, results } = readSeason(2022);
    const regResults = (results.results as ResultRecord[]).filter((r) => r.seasonType === "REG");
    expect(regResults).toHaveLength(271);
    expect((games.games as GameRecord[]).some((g) => g.gameId === "2022_17_BUF_CIN")).toBe(false);
    expect(results._meta.notes.some((n: string) => n.includes("cancelled"))).toBe(true);
    expect(games._meta.notes.some((n: string) => n.includes("cancelled"))).toBe(true);
  });
});

describe("pipeline core (fixture input)", () => {
  it("transforms rows into games and results with nflverse->site abbr mapping", () => {
    const rows = parseCsv(FIXTURE_CSV);
    const teamMap = buildNflverseTeamMap(TEAMS_JSON);
    const { games, results } = transformSeasonRows(
      rows.filter((r: { season: string }) => Number(r.season) === 2025),
      2025,
      teamMap
    );
    expect(games).toHaveLength(3);
    expect(results).toHaveLength(3);
    const tie = results.find((r: ResultRecord) => r.gameId === "2025_01_LA_WAS")!;
    expect(tie.homeAbbr).toBe("wsh"); // WAS -> wsh
    expect(tie.awayAbbr).toBe("lar"); // LA -> lar
    expect(tie.winner).toBe("TIE");
    expect(tie.margin).toBe(0);
    expect(tie.totalPoints).toBe(34);
    const sb = games.find((g: GameRecord) => g.seasonType === "SB")!;
    expect(sb.status).toBe("final");
    expect(sb.isDome).toBeNull(); // quoted-empty roof in source
  });

  it("converts US Eastern kickoff times to UTC across DST boundaries", () => {
    expect(etToUtcIso("2025-09-07", "13:00")).toBe("2025-09-07T17:00:00.000Z"); // EDT -4
    expect(etToUtcIso("2026-02-08", "18:30")).toBe("2026-02-08T23:30:00.000Z"); // EST -5
    expect(etToUtcIso("", "13:00")).toBeNull();
    expect(etToUtcIso("2025-09-07", "")).toBeNull();
  });

  it("hard-fails on an unknown team abbreviation", () => {
    const bad = [FIXTURE_HEADER, "2025_01_XXX_MIA,2025,REG,1,2025-09-07,13:00,XXX,10,MIA,20,outdoors,Somewhere"].join("\n");
    expect(() =>
      runPipeline({ csvText: bad, teamsJson: TEAMS_JSON, seasons: [2025], outputDir: "unused", dryRun: true })
    ).toThrow(/Unknown nflverse team abbreviation "XXX"/);
  });

  it("hard-fails on rows with only one score", () => {
    const bad = [FIXTURE_HEADER, "2025_01_BUF_MIA,2025,REG,1,2025-09-07,13:00,BUF,,MIA,20,outdoors,Somewhere"].join("\n");
    expect(() =>
      runPipeline({ csvText: bad, teamsJson: TEAMS_JSON, seasons: [2025], outputDir: "unused", dryRun: true })
    ).toThrow(/only one score/);
  });

  it("dry-run reports counts without writing any files", () => {
    const dir = mkdtempSync(join(tmpdir(), "nfl-dry-run-"));
    try {
      const summaries = runPipeline({
        csvText: FIXTURE_CSV,
        teamsJson: TEAMS_JSON,
        seasons: [2025, 2026],
        outputDir: dir,
        dryRun: true,
      });
      expect(summaries).toEqual([
        { season: 2025, gameCount: 3, resultCount: 3, written: [] },
        { season: 2026, gameCount: 1, resultCount: 0, written: [] },
      ]);
      expect(readdirSync(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("real run writes deterministic files (identical except generatedAt)", () => {
    const dirA = mkdtempSync(join(tmpdir(), "nfl-det-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "nfl-det-b-"));
    try {
      const opts = { csvText: FIXTURE_CSV, teamsJson: TEAMS_JSON, seasons: [2025] };
      runPipeline({ ...opts, outputDir: dirA });
      runPipeline({ ...opts, outputDir: dirB });
      const normalize = (dir: string) =>
        readFileSync(join(dir, "2025/games.json"), "utf-8").replace(/"generatedAt": "[^"]+"/, '"generatedAt": "X"');
      expect(normalize(dirA)).toBe(normalize(dirB));
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});
