/**
 * TEMPORARY -- live validation reporter for the MLB prop line-selection fix.
 *
 * Reads only *derived* data (selection diagnostics, the published odds file and
 * the model file) and emits a sanitized report. It never reads credentials,
 * request headers, or the raw provider payload, and it asserts before writing
 * that nothing secret-shaped made it into the output.
 *
 * Removed together with .github/workflows/validate-mlb-prop-odds-live.yml once
 * live validation has passed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { injectHrOdds, injectKOdds } from "./lib/mlb-prop-odds-core.mjs";
import { normalizeMlbPropName } from "./lib/mlb-prop-name-normalizer.mjs";
import {
  checkHomeRunOdds,
  checkInjectedModelRows,
  checkStrikeoutOdds,
  modalValue,
  summarizeViolations,
} from "./lib/mlb-prop-odds-integrity.mjs";

const ROOT = process.cwd();
const ODDS_PATH = path.join(ROOT, "public/data/mlb/mlb-odds.json");
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const DIAGNOSTICS_PATH = path.join(ROOT, "artifacts/mlb-prop-line-selection.json");
const OUT_DIR = path.join(ROOT, "artifacts/live-validation");

/** Anything matching these must never appear in a published artifact. */
const SECRET_PATTERNS = [
  /x-api-key/i,
  /authorization/i,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/,
  /\bsk-[A-Za-z0-9]{16,}/,
  /apikey=/i,
];

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function assertSanitized(label, text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) throw new Error(`Refusing to write ${label}: matched ${pattern}`);
  }
}

function debugPlayers() {
  return String(process.env.MLB_ODDS_DEBUG_PLAYERS ?? "")
    .split(",")
    .map((name) => normalizeMlbPropName(name))
    .filter(Boolean);
}

/** Selection detail for one watched player, across both markets. */
function playerReport(diagnostics, player) {
  const buckets = [];
  for (const market of ["hr", "k"]) {
    const section = diagnostics?.[market];
    if (!section) continue;
    const match = (list) => (list ?? []).filter((entry) => String(entry.player ?? "").startsWith(player));
    for (const entry of match(section.selected)) buckets.push({ market, outcome: "selected", entry });
    for (const entry of match(section.rejected)) buckets.push({ market, outcome: "rejected", entry });
  }
  return { player, records: buckets };
}

function formatPlayerMarkdown({ player, records }) {
  if (records.length === 0) return `### ${player}\n\n_Not present in today's provider payload._\n`;
  const lines = [`### ${player}\n`];
  for (const { market, outcome, entry } of records) {
    const offered = (entry.pointsOffered ?? [])
      .map((point) => `| ${point.point} | ${point.books} | ${point.twoSidedBooks > 0 ? `yes (${point.twoSidedBooks})` : "no"} |`)
      .join("\n");
    lines.push(
      `**${market.toUpperCase()} — ${outcome}${entry.rejected ? ` (${entry.rejected})` : ""}**`,
      "",
      `- provider key: \`${entry.player}\` (provider name: ${entry.providerPlayerName ?? "n/a"})`,
      `- provider market: \`${entry.providerMarket ?? "n/a"}\` · marked alternate: **${entry.isAlternate === true ? "yes" : "no"}**`,
      `- selected threshold: **${entry.selectedPoint ?? "none"}** · two-sided: **${entry.twoSided === true ? "yes" : "no"}**`,
      `- selected book: **${entry.selectedBook ?? "none"}** · books at threshold: ${(entry.booksAtPoint ?? []).join(", ") || "none"}`,
      `- Over: ${(entry.overQuotes ?? []).map((q) => `${q.bookmaker} ${q.price}`).join(", ") || "none"}`,
      `- Under: ${(entry.underQuotes ?? []).map((q) => `${q.bookmaker} ${q.price}`).join(", ") || "none"}`,
      `- reason: \`${entry.reason ?? "n/a"}\` · warnings: ${(entry.warnings ?? []).join(", ") || "none"}`,
      "",
      "| threshold | distinct books | two-sided |",
      "| --- | --- | --- |",
      offered || "| _none_ | | |",
      "",
    );
  }
  return lines.join("\n");
}

/**
 * Rows this run actually sourced from the live payload.
 *
 * `injectKOdds`/`injectHrOdds` deliberately preserve a previously stored
 * same-slate value when a player is not in the current provider response, so
 * the injected file can still carry rows produced by an older pipeline. Those
 * carryover rows are reported separately and never counted against this fix.
 */
