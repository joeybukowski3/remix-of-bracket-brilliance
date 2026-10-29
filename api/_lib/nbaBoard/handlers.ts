// Request handling for GET /api/nba/props-board, with every dependency injected so tests need no network or clock.
//
// Public and unauthenticated by design: it serves the one stored snapshot, already projected to the tier the license records
// allow (hosted/redact.ts), and projects it again on every read. It never calls a sportsbook or stats provider, so page views
// cannot spend provider quota; the only upstream read is the snapshot row, cached here briefly and at the CDN.
// Every failure answers with a short fixed body: no credential, stack or stored data ever appears in a response.
import { PUBLIC_TEXT, serveableEnvelope, type HostedSnapshotEnvelope } from "../../../src/lib/nba/props/hosted/redact.js";
import type { SnapshotStore } from "./snapshotStore";

/** How long one function instance reuses its read of the snapshot row. */
export const SNAPSHOT_MEMORY_TTL_MS = 30_000;

/**
 * Browsers revalidate after a minute; the CDN serves a snapshot for five minutes and may serve a stale one for ten more while
 * it refreshes. Updates are manual, so a new snapshot is visible within about five minutes of publishing.
 */
export const PUBLIC_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
/** Errors and empty states must not stick in a cache. */
const NO_CACHE = "no-store, max-age=0";

export interface HandlerDeps {
  store: () => SnapshotStore;
  now: () => number;
  /** Reports a server-side failure without request data. */
  logError: (message: string) => void;
}

const baseHeaders = (cacheControl: string): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });

const reply = (status: number, body: unknown, cacheControl: string = NO_CACHE): Response => new Response(JSON.stringify(body), { status, headers: baseHeaders(cacheControl) });

export function createHandlers(deps: HandlerDeps) {
  let memo: { at: number; stored: unknown } | null = null;

  async function readStored(): Promise<unknown> {
    const nowMs = deps.now();
    if (memo && nowMs - memo.at < SNAPSHOT_MEMORY_TTL_MS) return memo.stored;
    const stored = await deps.store().read();
    memo = { at: nowMs, stored };
    return stored;
  }

  return {
    GET: async (): Promise<Response> => {
      let stored: unknown;
      try {
        stored = await readStored();
      } catch {
        deps.logError("nba-board: snapshot store read failed");
        return reply(502, { error: "store-error" });
      }
      if (stored === null) return reply(404, { error: "no-snapshot" });
      const served = serveableEnvelope(stored);
      if (!served.ok) {
        deps.logError("nba-board: stored snapshot failed validation");
        return reply(502, { error: "store-error" });
      }
      const envelope: HostedSnapshotEnvelope = served.envelope;
      const text = PUBLIC_TEXT[envelope.tier];
      return reply(200, { tier: envelope.tier, publishedAtUtc: envelope.publishedAtUtc, attribution: text.attribution, notice: text.notice, board: envelope.board }, PUBLIC_CACHE_CONTROL);
    },
  };
}
