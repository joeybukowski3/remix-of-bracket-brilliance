import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getEtDate, isAmericanOdds, isValidPropLine } from "./lib/mlb-prop-name-normalizer.mjs";
import {
  checkHomeRunOdds,
  checkInjectedModelRows,
  checkStrikeoutOdds,
  summarizeViolations,
} from "./lib/mlb-prop-odds-integrity.mjs";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const ODDS_PATH = path.join(ROOT, "public/data/mlb/mlb-odds.json");

const raw = JSON.parse(readFileSync(RAW_PATH, "utf8"));
const odds = existsSync(ODDS_PATH) ? JSON.parse(readFileSync(ODDS_PATH, "utf8")) : {};
const oddsSlateDate = String(odds.date ?? "").trim() || getEtDate(odds.fetchedAt) || getEtDate(odds.generatedAt);
const sameSlate = Boolean(raw.date && oddsSlateDate && raw.date === oddsSlateDate);
const hrWithOdds = (raw.batters ?? []).filter((row) => isAmericanOdds(row.hrOddsYes)).length;
const kWithLine = (raw.pitchers ?? []).filter((row) => isValidPropLine(row.kLine)).length;
const kWithOver = (raw.pitchers ?? []).filter((row) => isAmericanOdds(row.kOddsOver)).length;
const kWithUnder = (raw.pitchers ?? []).filter((row) => isAmericanOdds(row.kOddsUnder)).length;

console.log(`[prop-odds-validation] modelSlate=${raw.date ?? "missing"} oddsSlate=${oddsSlateDate || "missing"} sameSlate=${sameSlate}`);
console.log(`[prop-odds-validation] providerRows=${odds.fetchStatus?.propsRows ?? 0} hrProvider=${Object.keys(odds.hrOdds ?? {}).length} kProvider=${Object.keys(odds.kOdds ?? {}).length}`);
console.log(`[prop-odds-validation] hrWithOdds=${hrWithOdds} kWithLine=${kWithLine} kWithOver=${kWithOver} kWithUnder=${kWithUnder}`);

if (!sameSlate || hrWithOdds === 0 || kWithLine === 0 || kWithOver === 0) {
  console.error("[prop-odds-validation] Odds enrichment is incomplete. Model generation may continue, but social posting must wait or skip.");
  process.exitCode = 1;
}

// Primary-market integrity: an alternate/ladder rung must never reach the site
// as a primary line. These checks are structural -- no player and no maximum
// line value is hard-coded.
const kIntegrity = checkStrikeoutOdds(odds.kOdds);
const hrIntegrity = checkHomeRunOdds(odds.hrOdds);
const modelIntegrity = checkInjectedModelRows(raw);
const integrityViolations = [...kIntegrity.violations, ...hrIntegrity.violations, ...modelIntegrity.violations];

console.log(`[prop-odds-validation] canonicalHrLine=${hrIntegrity.canonicalLine ?? "n/a"} lineSelection=${JSON.stringify(odds.fetchStatus?.lineSelection ?? null)}`);
console.log(`[prop-odds-validation] integrityViolations=${integrityViolations.length} ${summarizeViolations(integrityViolations).join(" ") || "none"}`);
if (kIntegrity.warnings.length > 0) {
  console.warn(`[prop-odds-validation] warnings=${summarizeViolations(kIntegrity.warnings).join(" ")}`);
}

for (const item of integrityViolations.slice(0, 10)) {
  console.error(`[prop-odds-validation] ${item.code}: player=${item.player} line=${item.line}${item.canonicalLine != null ? ` canonical=${item.canonicalLine}` : ""}`);
}
if (integrityViolations.length > 10) {
  console.error(`[prop-odds-validation] ...and ${integrityViolations.length - 10} more integrity violations`);
}

if (integrityViolations.length > 0) {
  console.error("[prop-odds-validation] Alternate/ladder prop markets are being published as primary lines. Fix ingestion before posting.");
  process.exitCode = 1;
}
