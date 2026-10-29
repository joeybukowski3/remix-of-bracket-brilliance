// Owner-only access for the hosted NBA props board.
// Server-only: this file is imported by api/nba/props-board.ts and never by browser code.
//
// One owner, one passphrase. The passphrase is stored only as an scrypt hash in NBA_PRIVATE_PASSWORD_HASH; a login that
// verifies it receives an HMAC-signed, HttpOnly, host-only cookie. Missing or malformed configuration disables access
// entirely (fail closed) instead of falling back to any default.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "__Host-jkb-nba";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const MIN_PASSPHRASE_LENGTH = 16;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_COST = 16384;
const HASH_PREFIX = "scrypt$";

export interface PrivateAccessConfig {
  passwordHash: string;
  sessionSecret: string;
}

/** Null when anything is missing or too weak: the endpoint then answers 503 to everyone. */
export function readAccessConfig(env: Readonly<Record<string, string | undefined>>): PrivateAccessConfig | null {
  const passwordHash = env.NBA_PRIVATE_PASSWORD_HASH?.trim() ?? "";
  const sessionSecret = env.NBA_PRIVATE_SESSION_SECRET ?? "";
  if (sessionSecret.length < MIN_SECRET_LENGTH) return null;
  const parts = passwordHash.split("$");
  if (parts.length !== 3 || `${parts[0]}$` !== HASH_PREFIX || !parts[1] || !parts[2]) return null;
  return { passwordHash, sessionSecret };
}

const deriveKey = (passphrase: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(passphrase.normalize("NFKC"), salt, SCRYPT_KEY_BYTES, { N: SCRYPT_COST }, (error, key) => (error ? reject(error) : resolve(key))));

export async function hashPassphrase(passphrase: string, salt: Buffer = randomBytes(16)): Promise<string> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  const key = await deriveKey(passphrase, salt);
  return `${HASH_PREFIX}${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassphrase(candidate: string, storedHash: string): Promise<boolean> {
  const [, saltText, keyText] = storedHash.split("$");
  if (!saltText || !keyText || candidate.length === 0 || candidate.length > 1024) return false;
  const expected = Buffer.from(keyText, "base64url");
  if (expected.length !== SCRYPT_KEY_BYTES) return false;
  const actual = await deriveKey(candidate, Buffer.from(saltText, "base64url"));
  return timingSafeEqual(actual, expected);
}

const sign = (payload: string, secret: string): string => createHmac("sha256", secret).update(payload).digest("base64url");

export function issueSessionToken(secret: string, nowMs: number, ttlSeconds: number = SESSION_TTL_SECONDS): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, exp: Math.floor(nowMs / 1000) + ttlSeconds })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string, secret: string, nowMs: number): boolean {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return false;
    const { v, exp } = parsed as { v?: unknown; exp?: unknown };
    return v === 1 && typeof exp === "number" && Number.isFinite(exp) && exp * 1000 > nowMs;
  } catch {
    return false;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, ttlSeconds: number = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${ttlSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function hasValidSession(request: Request, config: PrivateAccessConfig, nowMs: number): boolean {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  return token !== null && verifySessionToken(token, config.sessionSecret, nowMs);
}

/** Same-origin check for the state-changing methods; a request that proves neither Origin nor Sec-Fetch-Site is refused. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export interface FailureLimiter {
  isBlocked(key: string, nowMs: number): boolean;
  recordFailure(key: string, nowMs: number): void;
  reset(key: string): void;
}

/**
 * Best-effort limiter for failed logins, in memory per function instance (serverless instances do not share it). The
 * scrypt cost and a long passphrase are the real defense; add a Vercel Firewall rate-limit rule on /api/nba/props-board.
 */
export function createFailureLimiter(maxFailures = 5, windowMs = 15 * 60 * 1000): FailureLimiter {
  const failures = new Map<string, number[]>();
  const recent = (key: string, nowMs: number): number[] => (failures.get(key) ?? []).filter((at) => nowMs - at < windowMs);
  return {
    isBlocked: (key, nowMs) => recent(key, nowMs).length >= maxFailures,
    recordFailure: (key, nowMs) => {
      failures.set(key, [...recent(key, nowMs), nowMs]);
      if (failures.size > 1000) failures.delete(failures.keys().next().value as string);
    },
    reset: (key) => void failures.delete(key),
  };
}
