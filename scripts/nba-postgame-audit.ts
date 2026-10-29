/**
 * Postgame audit of one NBA game's points projections against the captured sportsbook lines and the final box score.
 * Offline and read-only toward the pregame data: no network, provider, credential, Odds API request, quota or scheduled job.
 *
 *   npx tsx scripts/nba-postgame-audit.ts --game-key=2026-10-28|DEN@NOP \
 *     --pregame-dir=data/nba/postgame-audit/pregame \
 *     --box=data/nba/postgame-audit/raw/hoopr/player_box_2027.json --box-manifest=data/nba/postgame-audit/raw/hoopr/manifest.json \
 *     [--out-dir=data/nba/postgame-audit/analysis] [--manifest-sha256=<hash recorded when the snapshot was frozen>]
 *
 * The pregame folder is a frozen copy taken before the game (board, slate, model inputs, player-games, odds-captures/ and a
 * MANIFEST.sha256 of every file); the audit verifies it first and refuses any change. It recomputes no projection. Reports are
 * written under data/nba/postgame-audit (gitignored, private: hoopR/ESPN and sportsbook data) and never inside the pregame folder.
 * Protocol and rules: docs/nba-evaluation-protocol.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePlayerName } from "../src/lib/nba/props/pipeline/contracts";
import { readLineCaptures } from "../src/lib/nba/props/pipeline/lineCapture";
import { auditGame } from "../src/lib/nba/props/v1/postgameAudit";
import { assertOutputOutsidePregame, boxRowsFromHoopr, verifyPregameManifest, type HooprBoxRow } from "../src/lib/nba/props/v1/postgameAuditInputs";
import { renderAuditMarkdown } from "../src/lib/nba/props/v1/postgameAuditReport";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string): string | undefined => process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const need = (name: string): string => {
  const value = arg(name);
  if (!value) throw new Error(`--${name}=... is required (see the header of scripts/nba-postgame-audit.ts)`);
  return value;
};
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
const rowsOf = (json: unknown): unknown[] => (Array.isArray(json) ? json : ((json as { rows?: unknown[] }).rows ?? []));

function main(): void {
  const gameKey = need("game-key");
  const pregameDir = path.resolve(root, need("pregame-dir"));
  const outDir = path.resolve(root, arg("out-dir") ?? "data/nba/postgame-audit/analysis");
  assertOutputOutsidePregame(outDir, pregameDir, root);

  const verified = verifyPregameManifest(pregameDir);
  const pinned = arg("manifest-sha256");
  if (pinned !== undefined && pinned.toLowerCase() !== verified.manifestSha256) throw new Error(`MANIFEST.sha256 does not match the pinned hash (${verified.manifestSha256}): the snapshot manifest was rewritten`);
  const board = readJson(path.join(pregameDir, "private-preview-board.json")) as { generatedAtUtc: string; entries: never[] };
  const captures = readLineCaptures(path.join(pregameDir, "odds-captures"));
  const projections = readJson(path.join(pregameDir, "board-inputs", "projections.json")) as { records?: Array<{ inputCutoffUtc?: string }> };
  const cutoffs = (projections.records ?? []).map((r) => r.inputCutoffUtc).filter((c): c is string => typeof c === "string").sort();

  const knownPlayerIds = new Map<string, string[]>();
  for (const r of rowsOf(readJson(path.join(pregameDir, "player-games.json"))) as Array<{ playerId: string; playerName: string }>) {
    const key = normalizePlayerName(r.playerName);
    const ids = knownPlayerIds.get(key) ?? [];
    if (!ids.includes(r.playerId)) knownPlayerIds.set(key, [...ids, r.playerId]);
  }

  const boxManifest = readJson(path.resolve(root, need("box-manifest"))) as { retrievedAtUtc: string; commit: string };
  const box = boxRowsFromHoopr(rowsOf(readJson(path.resolve(root, need("box")))) as HooprBoxRow[], gameKey);

  const report = auditGame({ gameKey, board, captures, box, boxRetrievedAtUtc: boxManifest.retrievedAtUtc, knownPlayerIds, projectionInputCutoffUtc: cutoffs.at(-1) });

  mkdirSync(outDir, { recursive: true });
  const stem = `postgame-${gameKey.replace(/[^A-Za-z0-9@-]+/g, "_")}`;
  writeFileSync(path.join(outDir, `${stem}.json`), `${JSON.stringify({ ...report, provenance: { pregameFilesVerified: verified.files, manifestSha256: verified.manifestSha256, boxSourceCommit: boxManifest.commit } }, null, 2)}\n`);
  writeFileSync(path.join(outDir, `${stem}.md`), renderAuditMarkdown(report));

  const m = report.matched;
  console.log(`Verified ${verified.files} pregame files (manifest sha256 ${verified.manifestSha256}${pinned ? ", pinned" : ", not pinned: record this when freezing"}); no lookahead found. ${gameKey}: final ${JSON.stringify(report.finalScore)}.`);
  if (m) console.log(`  n=${m.n} with a line: JKB MAE ${m.jkbMAE.toFixed(2)} bias ${m.jkbME.toFixed(2)}; line MAE ${m.lineMAE.toFixed(2)} bias ${m.lineME.toFixed(2)}; minutes MAE ${m.minMAE.toFixed(2)} bias ${m.minME.toFixed(2)}; direction ${m.dirHits}/${m.dirN}`);
  console.log(`  ${report.missing.length} projected player(s) outside the scored sample; ${report.warnings.length} warning(s)`);
  for (const w of report.warnings) console.log(`  WARNING: ${w}`);
  console.log(`Wrote ${path.relative(root, path.join(outDir, `${stem}.json`))} and .md (private; do not publish)`);
}

try {
  main();
} catch (error) {
  console.error(`Audit refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
