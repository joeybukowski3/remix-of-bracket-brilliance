/** NBA event player props only. The pregame job must reserve before authorizing each call. */
import { z } from "zod";
import { MARKETS, PROVIDER_MARKET_KEYS, type Market } from "./contracts";
import type { PropsProvider, ProviderPropLine, PropsFetchResult } from "./pregameJob";
import type { ProviderUsageSnapshot } from "../../../api-quota/types";

const outcome = z.object({ name: z.string(), description: z.string().optional(), price: z.number(), point: z.number().optional() }).passthrough();
const market = z.object({ key: z.string(), last_update: z.string().optional(), outcomes: z.array(z.unknown()).default([]) }).passthrough();
const book = z.object({ key: z.string(), last_update: z.string().optional(), markets: z.array(z.unknown()).default([]) }).passthrough();
const event = z.object({ id: z.string(), sport_key: z.literal("basketball_nba"), commence_time: z.string(), home_team: z.string(), away_team: z.string(), bookmakers: z.array(z.unknown()).default([]) }).passthrough();

export interface ParsedNbaOdds {
  event: { id: string; commenceTimeUtc: string; homeTeam: string; awayTeam: string };
  lines: ProviderPropLine[];
  unmatched: string[];
}

const iso = (value: string | undefined): string | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const validPrice = (value: number): boolean => Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 100000;

/** Keep incomplete outcomes visible as diagnostics; never invent a missing side or merge different lines. */
export function parseTheOddsApiNbaEvent(payload: unknown, requested: readonly Market[], expectedEventId: string): ParsedNbaOdds {
  const parsed = event.safeParse(payload);
  if (!parsed.success || parsed.data.id !== expectedEventId || !iso(parsed.data.commence_time)) throw new Error("invalid NBA event odds response");
  const data = parsed.data;
  const lines: ProviderPropLine[] = [];
  const unmatched: string[] = [];
  for (const [bookIndex, rawBook] of data.bookmakers.entries()) {
    const bookResult = book.safeParse(rawBook);
    if (!bookResult.success) { unmatched.push(`bookmaker/${bookIndex}: malformed entry`); continue; }
    const bookmaker = bookResult.data;
    for (const requestedMarket of requested) {
      const key = PROVIDER_MARKET_KEYS[requestedMarket];
      const decodedMarkets = bookmaker.markets.map((rawMarket, index) => {
        const result = market.safeParse(rawMarket);
        if (!result.success) unmatched.push(`${bookmaker.key}/market/${index}: malformed entry`);
        return result.success ? result.data : null;
      }).filter((m): m is z.infer<typeof market> => m !== null);
      const matching = decodedMarkets.filter((m) => m.key === key);
      if (!matching.length) unmatched.push(`${bookmaker.key}/${key}: missing market`);
      for (const m of matching) {
        const groups = new Map<string, { player: string; point: number; over: { price: number; index: number }[]; under: { price: number; index: number }[] }>();
        m.outcomes.forEach((rawOutcome, index) => {
          const decoded = outcome.safeParse(rawOutcome);
          if (!decoded.success) { unmatched.push(`${bookmaker.key}/${key}/${index}: malformed outcome`); return; }
          const o = decoded.data;
          const player = o.description?.trim();
          if (!player || !Number.isFinite(o.point) || (o.point as number) < 0 || !validPrice(o.price) || (o.name !== "Over" && o.name !== "Under")) {
            unmatched.push(`${bookmaker.key}/${key}/${index}: malformed or unidentified outcome`);
            return;
          }
          const groupKey = `${player.toLowerCase()}|${o.point}`;
          const group = groups.get(groupKey) ?? { player, point: o.point as number, over: [], under: [] };
          group[o.name === "Over" ? "over" : "under"].push({ price: o.price, index });
          groups.set(groupKey, group);
        });
        for (const group of groups.values()) {
          if (group.over.length !== 1 || group.under.length !== 1) {
            unmatched.push(`${bookmaker.key}/${key}/${group.player}/${group.point}: missing or duplicate side`);
            continue;
          }
          const updated = iso(m.last_update ?? bookmaker.last_update);
          if ((m.last_update ?? bookmaker.last_update) && !updated) {
            unmatched.push(`${bookmaker.key}/${key}/${group.player}: invalid timestamp`);
            continue;
          }
          lines.push({ playerName: group.player, team: null, identityAmbiguous: true, market: requestedMarket, sportsbook: bookmaker.key, line: group.point, overPrice: group.over[0].price, underPrice: group.under[0].price, lastUpdateUtc: updated, rawProviderRef: { eventId: data.id, bookmakerKey: bookmaker.key, marketKey: key, overOutcomeIndex: group.over[0].index, underOutcomeIndex: group.under[0].index } });
        }
      }
    }
  }
  if (!data.bookmakers.length) unmatched.push("event: no sportsbooks");
  return { event: { id: data.id, commenceTimeUtc: iso(data.commence_time) as string, homeTeam: data.home_team, awayTeam: data.away_team }, lines, unmatched };
}