function partitionByFreshMatch(rows, nameField, selections) {
  const fresh = [];
  const carryover = [];
  for (const row of rows) {
    const key = normalizeMlbPropName(row?.[nameField]);
    if (selections[key]) fresh.push({ row, key, selection: selections[key] });
    else carryover.push(row);
  }
  return { fresh, carryover };
}

/** Confirms the injectors did not alter the threshold or prices they were given. */
function injectionFidelity(fresh, { lineField, overField, underField }) {
  const mismatches = [];
  for (const { row, key, selection } of fresh) {
    const sameLine = Number(row[lineField]) === Number(selection.line ?? selection.point);
    const sameOver = (row[overField] ?? null) === (selection.over ?? selection.yes ?? null);
    const expectedUnder = selection.under ?? selection.no ?? null;
    const sameUnder = (row[underField] ?? null) === expectedUnder;
    if (!sameLine || !sameOver || !sameUnder) {
      mismatches.push({ player: key, injected: { line: row[lineField], over: row[overField], under: row[underField] }, selected: { line: selection.line, over: selection.over ?? selection.yes, under: expectedUnder } });
    }
  }
  return mismatches;
}

function coverage(odds, raw) {
  const kOdds = odds?.kOdds ?? {};
  const hrOdds = odds?.hrOdds ?? {};
  const kInjected = injectKOdds(raw, odds);
  const hrInjected = injectHrOdds(raw, odds);
  const pitchers = kInjected.data.pitchers ?? [];
  const batters = hrInjected.data.batters ?? [];

  const kSplit = partitionByFreshMatch(pitchers, "pitcher", kOdds);
  const hrSplit = partitionByFreshMatch(batters, "player", hrOdds);

  // Primary output = the layer this fix owns.
  const kSelections = Object.values(kOdds);
  const hrSelections = Object.values(hrOdds);
  const canonicalHr = modalValue(hrSelections.map((entry) => Number(entry.line)));

  return {
    slate: { model: raw?.date ?? null, odds: odds?.fetchedAt ?? null, sameSlate: kInjected.status.sameSlate },
    strikeouts: {
      probableStarters: pitchers.length,
      withSelectedLine: kSplit.fresh.length,
      omitted: kSplit.carryover.length,
      omittedPitchers: kSplit.carryover.map((row) => row.pitcher),
      twoSided: kSplit.fresh.filter(({ selection }) => selection.over && selection.under).length,
      oneSidedInPrimaryOutput: kSelections.filter((entry) => !entry.over || !entry.under).length,
      providerSelections: kSelections.length,
      injectionMismatches: injectionFidelity(kSplit.fresh, { lineField: "kLine", overField: "kOddsOver", underField: "kOddsUnder" }),
      carryoverRowsInModelFile: kSplit.carryover.filter((row) => row.kLine != null).length,
    },
    homeRuns: {
      battersEvaluated: batters.length,
      withSelectedPrice: hrSplit.fresh.length,
      canonicalLine: canonicalHr,
      onCanonicalLine: hrSelections.filter((entry) => Number(entry.line) === canonicalHr).length,
      onLadderMarkets: hrSelections.filter((entry) => Number(entry.line) !== canonicalHr).length,
      omitted: hrSplit.carryover.length,
      providerSelections: hrSelections.length,
      injectionMismatches: injectionFidelity(hrSplit.fresh, { lineField: "hrLine", overField: "hrOddsYes", underField: "hrOddsNo" }),
      carryoverRowsInModelFile: hrSplit.carryover.filter((row) => row.hrLine != null).length,
    },
  };
}

