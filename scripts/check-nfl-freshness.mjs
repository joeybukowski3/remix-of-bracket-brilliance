/**
 * NFL data-freshness check (CLI). Gathers inputs, runs the pure checks in
 * lib/nfl-freshness.mjs, prints a diagnostic report, and exits non-zero when
 * data is stale, so a stale site can never look "green".
 *
 * Free sources only: the committed repo files, nflverse games.csv (public),
 * the public production site, and the GitHub Actions run history for this repo.
 * No paid provider is ever called.
 *
 *   node scripts/check-nfl-freshness.mjs                       # local files only
 *   node scripts/check-nfl-freshness.mjs --upstream            # + nflverse parity
 *   node scripts/check-nfl-freshness.mjs --upstream --github --production=https://www.joeknowsball.com
 *   node scripts/check-nfl-freshness.mjs --checks=core --upstream --fail-on=stale_artifact,inconsistent_data
 *
 * Options
 *   --season=2026            --now=<ISO>               deterministic clock (tests/backfill)
 *   --upstream               fetch nflverse games.csv   --upstream-file=<csv>  offline fixture
 *   --github                 workflow health via API (GITHUB_TOKEN/GH_TOKEN; repo from GITHUB_REPOSITORY)
 *   --production=<origin>    compare served artifacts with the repo
 *   --checks=core|all        core = schedule/results/upstream/week only (pre-commit gate)
 *   --fail-on=<categories>   only these categories turn the exit code non-zero (default: all)
 *   --strict                 exit 2 when the verdict is "unknown" (a check could not run)
 *   --json=<path>            write the full machine-readable report
 *   --summary=<path>         write markdown (defaults to $GITHUB_STEP_SUMMARY when set)
 *   --root=<dir>             repo root override (tests)
 *
 * Exit codes: 0 ok/degraded, 1 failing checks, 2 unknown (only with --strict).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkArtifacts,
  checkCurrentWeek,
  checkFileSizes,
  checkOpponents,
  checkProduction,
  checkScheduleConsistency,
  checkUpstreamParity,
  checkWeekCoverage,
  checkWorkflowHealth,
  summarizeFindings,
} from "./lib/nfl-freshness.mjs";
import { CRITICAL_WORKFLOWS, PRODUCTION_ARTIFACT_IDS, artifactRegistry } from "./lib/nfl-freshness-registry.mjs";
import { NFL_GAMES_SOURCE_URL, buildNflverseTeamMap, parseCsv, transformSeasonRows } from "./lib/nfl-schedules-results-core.mjs";

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPO = "joeybukowski3/remix-of-bracket-brilliance";
const FETCH_TIMEOUT_MS = 30_000;

function parseArgs(argv) {
  const args = { season: 2026, now: new Date(), upstream: false, upstreamFile: null, github: false, production: null, checks: "all", failOn: null, strict: false, json: null, summary: null, root: SELF_ROOT };
  for (const raw of argv) {
    const [key, ...rest] = raw.split("=");
    const value = rest.join("=");
    if (key === "--season") args.season = Number(value);
    else if (key === "--now") args.now = new Date(value);
    else if (key === "--upstream") args.upstream = true;
    else if (key === "--upstream-file") { args.upstream = true; args.upstreamFile = resolve(value); }
    else if (key === "--github") args.github = true;
    else if (key === "--production") args.production = value.replace(/\/$/, "");
    else if (key === "--checks") args.checks = value;
    else if (key === "--fail-on") args.failOn = new Set(value.split(",").filter(Boolean));
    else if (key === "--strict") args.strict = true;
    else if (key === "--json") args.json = resolve(value);
    else if (key === "--summary") args.summary = resolve(value);
    else if (key === "--root") args.root = resolve(value);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season)) throw new Error("--season must be an integer");
  if (Number.isNaN(args.now.getTime())) throw new Error("--now must be an ISO timestamp");
  if (!["core", "all"].includes(args.checks)) throw new Error("--checks must be core or all");
  return args;
}

const readJson = (root, path) => {
  const full = join(root, path);
  return existsSync(full) ? JSON.parse(readFileSync(full, "utf8")) : null;
};

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function loadUpstream(args, teamsJson, log) {
  if (!args.upstream) return { upstream: null, checkedAt: null };
  try {
    const csv = args.upstreamFile ? readFileSync(args.upstreamFile, "utf8") : await fetchText(NFL_GAMES_SOURCE_URL);
    const rows = parseCsv(csv).filter((row) => Number(row.season) === args.season);
    if (rows.length === 0) throw new Error(`upstream has no rows for season ${args.season}`);
    const { games, results } = transformSeasonRows(rows, args.season, buildNflverseTeamMap(teamsJson));
    return { upstream: { games, results }, checkedAt: new Date().toISOString() };
  } catch (error) {
    log(`upstream fetch failed: ${error.message}`);
    return { upstream: null, checkedAt: null };
  }
}

async function loadWorkflowRuns(args, log) {
  if (!args.github) return null;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    log("--github requested but no GITHUB_TOKEN/GH_TOKEN available");
    return null;
  }
  const repo = process.env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "nfl-freshness-check" };
  const runs = {};
  try {
    for (const workflow of CRITICAL_WORKFLOWS) {
      const body = await fetchText(`https://api.github.com/repos/${repo}/actions/workflows/${workflow.name}/runs?per_page=12&status=completed`, headers);
      runs[workflow.name] = (JSON.parse(body).workflow_runs ?? []).map((r) => ({ conclusion: r.conclusion, created_at: r.created_at, event: r.event }));
    }
    return runs;
  } catch (error) {
    log(`workflow run history failed: ${error.message}`);
    return null;
  }
}

async function loadProduction(args, registry, log) {
  if (!args.production) return null;
  const production = {};
  let reachable = false;
  for (const id of PRODUCTION_ARTIFACT_IDS) {
    const entry = registry.find((e) => e.id === id);
    if (!entry?.path) continue;
    try {
      production[id] = JSON.parse(await fetchText(`${args.production}/${entry.path.replace(/^public\//, "")}`));
      reachable = true;
    } catch (error) {
      log(`production fetch failed for ${id}: ${error.message}`);
      production[id] = null;
    }
  }
  return reachable ? production : null;
}

function trackedDataFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", "data", "public/data"], { cwd: root, maxBuffer: 1 << 28 }).toString("utf8");
    return out.split("\0").filter(Boolean).flatMap((path) => {
      try {
        return [{ path, bytes: statSync(join(root, path)).size }];
      } catch {
        return [];
      }
    });
  } catch {
    return null;
  }
}

function latestCompleted(games, results) {
  const finals = new Set((results ?? []).map((r) => r.gameId));
  const done = games.filter((g) => finals.has(g.gameId) && g.dateUtc).sort((a, b) => b.dateUtc.localeCompare(a.dateUtc));
  return done[0] ? { gameId: done[0].gameId, week: done[0].week, dateUtc: done[0].dateUtc } : null;
}

export async function buildReport(args, log = () => {}) {
  const root = args.root;
  const games = readJson(root, `public/data/nfl/${args.season}/games.json`)?.games;
  const results = readJson(root, `public/data/nfl/${args.season}/results.json`)?.results;
  const teamsJson = readJson(root, "public/data/nfl/teams.json");
  if (!games || !results) throw new Error(`games.json/results.json for ${args.season} are missing or unreadable`);

  const findings = [];
  const { upstream, checkedAt } = await loadUpstream(args, teamsJson, log);
  const { finding: weekFinding, resolution } = checkCurrentWeek({ games, now: args.now, upstream });

  findings.push(...checkScheduleConsistency({ games, results, now: args.now, upstream }));
  findings.push(...checkUpstreamParity({ games, results, upstream: args.upstream ? upstream : null, now: args.now }).filter((f) => args.upstream || f.severity !== "unknown"));
  findings.push(checkWeekCoverage({ games, results, currentWeek: resolution.week, upstream, now: args.now }));
  findings.push(weekFinding);

  let production = null;
  if (args.checks === "all") {
    const registry = artifactRegistry(args.season, resolution.week);
    const artifacts = Object.fromEntries(registry.map((entry) => [entry.id, entry.path ? readJson(root, entry.path) : null]));
    findings.push(...checkArtifacts({ registry, artifacts, resolution, games, now: args.now }));
    findings.push(checkOpponents({ artifact: artifacts["fantasy-points-allowed"], games, week: resolution.week, teams: (teamsJson?.teams ?? []).map((t) => t.abbr) }));
    if (args.github) findings.push(...checkWorkflowHealth({ workflows: CRITICAL_WORKFLOWS, runs: await loadWorkflowRuns(args, log), now: args.now }));
    if (args.production) {
      production = await loadProduction(args, registry, log);
      findings.push(...checkProduction({ local: Object.fromEntries(PRODUCTION_ARTIFACT_IDS.map((id) => [id, artifacts[id]])), production }));
    }
    const files = trackedDataFiles(root);
    findings.push(files ? checkFileSizes({ files }) : { id: "repo-file-size", severity: "unknown", category: "check_unavailable", message: "git ls-files unavailable; file sizes not checked", evidence: {} });
  }

  const summary = summarizeFindings(findings);
  return {
    schemaVersion: "nfl-freshness-report-v1",
    checkedAt: args.now.toISOString(),
    season: args.season,
    checks: args.checks,
    ...summary,
    currentWeek: { week: resolution.week, source: resolution.source, statusWeek: resolution.statusWeek },
    sources: {
      gamesGeneratedAt: readJson(root, `public/data/nfl/${args.season}/games.json`)?._meta?.generatedAt ?? null,
      resultsGeneratedAt: readJson(root, `public/data/nfl/${args.season}/results.json`)?._meta?.generatedAt ?? null,
      upstreamCheckedAt: checkedAt,
      finalsCommitted: results.length,
      finalsUpstream: upstream ? upstream.results.length : null,
      latestCompletedGame: latestCompleted(games, results),
    },
    findings,
  };
}

const ICON = { ok: "✅", warn: "⚠️", fail: "❌", unknown: "❔" };

export function renderMarkdown(report) {
  const lines = [
    `## NFL data freshness: **${report.status.toUpperCase()}**`,
    "",
    `Checked ${report.checkedAt} · season ${report.season} · current week **${report.currentWeek.week ?? "n/a"}** (${report.currentWeek.source})`,
    `Finals committed ${report.sources.finalsCommitted}${report.sources.finalsUpstream == null ? "" : ` / upstream ${report.sources.finalsUpstream}`} · latest completed game ${report.sources.latestCompletedGame?.gameId ?? "n/a"} (${report.sources.latestCompletedGame?.dateUtc ?? "n/a"})`,
    `Results generated ${report.sources.resultsGeneratedAt ?? "n/a"} · upstream checked ${report.sources.upstreamCheckedAt ?? "not checked"}`,
    "",
  ];
  const categories = Object.entries(report.byCategory);
  if (categories.length) lines.push(`Problems by cause: ${categories.map(([c, n]) => `\`${c}\` ×${n}`).join(", ")}`, "");
  const problems = report.findings.filter((f) => f.severity !== "ok");
  if (problems.length) {
    lines.push("| | Check | Cause | Detail |", "|---|---|---|---|");
    for (const f of problems) lines.push(`| ${ICON[f.severity]} | \`${f.id}\` | \`${f.category}\` | ${f.message.replace(/\|/g, "\\|")} |`);
    lines.push("");
  }
  lines.push(`<details><summary>${report.counts.ok} passing checks</summary>`, "", ...report.findings.filter((f) => f.severity === "ok").map((f) => `- ✅ \`${f.id}\` — ${f.message}`), "", "</details>");
  return `${lines.join("\n")}\n`;
}

function annotate(report) {
  for (const f of report.findings) {
    if (f.severity === "ok") continue;
    const level = f.severity === "fail" ? "error" : "warning";
    console.log(`::${level} title=NFL freshness: ${f.id} [${f.category}]::${f.message.replace(/\r?\n/g, " ")}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport(args, (msg) => console.error(`[nfl:freshness] ${msg}`));
  const markdown = renderMarkdown(report);
  console.log(markdown);
  if (process.env.GITHUB_ACTIONS === "true") annotate(report);
  if (args.json) writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
  const summaryPath = args.summary ?? process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, markdown);

  const gating = report.findings.filter((f) => f.severity === "fail" && (!args.failOn || args.failOn.has(f.category)));
  if (gating.length > 0) process.exit(1);
  if (args.strict && report.status === "unknown") process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[nfl:freshness] FAILED to run: ${error.message}`);
    process.exit(3);
  });
}
