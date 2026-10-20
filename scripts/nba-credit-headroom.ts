/**
 * Read-only: how many free Odds API credits could NBA add, from what the repository already records.
 *
 * Reads the history of data/market/betting-lines/quota-state.json through local `git log` / `git show`.
 * It makes no network request, reads no secret and writes nothing.
 *
 *   npm run nba:credit-headroom
 *   npm run nba:credit-headroom -- --since 2026-10-01
 *   npm run nba:credit-headroom -- --ref origin/main      (the latest committed counter, after a `git fetch`)
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { AVERAGE_GAMES_PER_NIGHT, coverage, freeHeadroom, GAME_NIGHTS_PER_MONTH, hybridPlan, PEER_COMPONENTS, scenarioPeerMonthly, SEASON_SCENARIOS, summarizeBurn, type QuotaObservation } from "../src/lib/nba/props/pipeline/zeroCostBudget";

const STATE_FILE = "data/market/betting-lines/quota-state.json";
const PLAN_LIMIT = 500;
const NFL_GUARD_FLOOR = 50;
const ROOT = resolve(import.meta.dirname, "..");

const git = (...args: string[]): string => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

function readSeries(ref: string, since: string | null): QuotaObservation[] {
  const shas = git("log", ref, "--format=%H", ...(since ? [`--since=${since}`] : []), "--", STATE_FILE).split("\n").filter(Boolean);
  const series: QuotaObservation[] = [];
  for (const sha of shas) {
    try {
      const state = JSON.parse(git("show", `${sha}:${STATE_FILE}`)) as { updatedAt?: string; used?: number | null };
      if (typeof state.updatedAt === "string" && typeof state.used === "number") series.push({ at: state.updatedAt, used: state.used });
    } catch {
      // A commit that does not contain a readable state file is skipped, not guessed at.
    }
  }
  return series.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function main(): void {
  const args = process.argv.slice(2);
  const since = args.includes("--since") ? args[args.indexOf("--since") + 1] ?? null : null;
  const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] ?? "HEAD" : "HEAD";
  const series = readSeries(ref, since);
  const latest = series.at(-1);
  // The current cycle is everything after the last counter reset.
  let start = 0;
  for (let i = 1; i < series.length; i += 1) if (series[i].used < series[i - 1].used) start = i;
  const burn = summarizeBurn(series.slice(start));

  console.log(`Observations: ${series.length} (${series[0]?.at ?? "none"} to ${latest?.at ?? "none"}); current cycle from ${series[start]?.at ?? "none"}`);
  if (burn.meanPerDay === null || burn.projectedMonthly === null) {
    console.log("Not enough readings in the current cycle to estimate a rate.");
    return;
  }
  console.log(`Measured shared-pool burn: ${burn.meanPerDay.toFixed(1)} credits/day (peak interval ${burn.peakPerDay?.toFixed(1)}), ~${Math.round(burn.projectedMonthly)}/month; counter now ${latest?.used}/${PLAN_LIMIT}`);
  console.log(`Headroom now: ${freeHeadroom({ planLimit: PLAN_LIMIT, guardFloor: NFL_GUARD_FLOOR, peerMonthly: burn.projectedMonthly })} credits/month above the NFL guard floor of ${NFL_GUARD_FLOOR}\n`);

  console.log("Components of the measured burn (credits/day, Oct 1-13 Actions logs reconciled to the provider counter):");
  for (const c of PEER_COMPONENTS) console.log(`  ${c.id.padEnd(24)} ${c.perDay.toFixed(2).padStart(5)}  ${c.basis}`);
  console.log("\nScenario                                                    peers/mo  free/mo  all-PTS share  3-mkt g/night  hybrid 1 top  hybrid 2 top");
  for (const scenario of SEASON_SCENARIOS) {
    const peers = scenarioPeerMonthly(scenario);
    const free = freeHeadroom({ planLimit: PLAN_LIMIT, guardFloor: NFL_GUARD_FLOOR, peerMonthly: peers });
    const games = Math.round(AVERAGE_GAMES_PER_NIGHT * GAME_NIGHTS_PER_MONTH);
    const allPoints = coverage({ monthlyCredits: free, marketsPerGame: 1 });
    const three = coverage({ monthlyCredits: free, marketsPerGame: 3 });
    const one = hybridPlan({ monthlyCredits: free, gamesPerMonth: games, topGamesPerNight: 1 });
    const two = hybridPlan({ monthlyCredits: free, gamesPerMonth: games, topGamesPerNight: 2 });
    const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
    console.log(`${scenario.label.padEnd(62)} ${String(Math.round(peers)).padStart(7)}  ${String(free).padStart(7)}  ${pct(allPoints.shareOfAverageSlate).padStart(13)}  ${three.gamesPerNight.toFixed(1).padStart(13)}  ${pct(one.share).padStart(12)}  ${pct(two.share).padStart(12)}`);
  }
  console.log("\nEstimates only. Re-run after the MLB/NCAAB pause has been live for two weeks.");
}

main();
