/** One read-only NBA event-list request. No odds endpoint is reachable here. */
import { z } from "zod";
import type { RequestGate } from "./budget";
import type { ProbeClaim } from "./probeClaim";
import { parseNbaUsageHeaders } from "./theOddsApiNba";

const discoveryEvent = z.object({ id: z.string().min(1), sport_key: z.literal("basketball_nba"), commence_time: z.string(), home_team: z.string(), away_team: z.string() }).passthrough();
/**
 * The provider's contract for the one route discovery calls, read from its v4 documentation on the review date. The quota policy
 * admits discovery past the ordinary cap only because of this record; the event-odds route is priced per market and region and
 * is not covered by it. The actual charge is still read from `x-requests-last` and anything above zero is settled as a breach.
 */
export const EVENTS_ENDPOINT_CONTRACT = Object.freeze({
  method: "GET",
  path: "/v4/sports/{sport}/events",
  quotaCost: 0,
  quote: "This endpoint does not count against the usage quota.",
  source: "https://the-odds-api.com/liveapi/guides/v4/",
  reviewedOn: "2026-10-28",
});

export type NbaDiscoveredEvent = { id: string; commenceTimeUtc: string; homeTeam: string; awayTeam: string };

export interface NbaEventsDiscoveryDeps {
  apiKey: string | undefined;
  approvalId: string;
  gate: RequestGate;
  claim: ProbeClaim;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export async function discoverNbaEventsOnce(deps: NbaEventsDiscoveryDeps): Promise<{ events: NbaDiscoveredEvent[]; quarantined: number; issue: string | null }> {
  if (!deps.apiKey?.trim()) throw new Error("NBA discovery credential unavailable");
  if (deps.gate.accountId !== "the-odds-api:unverified-pool" || !deps.gate.enforcesNbaAllowance) throw new Error("NBA discovery quota gate mismatch");
  if (!(await deps.claim.claim(deps.approvalId, "NBA events discovery one request", null))) throw new Error("NBA discovery approval already claimed");
  const reservation = await deps.gate.reserve(0, "/events");
  if (reservation.ok === false) throw new Error(`NBA discovery quota denied: ${reservation.code}`);
  const url = new URL(`https://api.the-odds-api.com${EVENTS_ENDPOINT_CONTRACT.path.replace("{sport}", "basketball_nba")}`);
  url.searchParams.set("apiKey", deps.apiKey);
  let cost: number | null = null;
  let issue: string | null = null;
  let snapshots: ReturnType<typeof parseNbaUsageHeaders>["snapshots"] = [];
  let outcome: "ok" | "http-error" | "provider-error" | "network-error" = "network-error";
  const events: NbaDiscoveredEvent[] = [];
  let quarantined = 0;
  try {
    const response = await (deps.fetchImpl ?? fetch)(url.toString(), { method: "GET", signal: AbortSignal.timeout(15_000) });
    const headers = parseNbaUsageHeaders(response.headers, (deps.now ?? (() => new Date()))().toISOString(), 0);
    cost = headers.last;
    issue = headers.issue;
    snapshots = headers.snapshots;
    if (!response.ok) outcome = "http-error";
    else {
      const body: unknown = await response.json();
      if (!Array.isArray(body)) outcome = "provider-error";
      else {
        outcome = "ok";
        for (const raw of body) {
          const parsed = discoveryEvent.safeParse(raw);
          const time = parsed.success ? Date.parse(parsed.data.commence_time) : NaN;
          if (!parsed.success || !Number.isFinite(time)) { quarantined += 1; continue; }
          events.push({ id: parsed.data.id, commenceTimeUtc: new Date(time).toISOString(), homeTeam: parsed.data.home_team, awayTeam: parsed.data.away_team });
        }
      }
    }
  } catch { outcome = "network-error"; }
  await reservation.settle(cost, outcome, issue, snapshots);
  if (outcome !== "ok") throw new Error("NBA event discovery failed; approval remains consumed");
  return { events, quarantined, issue };
}
