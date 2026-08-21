export type FantasyAvailabilityStatus =
  | "active"
  | "questionable"
  | "doubtful"
  | "out"
  | "reserve"
  | "unknown";

export type FantasyPracticeStatus = "DID_NOT_PARTICIPATE" | "LIMITED" | "FULL" | null;

export type FantasyAvailability = {
  status: FantasyAvailabilityStatus;
  practiceStatus: FantasyPracticeStatus;
  sourceSeason: number | null;
  sourceWeek: number | null;
  sourceAsOf: string | null;
  isStale: boolean;
  staleReasons: string[];
};

const GAME_STATUS: Readonly<Record<string, FantasyAvailabilityStatus>> = {
  OUT: "out",
  DOUBTFUL: "doubtful",
  QUESTIONABLE: "questionable",
};

const PRACTICE_STATUSES = new Set<Exclude<FantasyPracticeStatus, null>>([
  "DID_NOT_PARTICIPATE", "LIMITED", "FULL",
]);

export function normalizeFantasyAvailability(source: {
  gameStatus?: string | null;
  reserveStatus?: string | null;
  rosterStatus?: string | null;
  practiceStatus?: string | null;
  sourceSeason?: number | null;
  sourceWeek?: number | null;
  sourceAsOf?: string | null;
}, target: { season: number; week: number; generatedAt?: string | null }): FantasyAvailability {
  const gameStatus = String(source.gameStatus ?? "").trim().toUpperCase();
  const reserveStatus = String(source.reserveStatus ?? "").trim().toUpperCase();
  const rosterStatus = String(source.rosterStatus ?? "").trim().toUpperCase();
  const rawPractice = String(source.practiceStatus ?? "").trim().toUpperCase();
  if (rawPractice && !PRACTICE_STATUSES.has(rawPractice as Exclude<FantasyPracticeStatus, null>)) {
    throw new Error(`Unknown practice status "${source.practiceStatus}".`);
  }

  let status: FantasyAvailabilityStatus = "unknown";
  if (GAME_STATUS[gameStatus]) status = GAME_STATUS[gameStatus];
  else if (reserveStatus === "RESERVE" || rosterStatus === "RES" || rosterStatus === "RET") status = "reserve";
  else if (rosterStatus === "ACT") status = "active";

  const sourceSeason = source.sourceSeason ?? null;
  const sourceWeek = source.sourceWeek ?? null;
  const sourceAsOf = source.sourceAsOf ?? null;
  const staleReasons: string[] = [];
  if (sourceSeason == null || sourceSeason !== target.season) staleReasons.push("source-season-mismatch");
  if (sourceWeek == null || sourceWeek !== target.week) staleReasons.push("source-week-mismatch");
  if (sourceAsOf && Number.isNaN(Date.parse(sourceAsOf))) throw new Error("sourceAsOf must be an ISO date.");
  if (target.generatedAt && sourceAsOf && Date.parse(sourceAsOf) > Date.parse(target.generatedAt)) {
    throw new Error("Availability sourceAsOf cannot be later than generatedAt.");
  }

  return {
    status,
    practiceStatus: rawPractice ? rawPractice as Exclude<FantasyPracticeStatus, null> : null,
    sourceSeason,
    sourceWeek,
    sourceAsOf,
    isStale: staleReasons.length > 0,
    staleReasons,
  };
}
