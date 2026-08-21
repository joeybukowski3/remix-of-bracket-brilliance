import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { normalizeNflTeamAbbr } from "./identity";

export type ProductionProjectionIdentity = {
  sourceId: string;
  playerName: string;
  position: FantasyPosition;
  team: string | null;
};

export type ProductionIdentitySourceRow = {
  gsisId: string | null;
  pfrId: string | null;
  playerName: string;
  position: string;
  team?: string | null;
  status?: string | null;
};

export type ProductionIdentityCandidate = {
  gsisId: string | null;
  pfrId: string | null;
  playerName: string;
  position: string;
  team: string | null;
  status: string | null;
};

export type ProductionIdentityResolution = {
  resolved: boolean;
  gsisId: string | null;
  roster: ProductionIdentitySourceRow | null;
  player: ProductionIdentitySourceRow | null;
  strategy: "direct-pfr" | "exact-name-position" | "audited-alias" | "unresolved";
  failureReason: string | null;
  attemptedGsisIds: string[];
  rosterCandidates: ProductionIdentityCandidate[];
  directPfrConflict: boolean;
  teamChanged: boolean;
};

/** Conservative normalization only: case/punctuation and common suffixes. No similarity matching. */
export function normalizeProductionPlayerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(jr|sr|ii|iii|iv)$/, "");
}

const AUDITED_PROJECTION_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "WalkKe01|kenwalker|RB": "kennethwalker",
  "GainKe00|kennygainwell|RB": "kennethgainwell",
  "PalmJo01|joshuapalmer|WR": "joshpalmer",
  "BrowMa05|hollywoodbrown|WR": "marquisebrown",
  "TinsMi00|mitchtinsley|WR": "mitchelltinsley",
  "HibnMa00|matthibner|TE": "matthewhibner",
});

export function auditedProductionAlias(projection: ProductionProjectionIdentity): string | null {
  return AUDITED_PROJECTION_NAME_ALIASES[`${projection.sourceId}|${normalizeProductionPlayerName(projection.playerName)}|${projection.position}`] ?? null;
}

function sameName(left: string, right: string): boolean {
  return normalizeProductionPlayerName(left) === normalizeProductionPlayerName(right);
}

function samePosition(row: ProductionIdentitySourceRow, position: FantasyPosition): boolean {
  return row.position.trim().toUpperCase() === position;
}

function candidate(row: ProductionIdentitySourceRow): ProductionIdentityCandidate {
  return {
    gsisId: row.gsisId || null,
    pfrId: row.pfrId || null,
    playerName: row.playerName,
    position: row.position,
    team: normalizeNflTeamAbbr(row.team),
    status: row.status || null,
  };
}

function uniqueRows(rows: readonly ProductionIdentitySourceRow[]): ProductionIdentitySourceRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [row.gsisId, row.pfrId, row.playerName, row.position, row.team].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Production identity is established only by an exact valid PFR row or an exact
 * normalized-name + fantasy-position row. Team may confirm an ambiguous exact
 * name, but can never rescue a name or position conflict. GSIS remains canonical.
 */
export function resolveProductionProjectionIdentity(input: {
  projection: ProductionProjectionIdentity;
  rosterRows: readonly ProductionIdentitySourceRow[];
  playerRows: readonly ProductionIdentitySourceRow[];
}): ProductionIdentityResolution {
  const { projection, rosterRows, playerRows } = input;
  const projectionTeam = normalizeNflTeamAbbr(projection.team);
  const aliasName = auditedProductionAlias(projection);
  const matchesName = (row: ProductionIdentitySourceRow) => sameName(row.playerName, projection.playerName) ||
    (aliasName != null && normalizeProductionPlayerName(row.playerName) === aliasName);
  const directRosterRows = rosterRows.filter((row) => row.pfrId === projection.sourceId);
  const directPlayerRows = playerRows.filter((row) => row.pfrId === projection.sourceId);
  const directRoster = directRosterRows.length === 1 && matchesName(directRosterRows[0]) &&
    samePosition(directRosterRows[0], projection.position) ? directRosterRows[0] : null;
  const directPlayer = directPlayerRows.length === 1 && matchesName(directPlayerRows[0]) &&
    samePosition(directPlayerRows[0], projection.position) ? directPlayerRows[0] : null;
  const directPfrConflict = [...directRosterRows, ...directPlayerRows].some((row) =>
    !matchesName(row) || !samePosition(row, projection.position));

  const exactRoster = rosterRows.filter((row) => matchesName(row) && samePosition(row, projection.position));
  const exactPlayers = playerRows.filter((row) => matchesName(row) && samePosition(row, projection.position));
  const sameNameRoster = rosterRows.filter((row) => matchesName(row));
  const rosterCandidates = uniqueRows([...directRosterRows, ...sameNameRoster]).map(candidate);

  let roster: ProductionIdentitySourceRow | null = directRoster;
  let strategy: ProductionIdentityResolution["strategy"] = directRoster ? "direct-pfr" : "unresolved";
  if (!roster && exactRoster.length === 1) {
    roster = exactRoster[0];
    strategy = aliasName ? "audited-alias" : "exact-name-position";
  } else if (!roster && exactRoster.length > 1 && projectionTeam) {
    const sameTeam = exactRoster.filter((row) => normalizeNflTeamAbbr(row.team) === projectionTeam);
    if (sameTeam.length === 1) {
      roster = sameTeam[0];
      strategy = aliasName ? "audited-alias" : "exact-name-position";
    }
  }

  let player: ProductionIdentitySourceRow | null = directPlayer;
  if (!player && exactPlayers.length === 1) player = exactPlayers[0];
  if (!player && roster?.gsisId) {
    const byGsis = playerRows.filter((row) => row.gsisId === roster?.gsisId);
    if (byGsis.length === 1 && matchesName(byGsis[0]) && samePosition(byGsis[0], projection.position)) {
      player = byGsis[0];
    }
  }

  const gsisId = roster?.gsisId || player?.gsisId || null;
  const attemptedGsisIds = [...new Set([...directRosterRows, ...directPlayerRows, ...sameNameRoster, ...exactPlayers]
    .map((row) => row.gsisId).filter((value): value is string => Boolean(value)))].sort();
  let failureReason: string | null = null;
  if (!roster) {
    if (exactRoster.length > 1) failureReason = "multiple exact name-and-position roster candidates; team did not uniquely disambiguate";
    else if (sameNameRoster.some((row) => !samePosition(row, projection.position))) failureReason = "current roster position conflicts with projection position";
    else if (directPfrConflict) failureReason = "projection PFR ID belongs to a different player and no exact current-roster identity is available";
    else failureReason = "no exact current-roster name-and-position candidate";
  } else if (!gsisId) failureReason = "exact current-roster identity has no canonical GSIS crosswalk";

  return {
    resolved: Boolean(roster && gsisId),
    gsisId,
    roster,
    player,
    strategy: roster && gsisId ? strategy : "unresolved",
    failureReason,
    attemptedGsisIds,
    rosterCandidates,
    directPfrConflict,
    teamChanged: Boolean(roster && projectionTeam && normalizeNflTeamAbbr(roster.team) !== projectionTeam),
  };
}
