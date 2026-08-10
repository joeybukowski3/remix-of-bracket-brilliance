import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CFBD_BASE_URL = "https://api.collegefootballdata.com";
const REQUEST_TIMEOUT_MS = 60_000;

export type CfbdRequest = {
  name: string;
  path: string;
  query: Record<string, string | number>;
  optional?: boolean;
};

function safeQuery(query: CfbdRequest["query"]): Record<string, string | number> {
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

export async function fetchCfbdJson<T>(
  request: CfbdRequest,
  apiKey: string,
): Promise<{ data: T; url: string; remainingCalls: string | null }> {
  const url = new URL(request.path, CFBD_BASE_URL);
  for (const [key, value] of Object.entries(request.query)) {
    url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "JoeKnowsBall-CFB-data-pipeline/0.1 (+https://www.joeknowsball.com)",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const responseBody = (await response.text()).trim() || "[empty response body]";
    throw new Error(
      `${request.name}: CFBD ${request.path} HTTP ${response.status} ${response.statusText}; ` +
        `query=${JSON.stringify(safeQuery(request.query))}; response=${responseBody}`,
    );
  }
  const data = (await response.json()) as T;
  if (!Array.isArray(data)) throw new Error(`${request.name}: expected a JSON array`);
  return {
    data,
    url: url.toString(),
    remainingCalls: response.headers.get("x-calllimit-remaining"),
  };
}