function main() {
  const odds = readJson(ODDS_PATH);
  const raw = readJson(RAW_PATH);
  const diagnostics = readJson(DIAGNOSTICS_PATH);
  if (!odds || !raw) throw new Error("Missing mlb-odds.json or hr-props-raw.json -- run the fetcher first.");

  const kIntegrity = checkStrikeoutOdds(odds.kOdds);
  const hrIntegrity = checkHomeRunOdds(odds.hrOdds);

  // Scope model-level checks to rows this run actually sourced, so carryover
  // written by the previous pipeline is not attributed to this fix.
  const injected = injectKOdds(injectHrOdds(raw, odds).data, odds).data;
  const freshModel = {
    pitchers: (injected.pitchers ?? []).filter((row) => odds.kOdds?.[normalizeMlbPropName(row.pitcher)]),
    batters: (injected.batters ?? []).filter((row) => odds.hrOdds?.[normalizeMlbPropName(row.player)]),
  };
  const modelIntegrity = checkInjectedModelRows(freshModel);
  const violations = [...kIntegrity.violations, ...hrIntegrity.violations, ...modelIntegrity.violations];
  const stats = coverage(odds, raw);
  const players = debugPlayers().map((player) => playerReport(diagnostics, player));

  const summary = {
    generatedAt: new Date().toISOString(),
    lineSelection: odds.fetchStatus?.lineSelection ?? null,
    detectedMarkets: odds.fetchStatus?.detectedMarkets ?? [],
    providerRows: odds.fetchStatus?.propsRows ?? 0,
    coverage: stats,
    integrity: {
      violations: violations.length,
      breakdown: summarizeViolations(violations),
      warnings: summarizeViolations(kIntegrity.warnings),
      sample: violations.slice(0, 20),
    },
    players,
  };

  const markdown = [
    "# Live MLB prop odds validation",
    "",
    `Generated: ${summary.generatedAt}`,
    `Provider rows: ${summary.providerRows} · quotes: ${summary.lineSelection?.quotes ?? "n/a"} · unusable rows: ${summary.lineSelection?.unusableRows ?? "n/a"}`,
    `Model slate: ${stats.slate.model} · odds fetched: ${stats.slate.odds} · same slate: ${stats.slate.sameSlate}`,
    "",
    "## Integrity",
    "",
    `Violations: **${violations.length}** ${summarizeViolations(violations).join(" ") || "(none)"}`,
    `Warnings: ${summarizeViolations(kIntegrity.warnings).join(" ") || "(none)"}`,
    "",
    "## Strikeout coverage",
    "",
    `- probable starting pitchers: ${stats.strikeouts.probableStarters}`,
    `- with a selected K line this run: ${stats.strikeouts.withSelectedLine}`,
    `- omitted: ${stats.strikeouts.omitted}`,
    `- omitted pitchers: ${stats.strikeouts.omittedPitchers.join(", ") || "none"}`,
    `- selected with BOTH Over and Under: ${stats.strikeouts.twoSided}`,
    `- total K selections published: ${stats.strikeouts.providerSelections}`,
    `- **one-sided K markets in primary output: ${stats.strikeouts.oneSidedInPrimaryOutput}** (expected 0)`,
    `- injector fidelity mismatches: ${stats.strikeouts.injectionMismatches.length} (expected 0)`,
    `- carryover rows from the previous pipeline still in the model file: ${stats.strikeouts.carryoverRowsInModelFile} (not produced by this run)`,
    "",
    "## Home run coverage",
    "",
    `- batters evaluated: ${stats.homeRuns.battersEvaluated}`,
    `- with a selected HR price this run: ${stats.homeRuns.withSelectedPrice}`,
    `- canonical threshold: ${stats.homeRuns.canonicalLine}`,
    `- selections on canonical threshold: ${stats.homeRuns.onCanonicalLine}`,
    `- total HR selections published: ${stats.homeRuns.providerSelections}`,
    `- **on 2+/3+/4+ ladder markets: ${stats.homeRuns.onLadderMarkets}** (expected 0)`,
    `- injector fidelity mismatches: ${stats.homeRuns.injectionMismatches.length} (expected 0)`,
    `- omitted: ${stats.homeRuns.omitted}`,
    `- carryover rows from the previous pipeline still in the model file: ${stats.homeRuns.carryoverRowsInModelFile} (not produced by this run)`,
    "",
    "## Watched players",
    "",
    ...players.map(formatPlayerMarkdown),
  ].join("\n");

  const summaryText = JSON.stringify(summary, null, 2);
  assertSanitized("summary.json", summaryText);
  assertSanitized("report.md", markdown);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "live-validation-summary.json"), summaryText, "utf8");
  writeFileSync(path.join(OUT_DIR, "live-validation-report.md"), markdown, "utf8");

  console.log(markdown);
  console.log(`\n[live-validation] wrote ${OUT_DIR}`);

  const failures = [];
  if (stats.strikeouts.oneSidedInPrimaryOutput > 0) failures.push(`${stats.strikeouts.oneSidedInPrimaryOutput} one-sided K markets in primary output`);
  if (stats.homeRuns.onLadderMarkets > 0) failures.push(`${stats.homeRuns.onLadderMarkets} HR ladder markets in primary output`);
  if (violations.length > 0) failures.push(`${violations.length} integrity violations`);
  if (stats.strikeouts.injectionMismatches.length > 0) failures.push(`${stats.strikeouts.injectionMismatches.length} K injector mismatches`);
  if (stats.homeRuns.injectionMismatches.length > 0) failures.push(`${stats.homeRuns.injectionMismatches.length} HR injector mismatches`);

  if (failures.length > 0) {
    console.error(`[live-validation] FAILED: ${failures.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log("[live-validation] PASSED: no ladder or one-sided markets reached the primary output.");
  }
}

main();
