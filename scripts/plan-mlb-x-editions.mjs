#!/usr/bin/env node
/**
 * MLB X edition planner.
 *
 * Morning editions use model-ranked participants with odds optional. Confirmed
 * editions use the existing priced value selections and lineup confirmation.
 */
import { chromium } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { buildConfirmationSnapshot, resolveHrRowFacts, resolveKRowFacts } from "./lib/mlb-x-confirmation-snapshot.mjs";
import { buildEditionPlans, conciseReason, writePlansAtomically, toWorkflowOutputs } from "./lib/mlb-x-edition-plan.mjs";
import {
  buildHrConfirmedSelection,
  buildHrMorningSelection,
  buildKConfirmedSelection,
  buildKMorningSelection,
} from "./lib/mlb-x-edition-selection.mjs";
import { buildDiagnosticRecord, DIAGNOSTIC_OUTCOMES } from "./lib/mlb-x-edition-diagnostics.mjs";
import { imageKindForMarket, validateImageBundle } from "./lib/mlb-x-image-bundle.mjs";
import { isPostedReceipt, parseEditionReceiptKey } from "./lib/mlb-x-edition-receipts.mjs";
import { acquireKPageData } from "./lib/mlb-x-k-page-scrape.mjs";
import { createGitStateStore, STATE_BRANCH } from "./lib/mlb-x-state-store.mjs";
import { getEtSlateDate } from "./lib/mlb-x-slate-timing.mjs";
import { resolveEventMode } from "./lib/mlb-x-event-mode.mjs";
import { normalizeAllowLivePostFlag } from "./lib/mlb-x-post-client.mjs";

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
    else if (raw.startsWith("--now=")) args.now = raw.slice("--now=".length);
  }
  args.planDirectory = args.planDirectory ?? path.join(ROOT, "artifacts", "mlb-x-plans");
  args.imageDirectory = args.imageDirectory ?? path.join(ROOT, "artifacts");
  args.stateWorkDir = args.stateWorkDir ?? path.join(ROOT, ".mlb-x-state-work");
  args.hrDataSource = args.hrDataSource ?? "production";
  if (!["production", "github", "local"].includes(args.hrDataSource)) throw new Error(`Invalid --hr-data-source="${args.hrDataSource}".`);
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
    barrelRate: toFiniteNumber(value?.barrelRate),
    hardHitRate: toFiniteNumber(value?.hardHitRate),
    last7HR: toFiniteNumber(value?.last7HR),
    last30HR: toFiniteNumber(value?.last30HR),
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
  if (outputPath) appendFileSync(outputPath, `${lines.join("\n")}\n`);
  for (const line of lines) console.log(`[plan-mlb-x-editions] output ${line}`);
}

