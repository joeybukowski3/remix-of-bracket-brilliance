import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findLeakedSecretNames, NON_SECRET_API_ENV_KEYS, SERVER_ONLY_ENV_KEYS } from "./prerender-secrets";

const ROOT = resolve(__dirname, "..", "..");

function filesUnder(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

const namesIn = (files: string[], pattern: RegExp) =>
  new Set(files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(pattern)].map((match) => match[1])));

describe("findLeakedSecretNames", () => {
  const SECRET = "sk_test_0123456789abcdef";

  it("reports the variable name, never the value, when a server-only value appears in HTML", () => {
    const leaked = findLeakedSecretNames(`<p>${SECRET}</p>`, { ODDS_API_KEY: SECRET });
    expect(leaked).toEqual(["ODDS_API_KEY"]);
    expect(leaked.join()).not.toContain(SECRET);
  });

  it("passes clean HTML and ignores unset or very short values", () => {
    expect(findLeakedSecretNames("<p>clean</p>", { ODDS_API_KEY: SECRET })).toEqual([]);
    expect(findLeakedSecretNames("<p>1</p>", { CRON_SECRET: "1" })).toEqual([]);
    expect(findLeakedSecretNames("<p>x</p>", {})).toEqual([]);
  });

  it("does not treat a value that is also a public VITE_* value as leaked", () => {
    const url = "https://project.supabase.co";
    expect(findLeakedSecretNames(`<a href="${url}">`, { SUPABASE_URL: url, VITE_SUPABASE_URL: url })).toEqual([]);
  });
});

describe("server-only key list stays in sync", () => {
  it("classifies every process.env name used by api/ handlers", () => {
    const used = namesIn(filesUnder(resolve(ROOT, "api"), /\.(ts|js|mjs)$/), /process\.env\.([A-Z0-9_]+)/g);
    const classified = new Set<string>([...SERVER_ONLY_ENV_KEYS, ...NON_SECRET_API_ENV_KEYS]);
    expect([...used].filter((name) => !classified.has(name))).toEqual([]);
  });

  it("covers every secret the GitHub workflows expose (they also run npm run build)", () => {
    const secrets = namesIn(filesUnder(resolve(ROOT, ".github", "workflows"), /\.ya?ml$/), /secrets\.([A-Z0-9_]+)/g);
    const covered = new Set<string>(SERVER_ONLY_ENV_KEYS);
    expect([...secrets].filter((name) => !covered.has(name))).toEqual([]);
  });
});
