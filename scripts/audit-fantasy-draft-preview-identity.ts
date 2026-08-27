/**
 * Phase 2C identity audit: classifies every Sleeper Draft Preview source row
 * against the canonical nflverse current-season roster snapshot
 * (`data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv`).
 *
 * Read-only. Writes a deterministic markdown report to
 * `docs/fantasy-draft-preview-identity-audit-2026.md`. Never rewrites the
 * Sleeper source artifact and never edits any correction table itself --
 * the correction table (`src/lib/fantasy/draftPreview/identityCorrections.ts`)
 * is a small, hand-reviewed literal list authored by reading this report,
 * exactly like the existing `SLEEPER_NAME_ALIASES` pattern. No fuzzy
 * matching: identity is resolved by exact normalized full-name match only.
 *
 * Run with `npx tsx scripts/audit-fantasy-draft-preview-identity.ts`.
 */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SLEEPER_DRAFT_BOARD_2026 } from "../src/lib/fantasy/draftPreview/sleeperDraftBoard.ts";
import { normalizeNflTeamAbbr } from "../src/lib/nfl/identity/identity.ts";
import { SLEEPER_NAME_ALIASES } from "../src/lib/fantasy/draftPreview/identity.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROSTER_PATH = join(ROOT, "data", "nfl", "nflverse", "weekly-rosters", "roster_weekly_2026.csv");
const REPORT_PATH = join(ROOT, "docs", "fantasy-draft-preview-identity-audit-2026.md");
const CORRECTIONS_PATH = join(ROOT, "data", "fantasy", "draft-preview", "2026-identity-corrections.json");
const PRESENTATION_PATH = join(ROOT, "data", "fantasy", "draft-preview", "2026-presentation-suppression.json");

type RosterRow = { team: string; gsisId: string; fullName: string; position: string };

/**
 * Name-only view of the already-reviewed Sleeper->JKB alias table
 * (`SLEEPER_NAME_ALIASES`), stripped of its position prefix -- this audit
 * joins against the nflverse roster, not the JKB board, so position scoping
 * doesn't apply here. Same underlying reviewed fact (Sleeper drops a Jr./III
 * suffix JKB and nflverse both keep), reused rather than re-derived.
 */
const SLEEPER_TO_NFLVERSE_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SLEEPER_NAME_ALIASES).map(([key, value]) => [key.split(":")[1], value]),
);

/**
 * Additional reviewed Sleeper -> nflverse full-name suffix corrections found
 * by this audit (2026-08-27). Each was verified by an exact match against
 * exactly one `roster_weekly_2026.csv` candidate before being added here --
 * not a fuzzy/similarity match, a literal reviewed alias, same pattern as
 * `SLEEPER_NAME_ALIASES`.
 */
const AUDIT_REVIEWED_NAME_ALIASES: Readonly<Record<string, string>> = {
  kennethwalker: "Kenneth Walker III",
  lutherburden: "Luther Burden III",
  chrisgodwin: "Chris Godwin Jr.",
  chrisrodriguez: "Chris Rodriguez Jr.",
  tyronetracy: "Tyrone Tracy Jr.",
  "omarcooperjr": "Omar Cooper",
  marvinmims: "Marvin Mims Jr.",
  michaelpenix: "Michael Penix Jr.",
  "dontethorntonjr": "Dont'e Thornton Jr.", // Sleeper source already carries the suffix; normalization just needs the exact nflverse spelling.
};

/** Sleeper source rows confirmed malformed (not a real player row) by manual review -- keyed by Sleeper Rank. */
const KNOWN_MALFORMED_ROWS: ReadonlyMap<number, string> = new Map([
  [256, 'Player name is "Denver Broncos" (an NFL team, not a person) with a fabricated WR-shaped stat line under POS "TE" -- source-data row corruption, not a real draftable player.'],
]);

