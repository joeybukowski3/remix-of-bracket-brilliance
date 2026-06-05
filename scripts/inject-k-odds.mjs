import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const ODDS_PATH = path.join(ROOT, "public/data/mlb/mlb-odds.json");

// Load both files
const rawData = JSON.parse(readFileSync(RAW_PATH, "utf8"));
const oddsData = JSON.parse(readFileSync(ODDS_PATH, "utf8"));

// Normalize pitcher name for lookup
function normalizeName(name) {
  return (name ?? "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .trim();
}

// Update pitchers with K odds
const updatedPitchers = rawData.pitchers.map((pitcher) => {
  const normalizedName = normalizeName(pitcher.pitcher);
  const kOddsEntry = oddsData.kOdds?.[normalizedName];
  
  if (kOddsEntry) {
    return {
      ...pitcher,
      kLine: kOddsEntry.line ?? null,
      kOddsOver: kOddsEntry.over ?? null,
      kOddsUnder: kOddsEntry.under ?? null,
    };
  }
  
  return {
    ...pitcher,
    kLine: null,
    kOddsOver: null,
    kOddsUnder: null,
  };
});

// Update the raw data
const updatedData = {
  ...rawData,
  pitchers: updatedPitchers,
};

// Save updated file
writeFileSync(RAW_PATH, JSON.stringify(updatedData, null, 2) + "\n");

// Report results
const withOdds = updatedPitchers.filter(p => p.kLine !== null).length;
console.log(`✅ Updated ${updatedPitchers.length} pitchers`);
console.log(`✅ Matched ${withOdds} pitchers with K odds`);
console.log(`✅ Saved to ${RAW_PATH}`);
