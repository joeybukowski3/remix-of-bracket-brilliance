import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, "public/data/mlb/hr-props-raw.json");
const ODDS_PATH = path.join(ROOT, "public/data/mlb/mlb-odds.json");

const rawData = JSON.parse(readFileSync(RAW_PATH, "utf8"));
const oddsData = JSON.parse(readFileSync(ODDS_PATH, "utf8"));

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

const hrOdds = oddsData.hrOdds && typeof oddsData.hrOdds === "object" ? oddsData.hrOdds : {};
const availableOddsCount = Object.keys(hrOdds).length;

if (availableOddsCount === 0) {
  console.log("⚠️ No HR odds returned by the provider; leaving existing batter odds unchanged.");
  process.exit(0);
}

let matched = 0;
const updatedBatters = (rawData.batters ?? []).map((batter) => {
  const normalizedName = normalizeName(batter.player);
  const hrOddsEntry = hrOdds[normalizedName];

  if (!hrOddsEntry) return batter;
  matched += 1;
  return {
    ...batter,
    hrLine: hrOddsEntry.line ?? 0.5,
    hrOddsYes: hrOddsEntry.yes ?? null,
    hrOddsNo: hrOddsEntry.no ?? null,
    hrOddsBook: hrOddsEntry.bookmaker ?? null,
  };
});

const updatedData = {
  ...rawData,
  batters: updatedBatters,
};

writeFileSync(RAW_PATH, JSON.stringify(updatedData, null, 2) + "\n");

console.log(`✅ Provider supplied ${availableOddsCount} HR player lines`);
console.log(`✅ Updated ${updatedBatters.length} batters`);
console.log(`✅ Matched ${matched} batters with HR odds`);
console.log(`✅ Saved to ${RAW_PATH}`);