/** Same normalization shape as `normalizedFantasyPlayerKey`, minus the position prefix (position itself is under audit here). */
function normalizeName(name: string): string {
  // NFKD decomposes accented letters into base letter + combining mark; the
  // final [^a-z0-9] strip below removes the combining marks along with every
  // other non-alphanumeric character, so no separate diacritic-strip step is needed.
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCsvLine(line: string): string[] {
  return line.split(",");
}

function loadRoster(): readonly RosterRow[] {
  const raw = readFileSync(ROSTER_PATH, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  const header = parseCsvLine(lines[0]);
  const teamIdx = header.indexOf("team");
  const gsisIdx = header.indexOf("gsis_id");
  const nameIdx = header.indexOf("full_name");
  const posIdx = header.indexOf("position");
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return { team: cells[teamIdx], gsisId: cells[gsisIdx], fullName: cells[nameIdx], position: cells[posIdx] };
  });
}

type Classification = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "N/A";

type AuditRow = {
  sleeperRank: number;
  player: string;
  sourceTeam: string | null;
  sourcePosition: string;
  canonicalTeam: string | null;
  canonicalPosition: string | null;
  classification: Classification;
  reason: string;
};

function classifyRow(
  sleeperRow: (typeof SLEEPER_DRAFT_BOARD_2026)[number],
  rosterIndex: ReadonlyMap<string, RosterRow[]>,
  duplicateNameKeys: ReadonlySet<string>,
): AuditRow {
  const { sleeperRank, player, team: sourceTeam, sourcePosition } = sleeperRow;

  const malformedReason = KNOWN_MALFORMED_ROWS.get(sleeperRank);
  if (malformedReason) {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: null,
      canonicalPosition: null,
      classification: "F",
      reason: malformedReason,
    };
  }

  // DEF rows are team defenses, not individuals -- out of scope for a player identity join.
  if (sourcePosition === "DEF") {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: null,
      canonicalPosition: null,
      classification: "N/A",
      reason: "Team defense row (DEF) -- not an individual player identity.",
    };
  }

  const rawKey = normalizeName(player);
  // Alias is only a fallback: the nflverse roster snapshot is NOT
  // consistently long-form (e.g. it already carries "Chig Okonkwo" verbatim
  // for one player but needs the alias for another), so a raw match that
  // already succeeds must win over an alias built for a different case.
  const rawCandidates = rosterIndex.get(rawKey) ?? [];
  const aliasedName = SLEEPER_TO_NFLVERSE_ALIASES[rawKey] ?? AUDIT_REVIEWED_NAME_ALIASES[rawKey];
  const key = rawCandidates.length === 0 && aliasedName ? normalizeName(aliasedName) : rawKey;
  const candidates = rawCandidates.length > 0 ? rawCandidates : rosterIndex.get(key) ?? [];
  const isDuplicateSourceRow = duplicateNameKeys.has(rawKey);

  if (candidates.length === 0) {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: null,
      canonicalPosition: null,
      classification: isDuplicateSourceRow ? "E" : "G",
      reason: isDuplicateSourceRow
        ? "Duplicate Sleeper source row for the same normalized player name; no canonical roster match either."
        : "No exact normalized-name match in the 2026 nflverse roster snapshot.",
    };
  }

  let resolved = candidates.length === 1 ? candidates[0] : null;
  if (!resolved && candidates.length > 1) {
    // Exact-evidence disambiguation only: if source team matches exactly one
    // candidate, that's still literal-field matching, not fuzzy inference.
    const teamMatches = sourceTeam
      ? candidates.filter((c) => normalizeNflTeamAbbr(c.team) === normalizeNflTeamAbbr(sourceTeam))
      : [];
    if (teamMatches.length === 1) resolved = teamMatches[0];
  }
  if (!resolved) {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: null,
      canonicalPosition: null,
      classification: "G",
      reason: `Ambiguous normalized-name match: ${candidates.length} roster candidates (${candidates.map((c) => `${c.fullName}/${c.team}`).join(", ")}).`,
    };
  }

  const canonicalPosition = resolved.position;
  // Team codes compared through the same current<->legacy abbreviation alias
  // table the rest of the repo already uses (ARI/AZ, LAR/LA, WAS/WSH,
  // JAC/JAX) -- a different abbreviation for the SAME franchise is not a
  // stale team.
  const teamMatch = sourceTeam != null && normalizeNflTeamAbbr(sourceTeam) === normalizeNflTeamAbbr(resolved.team);
  const positionMatch = sourcePosition.toUpperCase() === canonicalPosition.toUpperCase();

  if (isDuplicateSourceRow) {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: resolved.team,
      canonicalPosition,
      classification: "E",
      reason: `Duplicate Sleeper source row for the same normalized player name. Canonical: ${resolved.team}/${canonicalPosition}. This row ${teamMatch ? "matches" : "does NOT match"} canonical team and ${positionMatch ? "matches" : "does NOT match"} canonical position.`,
    };
  }

  if (teamMatch && positionMatch) {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: resolved.team,
      canonicalPosition,
      classification: "A",
      reason: "Exact match on identity, team and position.",
    };
  }
  if (!teamMatch && positionMatch) {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: resolved.team,
      canonicalPosition,
      classification: "B",
      reason: `Identity confirmed; source team "${sourceTeam ?? "—"}" stale vs. canonical "${resolved.team}".`,
    };
  }
  if (teamMatch && !positionMatch) {
    return {
      sleeperRank,
      player,
      sourceTeam,
      sourcePosition,
      canonicalTeam: resolved.team,
      canonicalPosition,
      classification: "C",
      reason: `Identity confirmed; source position "${sourcePosition}" stale vs. canonical "${canonicalPosition}".`,
    };
  }
  return {
    sleeperRank,
    player,
    sourceTeam,
    sourcePosition,
    canonicalTeam: resolved.team,
    canonicalPosition,
    classification: "D",
    reason: `Identity confirmed; both source team "${sourceTeam ?? "—"}" and position "${sourcePosition}" conflict with canonical "${resolved.team}"/"${canonicalPosition}".`,
  };
}

