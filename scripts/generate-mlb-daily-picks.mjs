/**
 * DEPRECATED LEGACY X-POSTING PATH -- see the top-of-file comment in
 * .github/workflows/post-mlb-daily-picks.yml for the full context. This
 * script itself only ever built tweet text (it never called the X API
 * directly -- that happened in a since-removed workflow step via a
 * third-party action); it's kept as a preview-text generator only. A
 * candidate for full deletion in a later cleanup PR.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");

function loadJson(filename) {
  try {
    const fullPath = path.join(DATA_DIR, filename);
    const data = readFileSync(fullPath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load ${filename}`, err.message);
    return null;
  }
}

function getTopStrikeoutLeans(rawData, limit = 3) {
  if (!rawData?.pitchers) return [];
  
  return rawData.pitchers
    .filter(p => p.kVs && Number(p.kVs) > 40)
    .sort((a, b) => Number(b.kVs) - Number(a.kVs))
    .slice(0, limit)
    .map(p => ({
      pitcher: p.pitcher,
      team: p.team,
      kVs: Math.round(Number(p.kVs))
    }));
}

function buildTweet() {
  const bestBets = loadJson("hr-props-best-bets.json");
  const raw = loadJson("hr-props-raw.json");

  if (!bestBets?.bestBets?.length) {
    return "No MLB prop data available today.";
  }

  const hrTop = bestBets.bestBets.slice(0, 3);
  const soLeans = getTopStrikeoutLeans(raw);

  let tweet = `🚨 JoeKnowsBall MLB Top Plays ${new Date().toLocaleDateString('en-US', {month:'short', day:'numeric'})} \n\n`;

  // HR Props
  tweet += `🔨 Top HR Props:\n`;
  hrTop.forEach((p, i) => {
    tweet += `• ${p.player} (${p.team}) o0.5 HR\n`;
  });

  // Strikeouts
  if (soLeans.length) {
    tweet += `\n⚾ Strikeout Leans:\n`;
    soLeans.forEach(p => {
      tweet += `• ${p.pitcher} (${p.team}) ${p.kVs}k projection\n`;
    });
  }

  // Placeholder for ML & O/U
  tweet += `\n💰 Moneyline & Totals coming soon...\n`;

  tweet += `\nFull model → https://www.joeknowsball.com/mlb\n`;
  tweet += `#MLB #Betting #MLBPicks`;

  return tweet.trim();
}

// Run directly or from GitHub Actions
const tweetText = buildTweet();
console.log(tweetText);

// For GitHub Actions - we'll write to a temp file
if (process.env.GITHUB_ACTIONS) {
  const fs = require("node:fs");
  fs.writeFileSync("/tmp/mlb-daily-picks.txt", tweetText);
}
