import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { injectHrOdds } from "./lib/mlb-prop-odds-core.mjs";
import { assessSlateAlignment, resolveExpectedSlateDate } from "./lib/mlb-data-freshness.mjs";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const ODDS_PATH = path.join(ROOT, "public/data/mlb/mlb-odds.json");
const STATUS_PATH = path.join(ROOT, "artifacts/mlb-hr-odds-status.json");

const rawData = JSON.parse(readFileSync(RAW_PATH, "utf8"));
const oddsData = JSON.parse(readFileSync(ODDS_PATH, "utf8"));

// Date-safety invariant (Aug 27-28 RCA): never inject odds unless the model
// artifact itself belongs to the expected Eastern slate. The shared injector
// already clears odds when the model and odds slates disagree with each other,
// but that check passes when BOTH are stale by the same wrong date. If the
// model is stale we leave hr-props-raw.json completely untouched and let the
// canonical generator / watchdog rebuild it -- we never fabricate or carry
// forward yesterday's lines.
const expectedDate = resolveExpectedSlateDate();
const alignment = assessSlateAlignment({ expectedDate, rawData, oddsData });
if (!alignment.modelCurrent) {
  const status = { status: "refused_stale_model", ...alignment };
  mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + "\n");
  console.warn(
    `::warning::[hr-odds] refusing odds injection — ${alignment.reason}. hr-props-raw.json left untouched.`,
  );
  process.exit(0);
}

const result = injectHrOdds(rawData, oddsData);

writeFileSync(RAW_PATH, JSON.stringify(result.data, null, 2) + "\n");
mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
writeFileSync(STATUS_PATH, JSON.stringify(result.status, null, 2) + "\n");

console.log(`[hr-odds] status=${result.status.status} sameSlate=${result.status.sameSlate} modelSlate=${result.status.slateDate || "missing"} oddsSlate=${result.status.oddsSlateDate || "missing"}`);
console.log(`[hr-odds] providerRecords=${result.status.providerRecords} usefulProviderRecords=${result.status.usefulProviderRecords}`);
console.log(`[hr-odds] battersMatched=${result.status.battersMatched} battersUnmatched=${result.status.battersUnmatched} sameSlatePreserved=${result.status.sameSlatePreserved} staleRecordsCleared=${result.status.staleRecordsCleared}`);
console.log(`[hr-odds] withYesPrice=${result.status.withYesPrice}`);
console.log(`[hr-odds] saved=${RAW_PATH}`);
