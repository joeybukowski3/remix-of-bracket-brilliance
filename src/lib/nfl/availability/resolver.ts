/** Offline, point-in-time NFL availability policy. No projection arithmetic lives here. */
export const AVAILABILITY_SCHEMA_VERSION = "nfl-player-availability-v1";
export const AVAILABILITY_POLICY_VERSION = "nfl-availability-resolution-v1";

export type Position = "QB" | "RB" | "WR" | "TE";
export type FactKind = "roster" | "depth" | "role" | "game_status" | "practice" | "inactive";
export type Evidence = {
  id: string;
  kind: FactKind;
  source: "official_team" | "official_nfl" | "nflverse_injury" | "nflverse_roster" | "espn_depth" | "historical_usage";
  url: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  season: number;
  week: number;
  gameId: string;
  playerId: string;
  team: string;
  value: string;
  detail: string;
};
export type Player = {
  season: number; week: number; gameId: string; kickoff: string;
  playerId: string | null; playerName: string; team: string; opponent: string; position: Position;
  competingPlayerIds?: string[];
};
export type AvailabilityRecord = Player & {
  schemaVersion: typeof AVAILABILITY_SCHEMA_VERSION;
  policyVersion: typeof AVAILABILITY_POLICY_VERSION;
  predictionCutoff: string;
  role: "confirmed_starter" | "projected_starter" | "backup_rotation" | "unknown";
  depthRank: number | null;
  depthSlot: string | null;
  gameStatus: "out" | "doubtful" | "questionable" | "not_listed" | "unknown";
  practice: "DNP" | "LIMITED" | "FULL" | "unknown";
  availability: "out" | "inactive" | "conditional" | "unknown";
  lineupEligibility: "excluded" | "conditional" | "unknown";
  confidence: "high" | "medium" | "low";
  conflict: boolean;
  reasons: string[];
  usedEvidenceIds: string[];
  rejectedEvidence: { id: string; reason: string }[];
  sourceEvidence: Evidence[];
};

