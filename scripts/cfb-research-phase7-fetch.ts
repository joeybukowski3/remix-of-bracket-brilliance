import { resolve } from "node:path";
import { CFB_RESEARCH_BACKFILL_SEASONS, CFB_RESEARCH_RAW_DIR } from "../src/lib/cfb/research/config/researchConfig";
import { writeRawDataset } from "../src/lib/cfb/research/ingestion/manifestWriter";
import { fetchQbUsageForSeason } from "../src/lib/cfb/research/phase7/ingestion/fetchPlayerUsageQb";
import { fetchCoachesForSeason } from "../src/lib/cfb/research/phase7/ingestion/fetchCoaches";
import { fetchTransferPortalForSeason } from "../src/lib/cfb/research/phase7/ingestion/fetchTransferPortal";

// Section 7/9/10 bounded data extension: three small bulk endpoints CFBD
// already exposes cleanly. Written under the SAME shared raw dir as Work
// Unit 2 (data/cfb/research/raw/{season}/) but as new files only — no
// existing raw file is read or overwritten by this script.

const ROOT = resolve(import.meta.dirname, "..");
const RAW_ROOT = resolve(ROOT, CFB_RESEARCH_RAW_DIR);
const API_KEY = process.env.CFBD_API_KEY?.trim();

const requestedSeasons = process.argv
  .slice(2)
  .filter((arg) => /^\d{4}$/.test(arg))
  .map(Number);
const seasons = requestedSeasons.length > 0 ? requestedSeasons : [...CFB_RESEARCH_BACKFILL_SEASONS];

async function main(): Promise<void> {
  if (!API_KEY) throw new Error("CFBD_API_KEY not set");
  const fetchedAt = new Date().toISOString();

  for (const season of seasons) {
    const usage = await fetchQbUsageForSeason(season, API_KEY);
    writeRawDataset({
      filePath: resolve(RAW_ROOT, String(season), "player-usage-qb.json"),
      data: usage.data,
      endpoint: "/player/usage",
      params: { year: season, position: "QB" },
      season,
      week: null,
      fetchedAt,
    });
    console.log(`[cfb:research:phase7:fetch] ${season} QB usage: ${usage.data.length} rows`);

    const coaches = await fetchCoachesForSeason(season, API_KEY);
    writeRawDataset({
      filePath: resolve(RAW_ROOT, String(season), "coaches.json"),
      data: coaches.data,
      endpoint: "/coaches",
      params: { year: season },
      season,
      week: null,
      fetchedAt,
    });
    console.log(`[cfb:research:phase7:fetch] ${season} coaches: ${coaches.data.length} rows`);

    const portal = await fetchTransferPortalForSeason(season, API_KEY);
    writeRawDataset({
      filePath: resolve(RAW_ROOT, String(season), "transfer-portal.json"),
      data: portal.data,
      endpoint: "/player/portal",
      params: { year: season },
      season,
      week: null,
      fetchedAt,
    });
    console.log(`[cfb:research:phase7:fetch] ${season} transfer portal: ${portal.data.length} rows`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