export interface NbaOddsAdapterOptions {
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface NbaHeaderEvidence { used: number | null; remaining: number | null; last: number | null; snapshots: ProviderUsageSnapshot[]; issue: string | null }

export function parseNbaUsageHeaders(headers: Pick<Headers, "get">, observedAt: string, maxExpectedCost: number): NbaHeaderEvidence {
  const read = (name: string): { value: number | null; invalid: boolean } => {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === "") return { value: null, invalid: false };
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? { value, invalid: false } : { value: null, invalid: true };
  };
  const used = read("x-requests-used");
  const remaining = read("x-requests-remaining");
  const last = read("x-requests-last");
  const issues: string[] = [];
  if (used.invalid || remaining.invalid || last.invalid) issues.push("invalid quota header");
  if (used.value === null || remaining.value === null || last.value === null) issues.push("incomplete quota headers");
  if (last.value !== null && last.value > maxExpectedCost) issues.push("last-request charge exceeds one-credit scope");
  if (used.value !== null && last.value !== null && last.value > used.value) issues.push("last-request charge exceeds used counter");
  const limit = used.value !== null && remaining.value !== null ? used.value + remaining.value : null;
  if (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0)) issues.push("invalid quota limit");
  const snapshots: ProviderUsageSnapshot[] = limit !== null && Number.isSafeInteger(limit) && limit > 0 ? [{ window: "month", observedAt, used: used.value, remaining: remaining.value, limit }] : [];
  return { used: used.value, remaining: remaining.value, last: last.value, snapshots, issue: issues.length ? `NBA_BREACH: ${issues.join("; ")}` : null };
}

export function createTheOddsApiNbaProvider(options: NbaOddsAdapterOptions): PropsProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  let authorization: string | null = null;
  const keyFor = (id: string, markets: readonly Market[]) => `${id}|${markets.join(",")}`;
  return {
    sourceId: "the-odds-api",
    authorizeRequest(request) {
      if (authorization !== null) throw new Error("NBA Odds API authorization already pending");
      authorization = keyFor(request.sourceEventId, request.markets);
    },
    async fetchEventProps(request): Promise<PropsFetchResult> {
      const requestKey = keyFor(request.sourceEventId, request.markets);
      if (authorization !== requestKey) return { status: "error", message: "NBA Odds API request lacks a matching quota reservation", creditsCharged: 0 };
      authorization = null; // consumed even when credentials or HTTP fail; no automatic retry
      if (!options.apiKey?.trim()) return { status: "error", message: "NBA Odds API credential unavailable", creditsCharged: 0 };
      if (!request.sourceEventId.trim() || request.markets.length === 0 || new Set(request.markets).size !== request.markets.length || request.markets.some((m) => !MARKETS.includes(m))) return { status: "error", message: "invalid NBA event request", creditsCharged: 0 };
      const url = new URL(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${encodeURIComponent(request.sourceEventId)}/odds/`);
      url.searchParams.set("apiKey", options.apiKey);
      url.searchParams.set("regions", "us");
      url.searchParams.set("markets", request.markets.map((m) => PROVIDER_MARKET_KEYS[m]).join(","));
      url.searchParams.set("oddsFormat", "american");
      let headers: NbaHeaderEvidence | null = null;
      try {
        const response = await fetchImpl(url.toString(), { method: "GET", signal: AbortSignal.timeout(15_000) });
        headers = parseNbaUsageHeaders(response.headers, now().toISOString(), request.markets.length);
        if (!response.ok) return { status: "error", message: `NBA Odds API HTTP ${response.status}`, failureKind: "http-error", creditsCharged: headers.last, usageSnapshots: headers.snapshots, usageIssue: headers.issue };
        const body: unknown = await response.json();
        const parsed = parseTheOddsApiNbaEvent(body, request.markets, request.sourceEventId);
        const zeroWithLines = headers.last === 0 && parsed.lines.length > 0;
        return { status: "ok", lines: parsed.lines, unmatched: parsed.unmatched, creditsCharged: headers.last, usageSnapshots: headers.snapshots, usageIssue: zeroWithLines ? "NBA_BREACH: zero-cost header with nonempty player props" : headers.issue, requestRef: `basketball_nba/events/${request.sourceEventId}/odds` };
      } catch {
        return { status: "error", message: "NBA Odds API request or response failed", failureKind: headers ? "provider-error" : "network-error", creditsCharged: headers?.last ?? null, usageSnapshots: headers?.snapshots ?? [], usageIssue: headers?.issue ?? null };
      }
    },
  };
}
