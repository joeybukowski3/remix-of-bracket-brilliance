import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { injectKOdds } from "./lib/mlb-prop-odds-core.mjs";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const ODDS_PATH = path.join(ROOT, "public/data/mlb/mlb-odds.json");
const STATUS_PATH = path.join(ROOT, "artifacts/mlb-k-odds-status.json");

const rawData = JSON.parse(readFileSync(RAW_PATH, "utf8"));
const oddsData = JSON.parse(readFileSync(ODDS_PATH, "utf8"));
const result = injectKOdds(rawData, oddsData);

writeFileSync(RAW_PATH, JSON.stringify(result.data, null, 2) + "\n");
mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
writeFileSync(STATUS_PATH, JSON.stringify(result.status, null, 2) + "\n");

console.log(`[k-odds] status=${result.status.status} sameSlate=${result.status.sameSlate} modelSlate=${result.status.slateDate || "missing"} oddsSlate=${result.status.oddsSlateDate || "missing"}`);
console.log(`[k-odds] providerRecords=${result.status.providerRecords} usefulProviderRecords=${result.status.usefulProviderRecords}`);
console.log(`[k-odds] pitchersMatched=${result.status.pitchersMatched} pitchersUnmatched=${result.status.pitchersUnmatched} sameSlatePreserved=${result.status.sameSlatePreserved} staleRecordsCleared=${result.status.staleRecordsCleared}`);
console.log(`[k-odds] withLine=${result.status.withLine} withOverPrice=${result.status.withOverPrice} withUnderPrice=${result.status.withUnderPrice}`);
console.log(`[k-odds] saved=${RAW_PATH}`);
