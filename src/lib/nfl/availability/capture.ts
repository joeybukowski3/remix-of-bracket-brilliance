import { resolveAvailability, type AvailabilityRecord, type Evidence, type Player } from "./resolver.ts";

export const CAPTURE_VERSION = "nfl-official-availability-capture-v1";
type Observation = Omit<Evidence, "detail"> & { playerName: string; position: string; attribution: string; publicationDisplay: string | null };
export type OfficialCapture = {
  schemaVersion: typeof CAPTURE_VERSION;
  season: number; week: number; capturedAt: string; captureMethod: string;
  coverage: { scope: "partial" | "complete"; gameStatus: string; inactives: string; starterAnnouncements: string };
  observations: Observation[];
};

const iso = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));
const allowed: Record<string, readonly string[]> = {
  game_status: ["out", "doubtful", "questionable", "not_listed"],
  inactive: ["inactive"],
  role: ["confirmed_starter", "backup_rotation"],
};
function officialUrlOk(url: unknown, source: string): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return false;
    return source !== "official_nfl" || /(?:^|\.)nfl\.com$/.test(parsed.hostname);
  } catch { return false; }
}

/** Validate the small, manually checked fact ledger before any publication path. */
export function validateOfficialCapture(raw: unknown, season: number, week: number, cutoff: string, allowStale = false): OfficialCapture {
  if (!raw || typeof raw !== "object" || !iso(cutoff)) throw new Error("Invalid availability capture or cutoff.");
  const capture = raw as OfficialCapture;
  if (capture.schemaVersion !== CAPTURE_VERSION || capture.season !== season || capture.week !== week || !iso(capture.capturedAt)
    || typeof capture.captureMethod !== "string" || capture.captureMethod.length === 0
    || Date.parse(capture.capturedAt) > Date.parse(cutoff) || !Array.isArray(capture.observations)
    || !capture.coverage || !["partial", "complete"].includes(capture.coverage.scope)
    || ![capture.coverage.gameStatus, capture.coverage.inactives, capture.coverage.starterAnnouncements].every((v) => typeof v === "string" && v.length > 0)) {
    throw new Error("Malformed, mismatched, or post-cutoff availability capture.");
  }
  if (!allowStale && Date.parse(cutoff) - Date.parse(capture.capturedAt) > 72 * 3_600_000) {
    throw new Error("Official availability capture is older than 72 hours; refresh before publication.");
  }
  const ids = new Set<string>();
  const facts = new Map<string, string>();
  const starterByTeamGame = new Map<string, string>();
  for (const row of capture.observations) {
    if (!row.id || ids.has(row.id) || !["official_team", "official_nfl"].includes(row.source)
      || !officialUrlOk(row.url, row.source)
      || row.season !== season || row.week !== week || !/^20\d\d_\d\d_[A-Z]+_[A-Z]+$/.test(row.gameId)
      || !/^gsis:00-\d+$/.test(row.playerId) || !/^[a-z]{2,3}$/.test(row.team)
      || !row.playerName || !["QB", "RB", "WR", "TE"].includes(row.position)
      || !allowed[row.kind]?.includes(row.value) || !iso(row.retrievedAt)
      || Date.parse(row.retrievedAt) > Date.parse(cutoff) || Date.parse(row.retrievedAt) > Date.parse(capture.capturedAt)
      || (row.publishedAt !== null && (!iso(row.publishedAt) || Date.parse(row.publishedAt) > Date.parse(row.retrievedAt)))
      || !row.attribution || !(row.publicationDisplay === null || typeof row.publicationDisplay === "string")) throw new Error(`Malformed official availability observation: ${row.id ?? "unknown"}`);
    ids.add(row.id);
    const key = `${row.gameId}|${row.team}|${row.playerId}|${row.kind}`;
    const prior = facts.get(key);
    if (prior && prior !== row.value) throw new Error(`Contradictory official availability observations: ${key}`);
    facts.set(key, row.value);
    if (row.kind === "role" && row.value === "confirmed_starter" && row.position === "QB") {
      const teamGame = `${row.gameId}|${row.team}`;
      const previousStarter = starterByTeamGame.get(teamGame);
      if (previousStarter && previousStarter !== row.playerId) throw new Error(`Contradictory official QB starters: ${teamGame}`);
      starterByTeamGame.set(teamGame, row.playerId);
    }
  }
  for (const [key, value] of facts) {
    if (!key.endsWith("|role") || value !== "confirmed_starter") continue;
    const prefix = key.slice(0, -"role".length);
    if (facts.get(`${prefix}game_status`) === "out" || facts.get(`${prefix}inactive`) === "inactive") {
      throw new Error(`Contradictory official starter and exclusion: ${prefix}`);
    }
  }
  return capture;
}

export function resolveOfficialCapture(capture: OfficialCapture, players: readonly Player[], cutoff: string): AvailabilityRecord[] {
  const valid = validateOfficialCapture(capture, capture.season, capture.week, cutoff);
  const byId = new Map(players.map((player) => [`${player.gameId}|${player.team}|${player.playerId}`, player]));
  for (const row of valid.observations) {
    const player = byId.get(`${row.gameId}|${row.team}|${row.playerId}`);
    if (!player || player.playerName !== row.playerName || player.position !== row.position) {
      throw new Error(`Official availability identity not found on current roster: ${row.id}`);
    }
  }
  const evidence = valid.observations.map((row) => ({
    id: row.id, kind: row.kind, source: row.source, url: row.url, publishedAt: row.publishedAt,
    retrievedAt: row.retrievedAt, season: row.season, week: row.week, gameId: row.gameId,
    playerId: row.playerId, team: row.team, value: row.value, detail: row.attribution,
  }));
  return [...players].sort((a, b) => `${a.gameId}|${a.playerId}`.localeCompare(`${b.gameId}|${b.playerId}`)).map((player) => {
    const beforeKickoff = new Date(Date.parse(player.kickoff) - 1).toISOString();
    return resolveAvailability(player, evidence, Date.parse(cutoff) < Date.parse(player.kickoff) ? cutoff : beforeKickoff);
  });
}
