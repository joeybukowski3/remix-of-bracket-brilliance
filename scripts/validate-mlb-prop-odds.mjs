import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getEtDate, isAmericanOdds, isValidPropLine } from "./lib/mlb-prop-name-normalizer.mjs";

const ROOT = process.cwd();
const raw = JSON.parse(readFileSync(path.join(ROOT, "public/data/mlb/hr-props-raw.json"), "utf8"));
const odds = JSON.parse(readFileSync(path.join(ROOT, "public/data/mlb/mlb-odds.json"), "utf8"));
const statusPath = path.join(ROOT, "artifacts/mlb-k-odds-status.json");
const kStatus = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, "utf8")) : null;
const hrWithOdds = (raw.batters ?? []).filter((row) => isAmericanOdds(row.hrOddsYes)).length;
const kWithLine = (raw.pitchers ?? []).filter((row) => isValidPropLine(row.kLine)).length;
const kWithOver = (raw.pitchers ?? []).filter((row) => isAmericanOdds(row.kOddsOver)).length;
const kWithUnder = (raw.pitchers ?? []).filter((row) => isAmericanOdds(row.kOddsUnder)).length;
const oddsSlateDate = String(odds.date ?? "").trim() || getEtDate(odds.fetchedAt) || getEtDate(odds.generatedAt);
const sameSlate = Boolean(raw.date && oddsSlateDate && raw.date === oddsSlateDate);
console.log(`[prop-odds-validation] modelSlate=${raw.date ?? "missing"} oddsSlate=${oddsSlateDate || "missing"} sameSlate=${sameSlate}`);
console.log(`[prop-odds-validation] providerRows=${odds.fetchStatus?.propsRows ?? 0} hrProvider=${Object.keys(odds.hrOdds ?? {}).length} kProvider=${Object.keys(odds.kOdds ?? {}).length}`);
console.log(`[prop-odds-validation] hrWithOdds=${hrWithOdds} kWithLine=${kWithLine} kWithOver=${kWithOver} kWithUnder=${kWithUnder}`);
if (kStatus) console.log(`[prop-odds-validation] kInjectionStatus=${kStatus.status} matched=${kStatus.pitchersMatched} preserved=${kStatus.sameSlatePreserved}`);
if (!sameSlate || hrWithOdds === 0 || kWithLine === 0 || kWithOver === 0) {
  console.error("[prop-odds-validation] Odds enrichment is incomplete. Model generation may continue, but social posting must wait or skip.");
  process.exitCode = 1;
}
