#!/usr/bin/env node
/**
 * MLB X edition planner.
 *
 * Builds the four frozen edition plans (k-morning, hr-morning, k-confirmed,
 * hr-confirmed) for today's Eastern slate date and writes them to disk for
 * the poster jobs to consume. Lightweight by design: no Vite build, no X API
 * call, no successful receipt write. It reads the automation/mlb-x-state
 * branch (read-only) and inspects any existing image bundle without
 * rendering one.
 *
 * The one deliberate, flagged exception is K market data: there is no
 * server-side JSON artifact for K lines/odds/projections (unlike HR's
 * hr-props-raw.json), so scrapeKPageRows launches a browser against the LIVE
 * production page. See mlb-x-k-page-scrape.mjs for why.
 *
 * Usage:
 *   node scripts/plan-mlb-x-editions.mjs --plan-directory=artifacts/mlb-x-plans
 *     [--image-directory=artifacts] [--state-work-dir=<path>]
 *     [--hr-data-source=production|github|local] [--slate-date=YYYY-MM-DD]
 *     [--live-mode] [--skip-state-sync] [--skip-k-scrape]
 */
import { chromium } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { buildConfirmationSnapshot, resolveHrRowFacts, resolveKRowFacts } from "./lib/mlb-x-confirmation-snapshot.mjs";
import { buildEditionPlans, conciseReason, writePlansAtomically, toWorkflowOutputs } from "./lib/mlb-x-edition-plan.mjs";
import { buildHrEditionSelection, buildKEditionSelection } from "./lib/mlb-x-edition-selection.mjs";
import { buildDiagnosticRecord, DIAGNOSTIC_OUTCOMES } from "./lib/mlb-x-edition-diagnostics.mjs";
import { imageKindForMarket, validateImageBundle } from "./lib/mlb-x-image-bundle.mjs";
import { isPostedReceipt, parseEditionReceiptKey } from "./lib/mlb-x-edition-receipts.mjs";
import { scrapeKPageRows } from "./lib/mlb-x-k-page-scrape.mjs";
import { createGitStateStore, STATE_BRANCH } from "./lib/mlb-x-state-store.mjs";
import { getEtSlateDate } from "./lib/mlb-x-slate-timing.mjs";

const ROOT = process.cwd();
const PRODUCTION_HR_URL = "https://www.joeknowsball.com/data/mlb/hr-props-raw.json";
const GITHUB_HR_URL = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb/hr-props-raw.json";
const LOCAL_HR_PATH = path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");

function parseArgs(argv) {
  const args = { liveMode: false, skipStateSync: false, skipKScrape: false };
  for (const raw of argv) {
    if (raw === "--live-mode") args.liveMode = true;
    else if (raw === "--skip-state-sync") args.skipStateSync = true;
    else if (raw === "--skip-k-scrape") args.skipKScrape = true;
    else if (raw.startsWith("--plan-directory=")) args.planDirectory = raw.slice("--plan-directory=".length);
    else if (raw.startsWith("--image-directory=")) args.imageDirectory = raw.slice("--image-directory=".length);
    else if (raw.startsWith("--state-work-dir=")) args.stateWorkDir = raw.slice("--state-work-dir=".length);
    else if (raw.startsWith("--hr-data-source=")) args.hrDataSource = raw.slice("--hr-data-source=".length);
    else if (raw.startsWith("--slate-date=")) args.slateDate = raw.slice("--slate-date=".length);
    else if (raw.startsWith("--now=")) args.now = raw.slice("--now=".length); // test-only clock override
  }
  args.planDirectory = args.planDirectory ?? path.join(ROOT, "artifacts", "mlb-x-plans");
  args.imageDirectory = args.imageDirectory ?? path.join(ROOT, "artifacts");
  args.stateWorkDir = args.stateWorkDir ?? path.join(ROOT, ".mlb-x-state-work");
  args.hrDataSource = args.hrDataSource ?? "production";
  if (!["production", "github", "local"].includes(args.hrDataSource)) {
    throw new Error(`Invalid --hr-data-source="${args.hrDataSource}".`);
  }
  return args;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}
function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHrBatter(value) {
  const player = normalizeText(value?.player);
  const team = normalizeText(value?.team).toUpperCase();
  if (!player || !team) return null;
  return {
    player,
    playerId: value?.playerId ?? null,
    gameId: value?.gameId ?? null,
    team,
    opponent: normalizeText(value?.opponent).toUpperCase(),
    opposingPitcher: normalizeText(value?.opposingPitcher) || "TBD",
    hrScore: toFiniteNumber(value?.hrScore),
    hrScoreRank: toFiniteNumber(value?.hrScoreRank),
    hrOddsYes: normalizeText(value?.hrOddsYes) || null,
    category: normalizeText(value?.category) || undefined,
    lineupStatus: value?.lineupStatus ?? "unknown",
    battingOrder: value?.battingOrder ?? null,
  };
}

