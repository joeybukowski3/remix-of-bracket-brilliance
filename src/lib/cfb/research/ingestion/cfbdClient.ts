import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CFBD_BASE_URL = "https://api.collegefootballdata.com";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

export type CfbdResearchRequest = {
  name: string;
  path: string;
  query: Record<string, string | number>;
};

export type CfbdResearchResponse<T> = {
  data: T;
  url: string;
  remainingCalls: string | null;
  attempts: number;
};

function redactQuery(query: CfbdResearchRequest["query"]): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [
      key,
      /api[-_]?key|authorization|token|secret/i.test(key) ? "[REDACTED]" : value,
    ]),
  );
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function writeAtomic(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, value, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a single CFBD array endpoint with deterministic retry: up to
 * MAX_ATTEMPTS total tries, exponential backoff, only for 429/5xx. 4xx
 * (including 401/403 auth failures) fail immediately and loudly — the
 * caller must not silently continue past an authentication failure.
 * The API key is never logged, written to disk, or included in thrown
 * error messages.
 */
export async function fetchCfbdResearchJson<T>(
  request: CfbdResearchRequest,
  apiKey: string,
): Promise<CfbdResearchResponse<T>> {
  const url = new URL(request.path, CFBD_BASE_URL);
  for (const [key, value] of Object.entries(request.query)) {
    url.searchParams.set(key, String(value));
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "JoeKnowsBall-CFB-research-pipeline/0.1 (+https://www.joeknowsball.com)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `${request.name}: CFBD authentication failed (HTTP ${response.status}) at ${request.path}; ` +
            `query=${JSON.stringify(redactQuery(request.query))}. Check CFBD_API_KEY.`,
        );
      }

      if (!response.ok) {
        const body = (await response.text()).trim() || "[empty response body]";
        const message =
          `${request.name}: CFBD ${request.path} HTTP ${response.status} ${response.statusText}; ` +
          `query=${JSON.stringify(redactQuery(request.query))}; response=${body}`;
        if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
          lastError = new Error(message);
          await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(message);
      }

      const data = (await response.json()) as T;
      if (!Array.isArray(data)) {
        throw new Error(`${request.name}: expected a JSON array from ${request.path}`);
      }
      return {
        data,
        url: url.toString(),
        remainingCalls: response.headers.get("x-calllimit-remaining"),
        attempts: attempt,
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && /authentication failed/.test(error.message)) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= MAX_ATTEMPTS) break;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastError ?? new Error(`${request.name}: request failed with no captured error`);
}