const rank: Record<Evidence["source"], number> = {
  official_team: 5, official_nfl: 5, nflverse_injury: 4,
  nflverse_roster: 3, espn_depth: 2, historical_usage: 1,
};
function timestamp(value: string | null): number | null {
  if (!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
function best(rows: Evidence[]): Evidence | undefined {
  return [...rows].sort((a, b) => rank[b.source] - rank[a.source]
    || (timestamp(b.publishedAt) ?? 0) - (timestamp(a.publishedAt) ?? 0)
    || a.id.localeCompare(b.id))[0];
}
function pick(rows: Evidence[], kind: FactKind, allowed: string[]): Evidence | undefined {
  return best(rows.filter((row) => row.kind === kind && allowed.includes(row.value)));
}

export function resolveAvailability(player: Player, evidence: readonly Evidence[], cutoff: string): AvailabilityRecord {
  const cut = timestamp(cutoff), kick = timestamp(player.kickoff);
  if (cut == null || kick == null || cut >= kick || !Number.isInteger(player.season) || !Number.isInteger(player.week)) {
    throw new Error("A valid pre-kickoff prediction cutoff is required.");
  }
  const rejectedEvidence: AvailabilityRecord["rejectedEvidence"] = [];
  const valid: Evidence[] = [];
  const identityOk = player.playerId != null && /^gsis:00-\d+$/.test(player.playerId);
  for (const row of evidence) {
    const published = timestamp(row.publishedAt), retrieved = timestamp(row.retrievedAt);
    const reason = !identityOk ? "unresolved-player-id"
      : row.playerId !== player.playerId || row.gameId !== player.gameId || row.season !== player.season || row.week !== player.week || row.team !== player.team ? "identity-or-game-mismatch"
      : (row.kind === "game_status" && !["official_team", "official_nfl", "nflverse_injury"].includes(row.source)
        || row.kind === "inactive" && !["official_team", "official_nfl"].includes(row.source)
        || row.kind === "role" && row.value === "confirmed_starter" && !["official_team", "official_nfl"].includes(row.source))
        ? "source-not-authoritative-for-fact"
      : retrieved == null || (row.publishedAt !== null && (published == null || published > retrieved)) ? "invalid-or-unverified-timestamps"
      : (published != null && published > cut) || retrieved > cut ? "after-prediction-cutoff"
      : row.source === "espn_depth" && cut - (published ?? retrieved) > 48 * 3_600_000 ? "stale-depth-chart" : null;
    if (reason) rejectedEvidence.push({ id: row.id, reason }); else valid.push(row);
  }
  const reasons: string[] = [];
  const used = new Set<string>();
  const markUsed = (row: Evidence | undefined) => { if (row) used.add(row.id); return row; };
  const inactive = markUsed(pick(valid, "inactive", ["inactive"]));
  const statusEvidence = markUsed(best(valid.filter((row) => row.kind === "game_status")));
  const gameStatus = statusEvidence?.value === "out" || statusEvidence?.value === "doubtful" || statusEvidence?.value === "questionable" || statusEvidence?.value === "not_listed" ? statusEvidence.value : "unknown";
  const practiceEvidence = markUsed(best(valid.filter((row) => row.kind === "practice")));
  const practice = practiceEvidence?.value === "DNP" || practiceEvidence?.value === "LIMITED" || practiceEvidence?.value === "FULL" ? practiceEvidence.value : "unknown";
  const roleEvidence = markUsed(best(valid.filter((row) => row.kind === "role")));
  const depthEvidence = markUsed(best(valid.filter((row) => row.kind === "depth")));
  const depthRank = depthEvidence && /^\d+$/.test(depthEvidence.value) ? Number(depthEvidence.value) : null;
  const depthSlot = depthEvidence?.detail || null;
  let role: AvailabilityRecord["role"] = "unknown";
  if (roleEvidence?.value === "confirmed_starter" || roleEvidence?.value === "backup_rotation") role = roleEvidence.value;
  else if (roleEvidence?.value === "projected_starter") role = "projected_starter";
  else if (player.position === "QB" && depthRank === 1) role = "projected_starter";
  else if (depthRank != null) role = "backup_rotation";
  // A current official role statement wins even when a later ESPN depth chart disagrees.
  const roleConflict = !!(roleEvidence && depthRank != null && player.position === "QB"
    && ((roleEvidence.value === "confirmed_starter" && depthRank !== 1) || (roleEvidence.value === "backup_rotation" && depthRank === 1)));
  if (roleConflict) reasons.push("lower-priority-depth-conflicts-with-role");
  const statusConflict = !!(statusEvidence && valid.some((row) => row.kind === "game_status" && row.id !== statusEvidence.id && row.value !== statusEvidence.value));
  if (statusConflict) reasons.push("conflicting-game-status-evidence");
  let availability: AvailabilityRecord["availability"] = "unknown";
  if (inactive) { availability = "inactive"; reasons.push("official-inactive"); }
  else if (gameStatus === "out") { availability = "out"; reasons.push("official-out"); }
  else if (gameStatus === "questionable" || gameStatus === "doubtful") { availability = "conditional"; reasons.push(gameStatus); }
  else reasons.push(gameStatus === "not_listed" ? "not-listed-is-not-confirmed-healthy" : "no-verified-game-status");
  if (!identityOk) reasons.push("unresolved-player-id");
  if (!roleEvidence && !depthEvidence) reasons.push("no-verified-role");
  const conflict = roleConflict || statusConflict;
  const lineupEligibility = !identityOk ? "unknown" : availability === "out" || availability === "inactive" ? "excluded" : availability === "conditional" ? "conditional" : "unknown";
  const confidence = !identityOk || conflict ? "low" : (inactive || statusEvidence?.source === "official_team" || statusEvidence?.source === "official_nfl" || roleEvidence?.source === "official_team") ? "high" : valid.length ? "medium" : "low";
  return { ...player, schemaVersion: AVAILABILITY_SCHEMA_VERSION, policyVersion: AVAILABILITY_POLICY_VERSION,
    predictionCutoff: cutoff, role, depthRank, depthSlot, gameStatus, practice, availability,
    lineupEligibility, confidence, conflict, reasons, usedEvidenceIds: [...used].sort(),
    rejectedEvidence: rejectedEvidence.sort((a, b) => a.id.localeCompare(b.id)),
    sourceEvidence: [...valid].sort((a, b) => a.id.localeCompare(b.id)) };
}

export function resolveSnapshot(players: readonly Player[], evidence: readonly Evidence[], cutoff: string): AvailabilityRecord[] {
  const keys = new Set<string>();
  return [...players].sort((a, b) => `${a.gameId}:${a.playerId}`.localeCompare(`${b.gameId}:${b.playerId}`)).map((player) => {
    const key = `${player.gameId}:${player.playerId}`;
    if (player.playerId && keys.has(key)) throw new Error(`Duplicate player-game: ${key}`);
    keys.add(key);
    return resolveAvailability(player, evidence, cutoff);
  });
}