async function loadHrRawData(source) {
  if (source === "local") return JSON.parse(readFileSync(LOCAL_HR_PATH, "utf8"));
  const url = source === "github" ? GITHUB_HR_URL : PRODUCTION_HR_URL;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  return response.json();
}

function writeGithubOutput(pairs) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(pairs).map(([key, value]) => `${key}=${value}`);
  if (outputPath) {
    appendFileSync(outputPath, `${lines.join("\n")}\n`);
  }
  for (const line of lines) console.log(`[plan-mlb-x-editions] output ${line}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = args.now ? new Date(args.now) : new Date();
  const slateDate = args.slateDate ?? getEtSlateDate(now);
  console.log(`[plan-mlb-x-editions] slateDate=${slateDate} liveMode=${args.liveMode}`);

  const snapshot = await buildConfirmationSnapshot({ date: slateDate, now });
  const firstGameTime = snapshot.timing.earliestGameTime;
  const gamesScheduled = snapshot.timing.gameCount;
  console.log(`[plan-mlb-x-editions] snapshotOk=${snapshot.ok} gamesScheduled=${gamesScheduled} firstGameTime=${firstGameTime ?? "n/a"}`);

  // ── K market data: live scrape (see mlb-x-k-page-scrape.mjs). ────────────
  let kSelection = { selectedRows: [], selectedLineupStatus: null };
  let kAvailable = false;
  let kArtifactSlateDate = null;
  if (!args.skipKScrape) {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(60000);
      const pageData = await scrapeKPageRows(page);
      await page.close();
      kArtifactSlateDate = pageData.date || null;
      const dataFresh = pageData.date === slateDate;
      const enriched = (dataFresh ? pageData.rows : []).map((row) => {
        const facts = resolveKRowFacts(snapshot, row);
        return { ...row, isCurrentStarter: facts.isCurrentStarter, gameStarted: facts.gameStarted, opposingLineupConfirmed: facts.opposingLineupConfirmed, gameId: facts.gamePk, pitcherId: facts.starterId };
      });
      kSelection = buildKEditionSelection({ rows: enriched });
      kAvailable = true;
      console.log(`[plan-mlb-x-editions] K: pageDate=${pageData.date || "missing"} dataFresh=${dataFresh} selected=${kSelection.selectedRows.length}`);
    } finally {
      await browser.close();
    }
  }

  // ── HR market data: static JSON, no browser. ──────────────────────────────
  let hrSelection = { selectedRows: [], selectedLineupStatus: null };
  let hrAvailable = false;
  let hrArtifactSlateDate = null;
  let hrGeneratedAt = null;
  try {
    const raw = await loadHrRawData(args.hrDataSource);
    hrArtifactSlateDate = normalizeText(raw?.date) || null;
    hrGeneratedAt = normalizeText(raw?.generatedAt) || null;
    const dateMismatch = Boolean(hrArtifactSlateDate && hrArtifactSlateDate !== slateDate);
    const batters = Array.isArray(raw?.batters) ? raw.batters.map(normalizeHrBatter).filter(Boolean) : [];
    hrSelection = buildHrEditionSelection({
      batters: dateMismatch ? [] : batters,
      isGameStarted: (row) => resolveHrRowFacts(snapshot, row).gameStarted,
      liveConfirm: (row) => resolveHrRowFacts(snapshot, row).liveConfirmed,
    });
    hrAvailable = true;
    console.log(`[plan-mlb-x-editions] HR: rawDate=${hrArtifactSlateDate || "missing"} dateMismatch=${dateMismatch} selected=${hrSelection.selectedRows.length} promoted=${hrSelection.selectedLineupStatus.promotedFromLiveCount}`);
  } catch (error) {
    console.warn(`[plan-mlb-x-editions] HR data load failed: ${error instanceof Error ? error.message : error}`);
  }

  // ── Authoritative receipts: read-only. Diagnostics: write-capable, but this
  // script never calls store.writeReceipt anywhere -- only store.writeDiagnostic,
  // below, after the plans are built. The receipt (the actual publication
  // record) has exactly one writer: the poster's runEditionPost. ─────────────
  let readReceipt = () => null;
  let diagnosticStore = null;
  if (!args.skipStateSync) {
    const store = createGitStateStore({
      git: (cmdArgs, opts) => spawnSync("git", cmdArgs, { cwd: opts?.cwd, encoding: "utf8" }),
      workDir: args.stateWorkDir,
      readFile: (p) => readFileSync(p, "utf8"),
      writeFile: (p, c) => writeFileSync(p, c, "utf8"),
      ensureDir: (p) => mkdirSync(p, { recursive: true }),
      fileExists: existsSync,
    });
    if (!existsSync(args.stateWorkDir)) {
      mkdirSync(args.stateWorkDir, { recursive: true });
      spawnSync("git", ["init", "--quiet", "--initial-branch=main", args.stateWorkDir]);
      const remoteUrl = process.env.MLB_X_STATE_REMOTE_URL ?? ".";
      spawnSync("git", ["-C", args.stateWorkDir, "remote", "add", "origin", remoteUrl]);
    }
    store.sync();
    // buildEditionPlans calls readReceipt with the pre-built receipt-key
    // string (e.g. "mlb-k-2026-07-22-morning"), not an object -- parse it back
    // into the {slateDate, market, edition} shape the git state store expects.
    readReceipt = (receiptKey) => {
      const parsed = parseEditionReceiptKey(receiptKey);
      if (!parsed) return null;
      return store.readReceipt(parsed);
    };
    // Narrowed to writeDiagnostic only -- store.writeReceipt is reachable on
    // `store` but is never referenced past this point in this file.
    diagnosticStore = { writeDiagnostic: store.writeDiagnostic.bind(store) };
    console.log(`[plan-mlb-x-editions] state branch synced: ${STATE_BRANCH}`);
  }

  // ── Image bundles: inspect only, never render. ────────────────────────────
  const imageBundleFor = (market) => {
    const kind = imageKindForMarket(market);
    const result = validateImageBundle({ kind, slateDate, directory: args.imageDirectory });
    return result.valid ? result : null;
  };

  const plans = buildEditionPlans({
    now,
    slateDate,
    firstGameTime,
    gamesScheduled,
    markets: {
      k: {
        available: kAvailable,
        selectedRows: kSelection.selectedRows,
        selectedLineupStatus: kSelection.selectedLineupStatus,
        artifactSlateDate: kArtifactSlateDate ?? slateDate,
        artifactGeneratedAt: null,
        artifactSources: ["live-scrape:https://www.joeknowsball.com/mlb"],
      },
      hr: {
        available: hrAvailable,
        selectedRows: hrSelection.selectedRows,
        selectedLineupStatus: hrSelection.selectedLineupStatus,
        artifactSlateDate: hrArtifactSlateDate ?? slateDate,
        artifactGeneratedAt: hrGeneratedAt,
        artifactSources: [`public/data/mlb/hr-props-raw.json (${args.hrDataSource})`],
      },
    },
    readReceipt,
    imageBundleFor,
    liveMode: args.liveMode,
    allowLivePost: process.env.X_ALLOW_LIVE_POST === "true",
    credentialsPresent: Boolean(process.env.JKB_X_API_KEY && process.env.JKB_X_API_SECRET && process.env.JKB_X_ACCESS_TOKEN && process.env.JKB_X_ACCESS_SECRET),
    verifiedAccount: true, // the poster performs the real verification; the planner does not authenticate
  });

  for (const plan of plans) {
    console.log(`[plan-mlb-x-editions] ${plan.market}/${plan.edition} status=${plan.readiness.status} shouldRun=${plan.readiness.shouldRunPoster} rows=${plan.selectedRows.length} receiptKey=${plan.readiness.receiptKey}`);
    if (isPostedReceipt(readReceipt(plan.readiness.receiptKey))) {
      console.log(`[plan-mlb-x-editions]   already posted`);
    }

    // Persist a diagnostic for a planner-decided non-post status. Most of
    // these outcomes (NOT_DUE, MISSED_WINDOW, WAITING_FOR_SELECTED_LINEUPS,
    // NO_VALID_PICKS, INVALID_SLATE) are decided HERE and the corresponding
    // poster job never launches (the workflow gates it on should_run), so
    // this is the only place they can ever be recorded. Best-effort: a
    // diagnostic-write failure must never fail the plan itself.
    if (diagnosticStore && DIAGNOSTIC_OUTCOMES.includes(plan.readiness.status)) {
      try {
        const result = diagnosticStore.writeDiagnostic({
          slateDate: plan.slateDate,
          market: plan.market,
          edition: plan.edition,
          diagnostic: buildDiagnosticRecord({
            market: plan.market,
            edition: plan.edition,
            slateDate: plan.slateDate,
            latestOutcome: plan.readiness.status,
            reason: conciseReason(plan),
            windowClosesAt: plan.readiness.windowClosesAt ?? null,
          }),
        });
        if (result.pushed) console.log(`[plan-mlb-x-editions]   diagnostic recorded (transition)`);
      } catch (error) {
        console.warn(`[plan-mlb-x-editions]   diagnostic write failed (non-fatal): ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  writePlansAtomically(plans, args.planDirectory);
  console.log(`[plan-mlb-x-editions] wrote 4 plans to ${args.planDirectory}`);

  writeGithubOutput({
    slate_date: slateDate,
    first_game_time: firstGameTime ?? "",
    ...toWorkflowOutputs(plans),
  });
}

main().catch((error) => {
  console.error(`[plan-mlb-x-editions] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