function main() {
  const roster = loadRoster();
  const rosterIndex = new Map<string, RosterRow[]>();
  for (const row of roster) {
    const key = normalizeName(row.fullName);
    const bucket = rosterIndex.get(key) ?? [];
    bucket.push(row);
    rosterIndex.set(key, bucket);
  }

  const nameCounts = new Map<string, number>();
  for (const row of SLEEPER_DRAFT_BOARD_2026) {
    if (row.sourcePosition === "DEF") continue;
    const key = normalizeName(row.player);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNameKeys = new Set([...nameCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key));

  const results = SLEEPER_DRAFT_BOARD_2026.map((row) => classifyRow(row, rosterIndex, duplicateNameKeys));

  const counts: Record<Classification, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, "N/A": 0 };
  for (const result of results) counts[result.classification] += 1;

  const corrected = results.filter((r) => r.classification === "B" || r.classification === "C" || r.classification === "D");
  const duplicates = results.filter((r) => r.classification === "E");
  const unresolved = results.filter((r) => r.classification === "G");
  const malformed = results.filter((r) => r.classification === "F");

  // Presentation policy: group duplicate rows by normalized Sleeper name and
  // resolve to ONE canonical identity per group. A group is only ever
  // collapsed when every row in it resolved to the SAME non-null canonical
  // team+position -- if any row in the group couldn't be confidently
  // resolved, nothing is merged/suppressed for that group (fail closed,
  // never guess which duplicate is the "real" one).
  const duplicatesByName = new Map<string, AuditRow[]>();
  for (const row of duplicates) {
    const key = normalizeName(row.player);
    const bucket = duplicatesByName.get(key) ?? [];
    bucket.push(row);
    duplicatesByName.set(key, bucket);
  }
  type DuplicateGroup = {
    canonicalPlayer: string;
    canonicalTeam: string;
    canonicalPosition: string;
    sourceRanks: number[];
    retainedRank: number;
    suppressedRanks: number[];
  };
  const duplicateGroups: DuplicateGroup[] = [];
  for (const rows of duplicatesByName.values()) {
    const allResolved = rows.every((row) => row.canonicalTeam != null && row.canonicalPosition != null);
    const identityConsistent =
      allResolved
      && rows.every((row) => row.canonicalTeam === rows[0].canonicalTeam && row.canonicalPosition === rows[0].canonicalPosition);
    if (!identityConsistent) continue; // fail closed: leave this group's rows un-merged
    const sourceRanks = rows.map((row) => row.sleeperRank).sort((a, b) => a - b);
    const retainedRank = sourceRanks[0];
    duplicateGroups.push({
      canonicalPlayer: rows.find((row) => row.sleeperRank === retainedRank)!.player,
      canonicalTeam: rows[0].canonicalTeam as string,
      canonicalPosition: rows[0].canonicalPosition as string,
      sourceRanks,
      retainedRank,
      suppressedRanks: sourceRanks.filter((rank) => rank !== retainedRank),
    });
  }
  duplicateGroups.sort((a, b) => a.retainedRank - b.retainedRank);

  const lines: string[] = [];
  lines.push("# Fantasy Draft Preview — Sleeper source identity audit (2026)");
  lines.push("");
  lines.push(`Generated by \`scripts/audit-fantasy-draft-preview-identity.ts\` against \`data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv\` (2026 Week 1 snapshot). Deterministic, exact-normalized-name matching only — no fuzzy matching.`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Total Sleeper source rows: ${SLEEPER_DRAFT_BOARD_2026.length}`);
  lines.push(`- A. Exact match (identity + team + position agree): ${counts.A}`);
  lines.push(`- B. Stale team only: ${counts.B}`);
  lines.push(`- C. Stale position only: ${counts.C}`);
  lines.push(`- D. Team + position both conflict: ${counts.D}`);
  lines.push(`- E. Duplicate source row: ${counts.E}`);
  lines.push(`- F. Malformed / impossible row: ${counts.F}`);
  lines.push(`- G. Unresolved (cannot confidently resolve): ${counts.G}`);
  lines.push(`- N/A. Team defense (DEF) rows, out of individual-identity scope: ${counts["N/A"]}`);
  lines.push("");
  lines.push("## Corrected-display rows (B/C/D)");
  lines.push("");
  lines.push("| Sleeper Rank | Player | Source Team | Canonical Team | Source Pos | Canonical Pos | Class | Reason |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const row of corrected) {
    lines.push(
      `| ${row.sleeperRank} | ${row.player} | ${row.sourceTeam ?? "—"} | ${row.canonicalTeam ?? "—"} | ${row.sourcePosition} | ${row.canonicalPosition ?? "—"} | ${row.classification} | ${row.reason} |`,
    );
  }
  lines.push("");
  lines.push("## Duplicate source rows (E)");
  lines.push("");
  for (const row of duplicates) lines.push(`- Sleeper Rank ${row.sleeperRank}: ${row.player} (${row.sourcePosition}/${row.sourceTeam ?? "—"}) — ${row.reason}`);
  lines.push("");
  lines.push("## Duplicate player groups -- presentation policy (confirmed same canonical player only)");
  lines.push("");
  lines.push("One rendered board row per group: the LOWEST Sleeper Rank is retained (with its own Sleeper projections, untouched); every other rank in the group is suppressed from the interactive board but stays in `DRAFT_PREVIEW_ROWS_2026` for provenance.");
  lines.push("");
  lines.push("| Canonical Player | Canonical Team/Pos | Source Ranks | Retained Rank | Suppressed Ranks |");
  lines.push("|---|---|---|---|---|");
  for (const group of duplicateGroups) {
    lines.push(
      `| ${group.canonicalPlayer} | ${group.canonicalTeam}/${group.canonicalPosition} | ${group.sourceRanks.join(", ")} | ${group.retainedRank} | ${group.suppressedRanks.join(", ") || "—"} |`,
    );
  }
  const ungroupedDuplicateNames = [...duplicatesByName.entries()].filter(
    ([, rows]) => !duplicateGroups.some((group) => group.sourceRanks.length === rows.length && group.sourceRanks.every((rank) => rows.some((row) => row.sleeperRank === rank))),
  );
  if (ungroupedDuplicateNames.length > 0) {
    lines.push("");
    lines.push("Duplicate name groups NOT merged (canonical identity could not be confidently resolved for every row -- fail closed, nothing suppressed):");
    for (const [, rows] of ungroupedDuplicateNames) {
      lines.push(`- ${rows[0].player}: ranks ${rows.map((row) => row.sleeperRank).join(", ")}`);
    }
  }
  lines.push("");
  lines.push("## Unresolved rows (G)");
  lines.push("");
  for (const row of unresolved) lines.push(`- Sleeper Rank ${row.sleeperRank}: ${row.player} (${row.sourcePosition}/${row.sourceTeam ?? "—"}) — ${row.reason}`);
  lines.push("");
  lines.push("## Malformed rows (F)");
  lines.push("");
  if (malformed.length === 0) lines.push("None found.");
  for (const row of malformed) lines.push(`- Sleeper Rank ${row.sleeperRank}: ${row.player} — ${row.reason}`);
  lines.push("");

  const report = `${lines.join("\n")}\n`;
  const temporaryPath = `${REPORT_PATH}.tmp`;
  try {
    writeFileSync(temporaryPath, report, "utf8");
    renameSync(temporaryPath, REPORT_PATH);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }

  console.log(`Wrote identity audit report to ${REPORT_PATH}`);
  console.log(JSON.stringify(counts, null, 2));

  // Display-only correction artifact (B/C/D rows): the app overlays these
  // onto the Sleeper board's displayed team/position while keeping the raw
  // Sleeper `team`/`sourcePosition` fields on the row untouched (provenance
  // preserved, never silently rewritten).
  const correctionArtifact = {
    _meta: {
      schemaVersion: "fantasy-draft-preview-identity-corrections-v1",
      source: "data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv",
      generatedBy: "scripts/audit-fantasy-draft-preview-identity.ts",
      rowCount: corrected.length,
    },
    corrections: corrected.map((row) => ({
      sleeperRank: row.sleeperRank,
      player: row.player,
      sourceTeam: row.sourceTeam,
      canonicalTeam: row.canonicalTeam,
      sourcePosition: row.sourcePosition,
      canonicalPosition: row.canonicalPosition,
      classification: row.classification,
      reason: row.reason,
    })),
  };
  const correctionsTemporaryPath = `${CORRECTIONS_PATH}.tmp`;
  try {
    writeFileSync(correctionsTemporaryPath, `${JSON.stringify(correctionArtifact, null, 2)}\n`, "utf8");
    renameSync(correctionsTemporaryPath, CORRECTIONS_PATH);
  } catch (error) {
    if (existsSync(correctionsTemporaryPath)) unlinkSync(correctionsTemporaryPath);
    throw error;
  }
  console.log(`Wrote ${corrected.length} identity corrections to ${CORRECTIONS_PATH}`);

  // Presentation-suppression artifact: which raw Sleeper Ranks must never
  // render as a draftable board row (confirmed duplicate-of-a-lower-rank, or
  // confirmed malformed), plus the canonical team/position the RETAINED rank
  // of each duplicate group should display. Every raw row still exists in
  // the Sleeper source artifact and in `DRAFT_PREVIEW_ROWS_2026` -- this
  // artifact only drives presentation-layer suppression/display, never a
  // rewrite of source data.
  const suppressedDuplicateRanks = duplicateGroups.flatMap((group) => group.suppressedRanks).sort((a, b) => a - b);
  const presentationArtifact = {
    _meta: {
      schemaVersion: "fantasy-draft-preview-presentation-suppression-v1",
      source: "data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv",
      generatedBy: "scripts/audit-fantasy-draft-preview-identity.ts",
      duplicateGroupCount: duplicateGroups.length,
      suppressedDuplicateRankCount: suppressedDuplicateRanks.length,
      malformedRankCount: malformed.length,
    },
    duplicateGroups,
    suppressedDuplicateRanks,
    malformedRanks: malformed.map((row) => ({ sleeperRank: row.sleeperRank, player: row.player, reason: row.reason })),
  };
  const presentationTemporaryPath = `${PRESENTATION_PATH}.tmp`;
  try {
    writeFileSync(presentationTemporaryPath, `${JSON.stringify(presentationArtifact, null, 2)}\n`, "utf8");
    renameSync(presentationTemporaryPath, PRESENTATION_PATH);
  } catch (error) {
    if (existsSync(presentationTemporaryPath)) unlinkSync(presentationTemporaryPath);
    throw error;
  }
  console.log(
    `Wrote ${duplicateGroups.length} duplicate groups (${suppressedDuplicateRanks.length} suppressed ranks) and ${malformed.length} malformed ranks to ${PRESENTATION_PATH}`,
  );
}

main();