function marketSource({ available, selection, artifactSlateDate, artifactGeneratedAt, artifactSources }) {
  return {
    available,
    selectedRows: selection.selectedRows,
    selectedLineupStatus: selection.selectedLineupStatus,
    artifactSlateDate,
    artifactGeneratedAt,
    artifactSources,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = args.now ? new Date(args.now) : new Date();
  const slateDate = args.slateDate ?? getEtSlateDate(now);
  console.log(`[plan-mlb-x-editions] slateDate=${slateDate} liveMode=${args.liveMode}`);

  const eventMode = resolveEventMode({
    eventName: process.env.GITHUB_EVENT_NAME ?? "",
    dispatchMode: process.env.MLB_X_DISPATCH_MODE ?? null,
    simulationNow: process.env.MLB_X_SIMULATION_NOW ?? null,
    slateDate,
  });
  if (process.env.MLB_X_SIMULATION_NOW && !eventMode.simulated) {
    console.warn(`[plan-mlb-x-editions] simulation_now requested but rejected (${eventMode.reason}); using the real clock`);
  }
  const readinessNow = eventMode.simulated ? new Date(eventMode.simulationNow) : now;
  if (eventMode.simulated) console.log(`[plan-mlb-x-editions] SIMULATED TIME: readiness computed against simulation_now=${eventMode.simulationNow}`);

  const snapshot = await buildConfirmationSnapshot({ date: slateDate, now: readinessNow });
  const firstGameTime = snapshot.timing.earliestGameTime;
  const gamesScheduled = snapshot.timing.gameCount;
  console.log(`[plan-mlb-x-editions] snapshotOk=${snapshot.ok} gamesScheduled=${gamesScheduled} firstGameTime=${firstGameTime ?? "n/a"}`);

  let kMorningSelection = { selectedRows: [], selectedLineupStatus: null };
  let kConfirmedSelection = { selectedRows: [], selectedLineupStatus: null };
  let kAvailable = false;
  let kArtifactSlateDate = null;
  if (!args.skipKScrape) {
    const result = await acquireKPageData({ launchBrowser: () => chromium.launch({ headless: true }) });
    if (result.available) {
      const pageData = result.pageData;
      kArtifactSlateDate = pageData.date || null;
      const dataFresh = pageData.date === slateDate;
      const enriched = (dataFresh ? pageData.rows : []).map((row) => {
        const facts = resolveKRowFacts(snapshot, row);
        return {
          ...row,
          isCurrentStarter: facts.isCurrentStarter,
          gameStarted: facts.gameStarted,
          opposingLineupConfirmed: facts.opposingLineupConfirmed,
          gameId: facts.gamePk,
          pitcherId: facts.starterId,
          gameNumber: facts.gameNumber,
          gameStartTime: facts.gameDate,
          isDoubleheader: facts.isDoubleheader,
        };
      });
      kMorningSelection = buildKMorningSelection({ rows: enriched });
      kConfirmedSelection = buildKConfirmedSelection({ rows: enriched });
      kAvailable = true;
      console.log(`[plan-mlb-x-editions] K: pageDate=${pageData.date || "missing"} dataFresh=${dataFresh} morning=${kMorningSelection.selectedRows.length} confirmedValue=${kConfirmedSelection.selectedRows.length}`);
    } else {
      console.warn(`[plan-mlb-x-editions] K data scrape failed (non-fatal): ${result.error instanceof Error ? result.error.message : result.error}`);
    }
  }

  let hrMorningSelection = { selectedRows: [], selectedLineupStatus: null };
  let hrConfirmedSelection = { selectedRows: [], selectedLineupStatus: null };
  let hrAvailable = false;
  let hrArtifactSlateDate = null;
  let hrGeneratedAt = null;
  try {
    const raw = await loadHrRawData(args.hrDataSource);
    hrArtifactSlateDate = normalizeText(raw?.date) || null;
    hrGeneratedAt = normalizeText(raw?.generatedAt) || null;
    const dateMismatch = Boolean(hrArtifactSlateDate && hrArtifactSlateDate !== slateDate);
    const batters = Array.isArray(raw?.batters) ? raw.batters.map(normalizeHrBatter).filter(Boolean) : [];
    const currentBatters = dateMismatch ? [] : batters;
    const enrichedBatters = currentBatters.map((row) => {
      const facts = resolveHrRowFacts(snapshot, row);
      return { ...row, gameNumber: facts.gameNumber, gameStartTime: facts.gameDate, isDoubleheader: facts.isDoubleheader };
    });
    const isGameStarted = (row) => resolveHrRowFacts(snapshot, row).gameStarted;
    const liveConfirm = (row) => resolveHrRowFacts(snapshot, row).liveConfirmed;
    hrMorningSelection = buildHrMorningSelection({ batters: enrichedBatters, isGameStarted });
    hrConfirmedSelection = buildHrConfirmedSelection({ batters: enrichedBatters, isGameStarted, liveConfirm });
    hrAvailable = true;
    console.log(`[plan-mlb-x-editions] HR: rawDate=${hrArtifactSlateDate || "missing"} dateMismatch=${dateMismatch} morning=${hrMorningSelection.selectedRows.length} confirmedValue=${hrConfirmedSelection.selectedRows.length} promoted=${hrConfirmedSelection.selectedLineupStatus.promotedFromLiveCount}`);
  } catch (error) {
    console.warn(`[plan-mlb-x-editions] HR data load failed: ${error instanceof Error ? error.message : error}`);
  }

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
    readReceipt = (receiptKey) => {
      const parsed = parseEditionReceiptKey(receiptKey);
      return parsed ? store.readReceipt(parsed) : null;
    };
    diagnosticStore = { writeDiagnostic: store.writeDiagnostic.bind(store) };
    console.log(`[plan-mlb-x-editions] state branch synced: ${STATE_BRANCH}`);
  }

  const imageBundleFor = (market) => {
    const result = validateImageBundle({ kind: imageKindForMarket(market), slateDate, directory: args.imageDirectory });
    return result.valid ? result : null;
  };
  const allowLivePostFlag = normalizeAllowLivePostFlag(process.env.X_ALLOW_LIVE_POST);
  console.log(`[plan-mlb-x-editions] X_ALLOW_LIVE_POST present=${allowLivePostFlag.present} enabled=${allowLivePostFlag.enabled}`);

  const shared = {
    now: readinessNow,
    slateDate,
    firstGameTime,
    gamesScheduled,
    readReceipt,
    imageBundleFor,
    liveMode: args.liveMode,
    allowLivePost: allowLivePostFlag.enabled,
    credentialsPresent: Boolean(process.env.JKB_X_API_KEY && process.env.JKB_X_API_SECRET && process.env.JKB_X_ACCESS_TOKEN && process.env.JKB_X_ACCESS_SECRET),
    verifiedAccount: true,
  };

  const morningPlans = buildEditionPlans({
    ...shared,
    markets: {
      k: marketSource({ available: kAvailable, selection: kMorningSelection, artifactSlateDate: kArtifactSlateDate ?? slateDate, artifactGeneratedAt: null, artifactSources: ["live-scrape:https://www.joeknowsball.com/mlb"] }),
      hr: marketSource({ available: hrAvailable, selection: hrMorningSelection, artifactSlateDate: hrArtifactSlateDate ?? slateDate, artifactGeneratedAt: hrGeneratedAt, artifactSources: [`public/data/mlb/hr-props-raw.json (${args.hrDataSource})`] }),
    },
  }).filter((plan) => plan.edition === "morning");

  const confirmedPlans = buildEditionPlans({
    ...shared,
    markets: {
      k: marketSource({ available: kAvailable, selection: kConfirmedSelection, artifactSlateDate: kArtifactSlateDate ?? slateDate, artifactGeneratedAt: null, artifactSources: ["live-scrape:https://www.joeknowsball.com/mlb"] }),
      hr: marketSource({ available: hrAvailable, selection: hrConfirmedSelection, artifactSlateDate: hrArtifactSlateDate ?? slateDate, artifactGeneratedAt: hrGeneratedAt, artifactSources: [`public/data/mlb/hr-props-raw.json (${args.hrDataSource})`] }),
    },
  }).filter((plan) => plan.edition === "confirmed");

  const plans = [...morningPlans, ...confirmedPlans];
  for (const plan of plans) {
    console.log(`[plan-mlb-x-editions] ${plan.market}/${plan.edition} status=${plan.readiness.status} shouldRun=${plan.readiness.shouldRunPoster} rows=${plan.selectedRows.length} receiptKey=${plan.readiness.receiptKey}`);
    if (isPostedReceipt(readReceipt(plan.readiness.receiptKey))) console.log("[plan-mlb-x-editions]   already posted");
    if (diagnosticStore && DIAGNOSTIC_OUTCOMES.includes(plan.readiness.status)) {
      try {
        const result = diagnosticStore.writeDiagnostic({
          slateDate: plan.slateDate,
          market: plan.market,
          edition: plan.edition,
          diagnostic: buildDiagnosticRecord({ market: plan.market, edition: plan.edition, slateDate: plan.slateDate, latestOutcome: plan.readiness.status, reason: conciseReason(plan), windowClosesAt: plan.readiness.windowClosesAt ?? null }),
        });
        if (result.pushed) console.log("[plan-mlb-x-editions]   diagnostic recorded (transition)");
      } catch (error) {
        console.warn(`[plan-mlb-x-editions]   diagnostic write failed (non-fatal): ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  writePlansAtomically(plans, args.planDirectory);
  console.log(`[plan-mlb-x-editions] wrote ${plans.length} plans to ${args.planDirectory}`);
  writeGithubOutput({ slate_date: slateDate, first_game_time: firstGameTime ?? "", ...toWorkflowOutputs(plans) });
}

main().catch((error) => {
  console.error(`[plan-mlb-x-editions] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
