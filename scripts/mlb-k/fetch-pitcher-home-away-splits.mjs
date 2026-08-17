/**
 * Real pitcher home/away K/outs/starts splits via the MLB Stats API
 * statSplits endpoint (sitCodes=h,a). This is new pipeline coverage --
 * no existing script in this repo fetches pitcher home/away splits.
 */
import { fetchJsonWithRetry, toFiniteNumber } from "./fetch-workload-data.mjs";

export const HOME_AWAY_FETCH_VERSION = "mlb-k-home-away-fetch-v1";
const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";

function normalizeSplit(split) {
  const stat = split?.stat ?? {};
  return {
    strikeouts: toFiniteNumber(stat.strikeOuts ?? stat.strikeouts),
    outs: toFiniteNumber(stat.outsPitched ?? stat.outs),
    starts: toFiniteNumber(stat.gamesStarted),
  };
}

/**
 * @returns {{ ok: boolean, home: {strikeouts:number|null,outs:number|null,starts:number|null}|null, away: (same)|null, error: string|null }}
 */
export async function fetchPitcherHomeAwaySplits(pitcherId, season, options = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = 15_000, maxAttempts = 3 } = options;
  const url = `${MLB_STATS_API}/people/${pitcherId}/stats?stats=statSplits&sitCodes=h,a&group=pitching&season=${season}`;
  const response = await fetchJsonWithRetry(url, { fetchImpl, timeoutMs, maxAttempts });
  if (!response.ok) return { ok: false, home: null, away: null, error: response.error };

  const splits = response.json?.stats?.flatMap((block) => block?.splits ?? []) ?? [];
  const homeSplit = splits.find((split) => split?.split?.code === "h");
  const awaySplit = splits.find((split) => split?.split?.code === "a");
  if (!homeSplit && !awaySplit) return { ok: false, home: null, away: null, error: "No home/away splits returned" };

  return {
    ok: true,
    home: homeSplit ? normalizeSplit(homeSplit) : null,
    away: awaySplit ? normalizeSplit(awaySplit) : null,
    error: null,
  };
}

export default fetchPitcherHomeAwaySplits;
