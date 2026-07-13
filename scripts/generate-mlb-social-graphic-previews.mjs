import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { writeMlbSocialGraphic } from "./lib/mlb-social-graphic-renderer.mjs";

export const PREVIEW_SLATE_DATE = "2026-07-13";

export const HOME_RUN_PREVIEW_ROWS = [
  { playerId: 1, gameId: 101, player: "James Wood", team: "WSH", hrOddsYes: "+350", opposingPitcher: "Ryan Weathers", hrScore: 79, barrelRate: 22.8, hardHitRate: 59.9, last7HR: 3, last30HR: 7 },
  { playerId: 2, gameId: 102, player: "Yordan Alvarez", team: "HOU", hrOddsYes: "+220", opposingPitcher: "Cal Quantrill", hrScore: 78.3, barrelRate: 18.7, hardHitRate: 53.3, last7HR: 2, last30HR: 7 },
  { playerId: 3, gameId: 103, player: "Pete Crow-Armstrong", team: "CHC", hrOddsYes: "+255", opposingPitcher: "Hunter Greene", hrScore: 77.3, barrelRate: 10.9, hardHitRate: 49.2, last7HR: 2, last30HR: 10 },
  { playerId: 4, gameId: 104, player: "Matt Olson", team: "ATL", hrOddsYes: "+320", opposingPitcher: "Kyle Leahy", hrScore: 76.9, barrelRate: 14.2, hardHitRate: 51.9, last7HR: 3, last30HR: 6 },
  { playerId: 5, gameId: 105, player: "Vladimir Guerrero Jr.", team: "TOR", hrOddsYes: "+410", opposingPitcher: "Garrett Crochet", hrScore: 75.8, barrelRate: 19.1, hardHitRate: 57.4, last7HR: 1, last30HR: 9 },
];

export const STRIKEOUT_PREVIEW_ROWS = [
  { pitcherId: 11, gameId: 201, pitcher: "Tarik Skubal", team: "DET", opponent: "CWS", kLine: 6.5, oddsOver: "-115", oddsUnder: "-105", projectedKs: 8.4, strikeoutScore: 89.1 },
  { pitcherId: 12, gameId: 202, pitcher: "Miles Mikolas", team: "STL", opponent: "PIT", kLine: 6.5, oddsOver: "-125", oddsUnder: "-105", projectedKs: 4.8, strikeoutScore: 84.6 },
  { pitcherId: 13, gameId: 203, pitcher: "Freddy Peralta", team: "MIL", opponent: "COL", kLine: 6.5, oddsOver: "+100", oddsUnder: "-130", projectedKs: 7.8, strikeoutScore: 82 },
  { pitcherId: 14, gameId: 204, pitcher: "José Berríos", team: "TOR", opponent: "CLE", kLine: 6.5, oddsOver: "+105", oddsUnder: "-120", projectedKs: 5.3, strikeoutScore: 80.4 },
  { pitcherId: 15, gameId: 205, pitcher: "Logan Gilbert", team: "SEA", opponent: "ATH", kLine: 6.5, oddsOver: "-110", oddsUnder: "-110", projectedKs: 7.4, strikeoutScore: 78.6 },
];

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

export async function generatePreviews(outputDirectory = argumentValue("output-dir") || path.join("C:\\tmp", "jkb-mlb-social-artifact-port-previews")) {
  const homeRun = await writeMlbSocialGraphic({
    kind: "hr",
    slateDate: PREVIEW_SLATE_DATE,
    rows: HOME_RUN_PREVIEW_ROWS,
    svgPath: path.join(outputDirectory, "mlb-home-run-props.svg"),
    pngPath: path.join(outputDirectory, "mlb-home-run-props.png"),
  });
  const strikeout = await writeMlbSocialGraphic({
    kind: "k",
    slateDate: PREVIEW_SLATE_DATE,
    rows: STRIKEOUT_PREVIEW_ROWS,
    svgPath: path.join(outputDirectory, "mlb-strikeout-value-plays.svg"),
    pngPath: path.join(outputDirectory, "mlb-strikeout-value-plays.png"),
  });
  return { homeRun, strikeout };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const previews = await generatePreviews();
  console.log(`[mlb-social-preview] hrSvg=${previews.homeRun.svgPath}`);
  console.log(`[mlb-social-preview] hrPng=${previews.homeRun.pngPath}`);
  console.log(`[mlb-social-preview] kSvg=${previews.strikeout.svgPath}`);
  console.log(`[mlb-social-preview] kPng=${previews.strikeout.pngPath}`);
}
