/** Read-only production-artifact comparison; writes only the explicitly supplied offline path. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AVAILABILITY_POLICY_VERSION, AVAILABILITY_SCHEMA_VERSION, type Player } from "../src/lib/nfl/availability/resolver.ts";
import { resolveOfficialCapture } from "../src/lib/nfl/availability/capture.ts";

const cutoff = "2026-10-22T21:11:00Z";
const gamesPath = "public/data/nfl/2026/games.json";
const yardagePath = "public/data/nfl/2026/yardage-projections.json";
const fantasyPath = "public/data/fantasy/projections/2026/week-07.json";
const touchdownPath = "public/data/nfl/2026/touchdown-preview.json";
const capturePath = "data/nfl/availability/2026/week-07.json";
function source(path: string) {
  const raw = readFileSync(path, "utf8");
  return { data: JSON.parse(raw), sha256: createHash("sha256").update(raw).digest("hex") };
}
const games = source(gamesPath);
const yardage = source(yardagePath);
const fantasy = source(fantasyPath);
const touchdown = source(touchdownPath);
const capture = source(capturePath);
const targets = [
  { id: "gsis:00-0039923", name: "J.J. McCarthy", team: "nyg", position: "QB" as const },
  { id: "gsis:00-0031503", name: "Jameis Winston", team: "nyg", position: "QB" as const },
  { id: "gsis:00-0040236", name: "Kyle Monangai", team: "chi", position: "RB" as const },
];
const players: Player[] = targets.map((target) => {
  const game = games.data.games.find((g: { week: number; homeAbbr: string; awayAbbr: string }) => g.week === 7 && [g.homeAbbr, g.awayAbbr].some((t) => t.toLowerCase() === target.team));
  if (!game?.dateUtc) throw new Error(`No Week 7 game for ${target.team}`);
  return { season: 2026, week: 7, gameId: game.gameId, kickoff: game.dateUtc,
    playerId: target.id, playerName: target.name, team: target.team,
    opponent: (game.homeAbbr.toLowerCase() === target.team ? game.awayAbbr : game.homeAbbr).toLowerCase(),
    position: target.position, competingPlayerIds: target.team === "nyg" ? [target.id === targets[0].id ? targets[1].id : targets[0].id] : [] };
});
const evidence = capture.data.observations;
const records = resolveOfficialCapture(capture.data, players, cutoff);
const comparisons = records.map((record) => {
  const oldYardage = yardage.data.rows.filter((r: { playerId: string }) => r.playerId === record.playerId)
    .map((r: { market: string; status: string; roleSource: string; depthRank: number | null }) => ({ market: r.market, status: r.status, roleSource: r.roleSource, depthRank: r.depthRank }));
  const fantasyRows = fantasy.data.rows as Record<string, { playerId: string; position: string; projectedFantasyPoints?: number }[]>;
  const oldFantasy = Object.values(fantasyRows).flat().filter((r) => r.playerId === record.playerId)
    .map((r) => ({ position: r.position, projected: typeof r.projectedFantasyPoints === "number", availability: "not represented", role: "not represented" }));
  const oldTouchdown = touchdown.data.week === 7 ? touchdown.data.players.filter((r: { playerId: string }) => r.playerId === record.playerId)
    .map((r: { playerId: string }) => ({ candidate: true, playerId: r.playerId })) : [];
  return { playerId: record.playerId, playerName: record.playerName, gameId: record.gameId,
    old: { yardage: oldYardage, fantasy: oldFantasy, dfs: "upload-dependent; no canonical Week 7 slate", touchdown: oldTouchdown },
    proposed: { role: record.role, availability: record.availability, lineupEligibility: record.lineupEligibility, confidence: record.confidence },
    supportingEvidenceIds: record.usedEvidenceIds };
});
const preview = { schemaVersion: AVAILABILITY_SCHEMA_VERSION, policyVersion: AVAILABILITY_POLICY_VERSION,
  previewOnly: true, predictionCutoff: cutoff, generatedAt: cutoff,
  inputHashes: { [gamesPath]: games.sha256, [yardagePath]: yardage.sha256, [fantasyPath]: fantasy.sha256, [touchdownPath]: touchdown.sha256, [capturePath]: capture.sha256 },
  evidence, records, comparisons };
const snapshotId = `nfl-availability-${createHash("sha256").update(JSON.stringify(preview)).digest("hex")}`;
const output = process.argv.find((a) => a.startsWith("--output="))?.slice(9);
if (!output) throw new Error("Provide an explicit offline --output=path.");
writeFileSync(resolve(output), `${JSON.stringify({ ...preview, snapshotId }, null, 2)}\n`);
console.log(`Wrote ${comparisons.length} offline Week 7 comparisons to ${output}`);
