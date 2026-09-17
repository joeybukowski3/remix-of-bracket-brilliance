import { readFileSync } from "node:fs";
import { assertTouchdownPreviewArtifact } from "./lib/nfl-touchdown-preview-validation.mjs";

const season = Number(process.argv.find((arg) => arg.startsWith("--season="))?.slice(9) ?? 2026);
const week = Number(process.argv.find((arg) => arg.startsWith("--week="))?.slice(7));
if (!Number.isInteger(week) || week < 1 || week > 18) throw new Error("Provide --week=1-18.");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const base = `public/data/nfl/${season}`;
const artifact = read(`${base}/touchdown-preview.json`);
assertTouchdownPreviewArtifact(artifact, { season, week, games: read(`${base}/games.json`).games, yardage: read(`${base}/yardage-projections.json`) });
console.log(`Validated TD preview: season=${season} week=${week}, ${artifact.players.length} players.`);
