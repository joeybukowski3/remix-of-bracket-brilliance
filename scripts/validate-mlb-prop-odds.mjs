import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getEtDate, isAmericanOdds, isValidPropLine } from "./lib/mlb-prop-name-normalizer.mjs";

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
