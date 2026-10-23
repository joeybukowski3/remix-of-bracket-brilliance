/**
 * Read-only, capped discovery probe of the public Wikidata Query Service for NBA player
 * ids and basketball positions (P3685/P3647/P2685 and P413).
 *
 * Network: query.wikidata.org only. No paid API, no The Odds API, no credential. At most
 * 8 serial requests, spaced, no retry (see src/lib/nba/props/v1/wikidata/wikidataProbe.ts). It refuses to start
 * within 10 minutes of the previous run (any --out-dir), and after an aborted run until the Retry-After (or a 5-minute
 * default) has passed; both are tracked in data/nba/wikidata-positions/.probe-state.json.
 * Nothing is committed, scheduled, or published; output goes under data/nba/ (gitignored)
 * unless --out-dir names the fixtures directory.
 *
 *   npx tsx scripts/nba-wikidata-position-probe.ts
 *   npx tsx scripts/nba-wikidata-position-probe.ts --items=Q25369,Q36159 --out-dir=src/lib/nba/props/v1/wikidata/__fixtures__/recorded --save-raw
 *   --contact="<url or email>"   replaces the repository URL in the User-Agent contact field; it is written into
 *                                snapshot.json, so do not use an email with --out-dir pointing at tracked files
 */
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { resolveInside, writeFileGuarded } from "../src/lib/nba/props/v1/wikidata/pathGuard";
import { DEFAULT_USER_AGENT, rerunWaitMs, runProbe, type ProbeState } from "../src/lib/nba/props/v1/wikidata/wikidataProbe";
import { buildQueries, PROBE_LIMITS, WIKIDATA_SPARQL_ENDPOINT } from "../src/lib/nba/props/v1/wikidata/wikidataQueries";
import { buildSnapshot } from "../src/lib/nba/props/v1/wikidata/wikidataSnapshot";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_OUT_DIR = "data/nba/wikidata-positions";
const FIXTURE_DIR = "src/lib/nba/props/v1/wikidata/__fixtures__";
const ALLOWED = ["data/nba", FIXTURE_DIR];

const flag = (name: string): string | null => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** One state file for every output directory: the spacing between runs and the abort cool-down cannot be dodged by --out-dir. */
const STATE_FILE = `${DEFAULT_OUT_DIR}/.probe-state.json`;

function readState(): ProbeState | null {
  const file = resolveInside(ROOT, STATE_FILE, ALLOWED);
  if (!existsSync(file)) return null;
  try {
    const state = JSON.parse(readFileSync(file, "utf8")) as ProbeState;
    return typeof state.lastStartedAtUtc === "string" ? state : { lastStartedAtUtc: "unreadable", aborted: null };
  } catch {
    return { lastStartedAtUtc: "unreadable", aborted: null };
  }
}

/** Refuses to start within MIN_RERUN_INTERVAL_MS of the previous run, or while an abort's cool-down has not passed. */
function assertMayStart(): void {
  const state = readState();
  const remaining = state ? rerunWaitMs(state, Date.now()) : 0;
  if (remaining > 0) throw new Error(`the previous probe run started at ${state?.lastStartedAtUtc}${state?.aborted ? ` and was aborted at ${state.aborted.abortedAtUtc}` : ""}; wait ${Math.ceil(remaining / 1000)} s more (or delete ${STATE_FILE} if you are sure)`);
}

const saveState = (state: ProbeState): void => {
  writeFileGuarded(ROOT, STATE_FILE, ALLOWED, json(state));
};

async function main(): Promise<void> {
  const outDir = resolveInside(ROOT, flag("out-dir") ?? DEFAULT_OUT_DIR, ALLOWED);
  assertMayStart();
  const items = flag("items")?.split(",").map((q) => q.trim()).filter(Boolean) ?? null;
  const contact = flag("contact");
  const userAgent = contact ? DEFAULT_USER_AGENT.replace("https://github.com/joeybukowski3/remix-of-bracket-brilliance", contact) : DEFAULT_USER_AGENT;
  const queries = buildQueries(items);
  console.log(`Plan: ${queries.length} serial requests (cap ${PROBE_LIMITS.maxRequests}), >= ${PROBE_LIMITS.minIntervalMs} ms apart (and at least as long as the previous request took), ${items ? `restricted to ${items.length} items` : "full NBA-id population"}`);

  const startedAtUtc = new Date().toISOString();
  saveState({ lastStartedAtUtc: startedAtUtc, aborted: null });
  const result = await runProbe(queries, { fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, userAgent });
  for (const r of result.requests) console.log(`  ${r.queryId.padEnd(20)} HTTP ${r.status}  rows ${String(r.rows).padStart(6)}  ${r.elapsedMs} ms`);

  const write = (name: string, content: string) => writeFileGuarded(ROOT, rel(resolve(outDir, name)), ALLOWED, content);
  if (result.outcome === "aborted") {
    const abortedAtUtc = new Date().toISOString();
    saveState({ lastStartedAtUtc: startedAtUtc, aborted: { abortedAtUtc, retryAfterSeconds: result.retryAfterSeconds } });
    write("probe-aborted.json", json({ abortReason: result.abortReason, abortedAtUtc, retryAfterSeconds: result.retryAfterSeconds, requests: result.requests }));
    const rateLimited = result.requests.some((r) => r.status === 429 || r.status === 503);
    console.error(`ABORTED: ${result.abortReason}. No snapshot written.${rateLimited ? " Do not re-run before the Retry-After period has passed." : " Fix the cause before re-running."}`);
    process.exitCode = 2;
    return;
  }
  const snapshot = buildSnapshot({ raw: result.raw, retrievedAtUtc: new Date().toISOString(), userAgent, endpoint: WIKIDATA_SPARQL_ENDPOINT, requests: result.requests, restrictedToItems: items });
  const snapshotPath = write("snapshot.json", json(snapshot));
  if (process.argv.includes("--save-raw")) for (const [id, body] of Object.entries(result.raw)) write(`raw/${id}.json`, json(body));
  console.log(`Snapshot: ${snapshot.players.length} items -> ${rel(snapshotPath)}`);
  if (snapshot.provenance.vocabularyIssues.length > 0) console.warn(`Vocabulary drift:\n  ${snapshot.provenance.vocabularyIssues.join("\n  ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
