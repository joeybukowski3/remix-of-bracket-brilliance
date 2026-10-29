/**
 * Inputs for a postgame audit: the immutable pregame snapshot (verified against its sha256 manifest before anything is read)
 * and the final box score for one game. Local files only; no network, provider or credential.
 *
 * Limits, stated plainly: the manifest sits inside the folder it protects, so it detects accidental change, not someone who
 * rewrites both the files and the manifest. Record the manifest's own hash (returned here, printed by the runner) when the
 * snapshot is frozen and pass it back with --manifest-sha256 to pin it.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { canonicalTeamCode } from "../canonical";
import type { FinalBoxRow } from "./postgameAudit";

const MANIFEST = "MANIFEST.sha256";
const AUDIT_ROOT = ["data", "nba", "postgame-audit"];

function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(path.join(dir, prefix)).flatMap((name) => {
    const rel = prefix ? `${prefix}/${name}` : name;
    return lstatSync(path.join(dir, rel)).isDirectory() ? listFiles(dir, rel) : [rel];
  });
}

/**
 * Checks every file in the snapshot against MANIFEST.sha256 (`<sha256> *<relative path>` per line). A changed file, a missing
 * file, a file the manifest does not list, a link instead of a regular file, a duplicate or non-plain path, a missing manifest
 * or a path leaving the folder all refuse the audit.
 */
export function verifyPregameManifest(dir: string): { files: number; manifestSha256: string } {
  const manifestPath = path.join(dir, MANIFEST);
  if (!existsSync(manifestPath)) throw new Error(`the pregame snapshot has no ${MANIFEST}: ${dir}`);
  const manifestText = readFileSync(manifestPath, "utf8");
  const listed = new Map<string, string>();
  for (const line of manifestText.split(/\r?\n/).filter((l) => l.trim() !== "")) {
    const match = /^([0-9a-f]{64}) \*(.+)$/.exec(line);
    if (!match) throw new Error(`${MANIFEST} has a line that is not "<sha256> *<path>": ${line.slice(0, 80)}`);
    const rel = path.posix.normalize(match[2].replace(/\\/g, "/"));
    if (rel === ".." || rel === "." || rel.startsWith("../") || rel.startsWith("/") || path.isAbsolute(rel)) throw new Error(`${MANIFEST} names a path outside the snapshot: ${match[2]}`);
    if (rel.includes(":")) throw new Error(`${MANIFEST} names a path that is not a plain relative file: ${match[2]}`);
    if (listed.has(rel)) throw new Error(`${MANIFEST} lists ${rel} more than once`);
    listed.set(rel, match[1]);
  }
  for (const [rel, hash] of listed) {
    const file = path.join(dir, rel);
    if (!existsSync(file)) throw new Error(`${rel} is listed in ${MANIFEST} but is missing`);
    if (!lstatSync(file).isFile()) throw new Error(`${rel} is not a regular file (a link could point outside the frozen folder)`);
    if (createHash("sha256").update(readFileSync(file)).digest("hex") !== hash) throw new Error(`${rel} has changed since the manifest was written`);
  }
  for (const rel of listFiles(dir)) if (rel !== MANIFEST && !listed.has(rel)) throw new Error(`${rel} is in the snapshot but not in the manifest`);
  return { files: listed.size, manifestSha256: createHash("sha256").update(manifestText).digest("hex") };
}

export interface HooprBoxRow {
  game_id: number | string;
  game_date: string;
  athlete_id: number | string;
  athlete_display_name: string;
  team_abbreviation: string;
  minutes: number | null;
  points: number | null;
  starter: boolean | null;
  did_not_play: boolean | null;
}

/** The rows of one game (`YYYY-MM-DD|AWAY@HOME`, by date and the two teams), with ESPN team codes made canonical. */
export function boxRowsFromHoopr(rows: readonly HooprBoxRow[], gameKey: string): FinalBoxRow[] {
  const match = /^(\d{4}-\d{2}-\d{2})\|([A-Z]{3})@([A-Z]{3})$/.exec(gameKey);
  if (!match) throw new Error(`game key must look like 2026-10-28|DEN@NOP, got "${gameKey}"`);
  const [, date, away, home] = match;
  const picked = rows.filter((r) => r.game_date === date && [away, home].includes(canonicalTeamCode(r.team_abbreviation) ?? ""));
  if (new Set(picked.map((r) => String(r.game_id))).size > 1) throw new Error(`more than one game for ${gameKey} in the box-score file: refusing to pick one`);
  return picked.map((r) => {
    const played = r.did_not_play !== true;
    if (played && (typeof r.points !== "number" || typeof r.minutes !== "number")) throw new Error(`${r.athlete_display_name}: a played box-score row has no ${typeof r.points !== "number" ? "points" : "minutes"}; refusing to score it as zero`);
    return {
      gameKey,
      team: canonicalTeamCode(r.team_abbreviation) as string,
      playerId: String(r.athlete_id),
      playerName: r.athlete_display_name,
      minutes: played ? (r.minutes as number) : 0,
      points: played ? (r.points as number) : 0,
      didNotPlay: !played,
      started: r.starter,
    };
  });
}

/** The deepest existing ancestor's real path plus the not-yet-created rest, so a link anywhere on the way is followed. */
function realish(target: string): string {
  const resolved = path.resolve(target);
  let existing = resolved;
  const rest: string[] = [];
  while (!existsSync(existing) && path.dirname(existing) !== existing) {
    rest.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  return path.join(realpathSync.native(existing), ...rest);
}

const inside = (parent: string, child: string): boolean => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** The report goes under data/nba/postgame-audit (gitignored, private), never into the pregame snapshot it reads or another ledger. Links are followed. */
export function assertOutputOutsidePregame(outDir: string, pregameDir: string, root: string): void {
  const out = realish(outDir);
  if (inside(realish(pregameDir), out)) throw new Error(`the output folder may not be the pregame snapshot or inside it: ${path.resolve(outDir)}`);
  if (!inside(realish(path.join(path.resolve(root), ...AUDIT_ROOT)), out)) throw new Error(`the output folder must be under data/nba/postgame-audit (private, gitignored): ${path.resolve(outDir)}`);
}
