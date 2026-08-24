import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildResearchManifest, buildSeasonCoverageReport } from "../src/lib/cfb/research/reporting/buildCoverageManifest";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import {
  CFB_RESEARCH_BACKFILL_SEASONS,
  CFB_RESEARCH_MANIFESTS_DIR,
  CFB_RESEARCH_NORMALIZED_DIR,
  CFB_RESEARCH_RAW_DIR,
} from "../src/lib/cfb/research/config/researchConfig";
import type { CfbResearchGame, CfbResearchMarketLine, CfbResearchPlay, CfbResearchTeamSeason } from "../src/lib/cfb/research/types";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_ROOT = resolve(ROOT, CFB_RESEARCH_RAW_DIR);
const NORMALIZED_ROOT = resolve(ROOT, CFB_RESEARCH_NORMALIZED_DIR);
const MANIFESTS_ROOT = resolve(ROOT, CFB_RESEARCH_MANIFESTS_DIR);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readPlaysForSeason(season: number): CfbResearchPlay[] {
  const seasonFile = resolve(NORMALIZED_ROOT, String(season), "plays.json");
  if (existsSync(seasonFile)) return readJson<CfbResearchPlay[]>(seasonFile);
  const playsDir = resolve(NORMALIZED_ROOT, String(season), "plays");
  if (!existsSync(playsDir)) return [];
  const rows: CfbResearchPlay[] = [];
  for (const file of readdirSync(playsDir).filter((name) => name.endsWith(".json")).sort()) {
    rows.push(...readJson<CfbResearchPlay[]>(resolve(playsDir, file)));
  }
  return rows;
}

function main() {
  const requestedSeasons = process.argv
    .slice(2)
    .filter((arg) => /^\d{4}$/.test(arg))
    .map(Number);
  const seasons = requestedSeasons.length > 0 ? requestedSeasons : [...CFB_RESEARCH_BACKFILL_SEASONS];

  const reports = seasons.map((season) => {
    const seasonRawManifestPath = resolve(RAW_ROOT, String(season), "manifest.json");
    const rawManifest = existsSync(seasonRawManifestPath)
      ? readJson<{ complete: boolean; incompleteReasons: string[] }>(seasonRawManifestPath)
      : { complete: false, incompleteReasons: [`missing raw manifest for season ${season}`] };

    const games = readJson<CfbResearchGame[]>(resolve(NORMALIZED_ROOT, String(season), "games.json"));
    const marketLines = readJson<CfbResearchMarketLine[]>(
      resolve(NORMALIZED_ROOT, String(season), "market-lines.json"),
    );
    const teamSeasons = readJson<CfbResearchTeamSeason[]>(
      resolve(NORMALIZED_ROOT, String(season), "team-season.json"),
    );
    const teamGameStatsGameIds = new Set(
      readJson<string[]>(resolve(NORMALIZED_ROOT, String(season), "team-game-stats-game-ids.json")),
    );
    const plays = readPlaysForSeason(season);

    return buildSeasonCoverageReport({
      season,
      games,
      plays,
      teamGameStatsGameIds,
      teamSeasons,
      marketLines,
      incomplete: !rawManifest.complete,
      incompleteReasons: rawManifest.incompleteReasons,
    });
  });

  const manifest = buildResearchManifest(reports);
  writeAtomic(
    resolve(MANIFESTS_ROOT, "research-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const report of reports) {
    console.log(
      `[cfb:research:manifest] ${report.season}: ${report.gamesCount} games (${report.finalGamesCount} final), ` +
        `${report.totalPlays} plays (ppa ${report.providerPpaCoveragePct}%), lines ${report.bettingLineCoveragePct}%, ` +
        `${report.incomplete ? "INCOMPLETE" : "complete"}`,
    );
  }
}

main();
