import { resolve } from "node:path";
import { fetchCfbdJson, writeAtomic, type CfbdRequest } from "./lib/cfb-cfbd-client";

const ROOT = process.env.CFB_TEST_ROOT?.trim() || resolve(import.meta.dirname, "..");
const RAW_DIR = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const API_KEY = process.env.CFBD_API_KEY?.trim();
const SEASON = Number(process.env.CFB_SEASON ?? 2026);

/**
 * Odds-only refresh: exactly one CFBD request (GET /lines?year=<season>).
 * Deliberately does not fetch teams, games, stats, plays, talent, or
 * returning production — those feed ratings/calibration, not the market
 * odds merged into the committed schedule by cfb:refresh-market-odds.
 * On any failure, no file is written — writeAtomic is only called after a
 * successful response, so the previously-cached raw lines file (and
 * therefore last-known-good odds downstream) is left untouched.
 */
async function main() {
  if (!API_KEY) {
    throw new Error(
      "CFBD_API_KEY is required. Set it in the process environment, then run npm run cfb:refresh-market-odds. No cache file was written.",
    );
  }

  const request: CfbdRequest = {
    name: `lines-${SEASON}`,
    path: "/lines",
    query: { year: SEASON },
  };

  const response = await fetchCfbdJson<unknown[]>(request, API_KEY);
  const text = `${JSON.stringify(response.data, null, 2)}\n`;
  writeAtomic(resolve(RAW_DIR, `lines-${SEASON}.json`), text);

  console.log(
    `[cfb:fetch-market-odds] lines-${SEASON}: ${response.data.length} rows` +
      (response.remainingCalls ? `; ${response.remainingCalls} calls remaining` : ""),
  );
}

main().catch((error) => {
  console.error(`[cfb:fetch-market-odds] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
