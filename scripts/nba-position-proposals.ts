/**
 * Proposed primary positions for the 50 highest-minute players with none, from their box-score rates, for review.
 *
 *   python -I scripts/nba-hoopr-player-features.py       # once, offline: per-player-season totals from the local hoopR files
 *   npx tsx scripts/nba-position-proposals.ts [--top=50] [--confirm-nothing-applied]
 *
 * Offline: no network, no provider, no credential. Reads private files under data/nba/props-v1/ (player features, the two
 * position files, the review list, the player-game import) and writes proposals under data/nba/props-v1/position-proposals/.
 * It APPLIES NOTHING: no position file changes. A reviewer copies a proposal into `primary` with a reason in the CSV and
 * runs scripts/nba-hoopr-import.ts --overrides-csv=... The data is ESPN-derived and private; the console prints counts only.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inside, writeAtomically } from "../src/lib/nba/props/pipeline/boardBuildRun";
import { parsePlayerGameImport } from "../src/lib/nba/props/v1/playerGameImport";
import { combinePlayers, GROUPS, propose, trainGroup, type Group, type GroupModel, type LabelledPlayer, type PlayerSeasonFeatures, type Proposal } from "../src/lib/nba/props/v1/positionProposals";
import { coverageIfAccepted, proposalsCsv, withinEspnListing, type ProposalRow } from "../src/lib/nba/props/v1/positionProposalReport";
import type { ReviewEntry } from "../src/lib/nba/props/v1/positionReview";
import type { DvpPosition } from "../src/lib/nba/props/dvpPositions";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join("data", "nba");
const IN = path.join(DATA, "props-v1");
const OUT = path.join(IN, "position-proposals");
const arg = (name: string): string | undefined => process.argv.slice(2).find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const readJson = (name: string): unknown => JSON.parse(readFileSync(inside(root, path.join(IN, name), [DATA], name), "utf8"));
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

interface PositionsFile {
  season: string;
  players: Array<{ playerId: string; primary: DvpPosition; note?: string }>;
  overrides?: Array<{ playerId: string }>;
}

/** Clean labels: a single career-level Wikidata position, with no override and no ESPN tie-break. */
function cleanLabels(files: readonly PositionsFile[]): LabelledPlayer[] {
  const labels = new Map<string, DvpPosition>();
  for (const file of files) {
    const overridden = new Set((file.overrides ?? []).map((o) => o.playerId));
    for (const p of file.players) if (/^Wikidata Q\d+$/.test(p.note ?? "") && !overridden.has(p.playerId)) labels.set(p.playerId, p.primary);
  }
  return [...labels].map(([playerId, primary]) => ({ playerId, primary }));
}

function main(): void {
  const top = Number(arg("top") ?? 50);
  if (!Number.isInteger(top) || top < 1 || top > 500) throw new Error("--top must be a whole number from 1 to 500");
  const features = (readJson("player-features.json") as { players: PlayerSeasonFeatures[] }).players;
  const positionFiles = ["positions-2025-26.json", "positions-2026-27.json"].map((f) => readJson(f) as PositionsFile);
  const review = readJson("position-review-list.json") as { entries: ReviewEntry[] };
  const imported = parsePlayerGameImport(readJson("player-games.json"));

  const players = combinePlayers(features);
  const labels = cleanLabels(positionFiles);
  const models: Partial<Record<Group, GroupModel>> = {};
  for (const group of Object.keys(GROUPS) as Group[]) {
    const trained = trainGroup(group, players, labels);
    if (trained) models[group] = trained;
  }

  const entries = [...review.entries].sort((a, b) => Object.values(b.minutes).reduce((x, y) => x + y, 0) - Object.values(a.minutes).reduce((x, y) => x + y, 0)).slice(0, top);
  const rows: ProposalRow[] = entries.map((entry, i) => {
    const player = players.get(entry.playerId);
    const raw: Proposal = player ? propose(player, models) : { playerId: entry.playerId, name: entry.name, team: entry.team, minutes: 0, espnGroup: null, best: null, probability: null, status: "unassigned", confidence: null, evidence: "no box-score features for this player" };
    return { rank: i + 1, entry, proposal: withinEspnListing(raw, entry.allowedByEspn) };
  });

  const known = new Map(positionFiles.map((f) => [f.season, new Set(f.players.map((p) => p.playerId))]));
  const proposed = new Set(rows.filter((r) => r.proposal.status === "proposed").map((r) => r.entry.playerId));
  const high = new Set(rows.filter((r) => r.proposal.confidence === "high").map((r) => r.entry.playerId));
  const guesses = new Set(rows.filter((r) => r.proposal.best !== null).map((r) => r.entry.playerId));
  const minutesRows = imported.rows.map((r) => ({ season: r.season, seasonType: r.seasonType, playerId: r.playerId, minutes: r.minutes }));
  const coverage = {
    positions: coverageIfAccepted(minutesRows, known, high, proposed, guesses, (r) => r.seasonType !== "preseason"),
    dvpRegularSeason: coverageIfAccepted(minutesRows, known, high, proposed, guesses, (r) => r.seasonType === "regular"),
  };

  const report = {
    schemaVersion: "jkb-position-proposals-v1",
    private: "hoopR/ESPN-derived; private research only; never commit or publish. NOTHING IS APPLIED.",
    method: "per-group ridge logistic regression on per-36 box-score rates, trained on clean single Wikidata labels, restricted to the classes ESPN's G/F listing allows; assigned only at a threshold validated by 10-fold out-of-fold precision",
    labelled: labels.length,
    validation: Object.fromEntries(Object.entries(models).map(([g, m]) => [g, m.validation])),
    coverage,
    proposals: rows.map(({ rank, entry, proposal }) => ({ rank, onSlate: entry.onSlate, ...proposal })),
  };
  mkdirSync(inside(root, OUT, [DATA], "the proposals directory"), { recursive: true });
  writeAtomically(inside(root, path.join(OUT, "position-proposals.json"), [DATA], "the proposals report"), `${JSON.stringify(report, null, 2)}\n`);
  writeAtomically(inside(root, path.join(OUT, "position-proposals.csv"), [DATA], "the proposals CSV"), proposalsCsv(rows));

  console.log(`Labelled players available: ${labels.length}`);
  for (const [group, m] of Object.entries(models)) {
    const v = m.validation;
    console.log(`  ${group} (${v.classes.join(" vs ")}): ${v.trained} trained ${JSON.stringify(v.classCounts)}, out-of-fold accuracy ${pct(v.outOfFoldAccuracy)}, ${v.thresholds.map((t) => `>=${t.threshold}: n ${t.n} precision ${t.precision === null ? "n/a" : pct(t.precision)}`).join("; ")}; assign threshold ${v.assignThreshold ?? "none"}, high ${v.highThreshold ?? "none"}`);
  }
  console.log(`Top ${rows.length}: ${proposed.size} proposed (${high.size} high confidence), ${rows.length - proposed.size} left unassigned`);
  for (const [name, byseason] of Object.entries(coverage)) for (const [season, c] of Object.entries(byseason)) console.log(`  ${name} ${season}: ${pct(c.current.coverage)} now -> ${pct(c.withHighConfidence.coverage)} high only -> ${pct(c.withProposed.coverage)} with all proposed -> ${pct(c.withEveryBestGuess.coverage)} if every best guess were accepted`);
  console.log(`Proposals -> ${path.join(OUT, "position-proposals.csv")} (nothing applied)`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof SyntaxError ? "a data file is not valid JSON" : error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
