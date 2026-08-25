import { resolve } from "node:path";
import { fetchCfbdJson, writeAtomic, type CfbdRequest } from "./lib/cfb-cfbd-client";

const ROOT = process.env.CFB_TEST_ROOT?.trim() || resolve(import.meta.dirname, "..");
const RAW_DIR = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const API_KEY = process.env.CFBD_API_KEY?.trim();
const SEASON = Number(process.env.CFB_SEASON ?? 2026);

/**
 * Rankings-only refresh: exactly one CFBD request (GET /rankings?year=<season>).
 *
 * Deliberately mirrors cfb-fetch-market-odds.ts rather than reusing the broad
 * cfb:fetch-data pipeline — official polls must never trigger a schedule,
 * stats, talent, or ratings/calibration recompute. Requesting the whole season
 * (no week parameter) in one call lets the normalizer pick the latest published
 * AP/CFP poll itself, so weekly poll rollover costs no extra API calls.
 *
 * On any failure nothing is written: writeAtomic runs only after a successful
 * response, so the previously-cached raw rankings file — and therefore the
 * last-known-good committed ranking artifact downstream — is left untouched.
 *
 * CFBD_API_KEY is read from the process environment only and is never logged.
 */
async function main() {
  if (!API_KEY) {
    throw new Error(
      "CFBD_API_KEY is required. Set it in the process environment, then run npm run cfb:refresh-rankings. No cache file was written.",
    );
  }

  const request: CfbdRequest = {
    name: `rankings-${SEASON}`,
    path: "/rankings",
    query: { year: SEASON },
  };

  const response = await fetchCfbdJson<unknown[]>(request, API_KEY);
  const text = `${JSON.stringify(response.data, null, 2)}\n`;
  writeAtomic(resolve(RAW_DIR, `rankings-${SEASON}.json`), text);

  console.log(
    `[cfb:fetch-rankings] rankings-${SEASON}: ${response.data.length} published poll weeks` +
      (response.remainingCalls ? `; ${response.remainingCalls} calls remaining` : ""),
  );
}

main().catch((error) => {
  console.error(`[cfb:fetch-rankings] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
