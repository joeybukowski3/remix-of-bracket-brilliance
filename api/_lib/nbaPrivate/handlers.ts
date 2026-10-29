// Request handling for /api/nba/props-board, with every dependency injected so tests need no network, clock or secrets.
// Every failure answers with a short fixed body: no password, hash, secret, stack or stored data ever appears in a response.
import { serveableEnvelope } from "../../../src/lib/nba/props/hosted/redact.js";
import {
  clearedSessionCookie,
  createFailureLimiter,
  hasValidSession,
  isSameOriginRequest,
  issueSessionToken,
  readAccessConfig,
  sessionCookie,
  verifyPassphrase,
  type FailureLimiter,
  type PrivateAccessConfig,
} from "./session";
import type { SnapshotStore } from "./snapshotStore";

const MAX_LOGIN_BODY_BYTES = 2048;

export interface HandlerDeps {
  env: Readonly<Record<string, string | undefined>>;
  store: () => SnapshotStore;
  now: () => number;
  limiter: FailureLimiter;
  /** Reports a server-side failure without request data; defaults to stderr. */
  logError: (message: string) => void;
}

/** Headers on every response, including errors: never cacheable by a browser, CDN or proxy, and never indexed. */
const baseHeaders = (): Headers =>
  new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Cookie, Origin",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });

function reply(status: number, body: unknown, extra?: Record<string, string>): Response {
  const headers = baseHeaders();
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value);
  return new Response(JSON.stringify(body), { status, headers });
}

const clientKey = (request: Request): string => request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

async function readPassphrase(request: Request): Promise<string | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_LOGIN_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_LOGIN_BODY_BYTES) return null;
    const parsed: unknown = JSON.parse(text);
    const value = typeof parsed === "object" && parsed !== null ? (parsed as { passphrase?: unknown }).passphrase : undefined;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export function createHandlers(deps: HandlerDeps) {
  const unavailable = () => reply(503, { error: "unavailable" });
  const withConfig = (run: (config: PrivateAccessConfig) => Promise<Response>): Promise<Response> => {
    const config = readAccessConfig(deps.env);
    return config ? run(config) : Promise.resolve(unavailable());
  };

  return {
    GET: (request: Request) =>
      withConfig(async (config) => {
        if (!hasValidSession(request, config, deps.now())) return reply(401, { error: "unauthorized" });
        let stored: unknown;
        try {
          stored = await deps.store().read();
        } catch {
          deps.logError("nba-private: snapshot store read failed");
          return reply(502, { error: "store-error" });
        }
        if (stored === null) return reply(404, { error: "no-snapshot" });
        const served = serveableEnvelope(stored);
        if (!served.ok) {
          deps.logError("nba-private: stored snapshot failed validation");
          return reply(502, { error: "store-error" });
        }
        return reply(200, { tier: served.envelope.tier, publishedAtUtc: served.envelope.publishedAtUtc, board: served.envelope.board });
      }),

    POST: (request: Request) =>
      withConfig(async (config) => {
        if (!isSameOriginRequest(request)) return reply(403, { error: "forbidden" });
        const key = clientKey(request);
        if (deps.limiter.isBlocked(key, deps.now())) return reply(429, { error: "too-many-attempts" }, { "Retry-After": "900" });
        const passphrase = await readPassphrase(request);
        if (passphrase === null) return reply(400, { error: "bad-request" });
        if (!(await verifyPassphrase(passphrase, config.passwordHash))) {
          deps.limiter.recordFailure(key, deps.now());
          return reply(401, { error: "unauthorized" });
        }
        deps.limiter.reset(key);
        return reply(200, { ok: true }, { "Set-Cookie": sessionCookie(issueSessionToken(config.sessionSecret, deps.now())) });
      }),

    DELETE: (request: Request) => {
      if (!isSameOriginRequest(request)) return Promise.resolve(reply(403, { error: "forbidden" }));
      return Promise.resolve(reply(200, { ok: true }, { "Set-Cookie": clearedSessionCookie() }));
    },
  };
}

export const defaultLimiter = createFailureLimiter();
