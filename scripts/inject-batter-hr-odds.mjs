import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const ODDS_PATH = path.join(ROOT, "public/data/mlb/mlb-odds.json");

// Load both files
const rawData = JSON.parse(readFileSync(RAW_PATH, "utf8"));
const oddsData = JSON.parse(readFileSync(ODDS_PATH, "utf8"));

// Normalize batter name for lookup
function normalizeName(name) {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Update batters with HR odds
const updatedBatters = rawData.batters.map((batter) => {
  const normalizedName = normalizeName(batter.player);
  const hrOddsEntry = oddsData.hrOdds?.[normalizedName];
  
  if (hrOddsEntry) {
    return {
      ...batter,
      hrLine: null, // HR props use yes/no format, not over/under lines
      hrOddsYes: hrOddsEntry.yes ?? null,
      hrOddsNo: hrOddsEntry.no ?? null,
    };
  }
  
  return {
    ...batter,
    hrLine: null,
    hrOddsYes: null,
    hrOddsNo: null,
  };
});

// Update the raw data
const updatedData = {
  ...rawData,
  batters: updatedBatters,
};

// Save updated file
writeFileSync(RAW_PATH, JSON.stringify(updatedData, null, 2) + "\n");

// Report results
const withOdds = updatedBatters.filter(b => b.hrOddsYes !== null).length;
console.log(`✅ Updated ${updatedBatters.length} batters`);
console.log(`✅ Matched ${withOdds} batters with HR odds`);
console.log(`✅ Saved to ${RAW_PATH}`);
