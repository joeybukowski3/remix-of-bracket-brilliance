/**
 * Internal model-review helpers for the admin NFL power ratings page (PR-9).
 *
 * Everything here is neutral model-quality language. This module must never
 * produce betting recommendations, and it reads only the generated
 * power-ratings/team-stats/results JSON — no market data.
 */

export type RatingComponent = { raw: number; normalized?: number; normalizedInverted?: number; weight: number };

export type PowerRatingRow = {
  teamId: string;
  slug: string;
  abbr: string;
  name: string;
  season: number;
  rating: number;
  rank: number;
  offenseRating: number;
  defenseRating: number;
  scheduleAdjustment: number | null;
  components: Record<string, RatingComponent>;
  modelVersion: string;
  notes: string;
};

export type TeamStatsRow = {
  abbr: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  winPercentage: number | null;
  offensiveEpaPerPlay: number | null;
  defensiveEpaPerPlay: number | null;
  scheduleStrength: number | null;
};

export type ResultRow = { seasonType: string; homeAbbr: string; awayAbbr: string };

export type ReviewFlag = {
  kind:
    | "efficiency-over-record"
    | "record-over-efficiency"
    | "top12-non-playoff"
    | "playoff-outside-top12"
    | "schedule-context"
    | "missing-efficiency-data";
  label: string;
};

export const RECORD_DISAGREEMENT_GAP = 8;
export const SCHEDULE_CONTEXT_HIGH = 85;
export const SCHEDULE_CONTEXT_LOW = 15;

export function formatRecord(stats: TeamStatsRow | undefined): string {
  if (!stats || stats.gamesPlayed === 0) return "—";
  return stats.ties > 0 ? `${stats.wins}-${stats.losses}-${stats.ties}` : `${stats.wins}-${stats.losses}`;
}

/** Rank teams by win% (ties = half win), for record-vs-rating comparison. */
export function computeRecordRanks(teamStats: TeamStatsRow[]): Map<string, number> {
  const played = teamStats.filter((t) => t.gamesPlayed > 0);
  const sorted = [...played].sort(
    (a, b) => (b.winPercentage ?? 0) - (a.winPercentage ?? 0) || a.abbr.localeCompare(b.abbr)
  );
  return new Map(sorted.map((row, index) => [row.abbr, index + 1]));
}

/** Teams that appeared in any postseason game; empty set = no playoff data. */
export function computePlayoffTeams(results: ResultRow[]): Set<string> {
  const playoff = new Set<string>();
  for (const result of results) {
    if (result.seasonType === "REG") continue;
    playoff.add(result.homeAbbr);
    playoff.add(result.awayAbbr);
  }
  return playoff;
}

/**
 * Neutral model-review flags for one rated team. These highlight where the
 * model needs human review — they are not recommendations of any kind.
 */
export function computeReviewFlags(
  row: PowerRatingRow,
  teamStats: TeamStatsRow | undefined,
  recordRanks: Map<string, number>,
  playoffTeams: Set<string>
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const recordRank = recordRanks.get(row.abbr);

  if (recordRank != null && recordRank - row.rank >= RECORD_DISAGREEMENT_GAP) {
    flags.push({
      kind: "efficiency-over-record",
      label: `record disagreement — efficiency signal above record (rating #${row.rank} vs record #${recordRank})`,
    });
  }
  if (recordRank != null && row.rank - recordRank >= RECORD_DISAGREEMENT_GAP) {
    flags.push({
      kind: "record-over-efficiency",
      label: `record disagreement — record above efficiency signal (rating #${row.rank} vs record #${recordRank})`,
    });
  }
  if (playoffTeams.size > 0) {
    if (row.rank <= 12 && !playoffTeams.has(row.abbr)) {
      flags.push({ kind: "top12-non-playoff", label: "top-12 rating, missed playoffs — needs review" });
    }
    if (row.rank > 12 && playoffTeams.has(row.abbr)) {
      flags.push({ kind: "playoff-outside-top12", label: "playoff team outside top 12 — needs review" });
    }
  }
  if (row.scheduleAdjustment != null) {
    if (row.scheduleAdjustment >= SCHEDULE_CONTEXT_HIGH) {
      flags.push({ kind: "schedule-context", label: "schedule context — very hard schedule" });
    } else if (row.scheduleAdjustment <= SCHEDULE_CONTEXT_LOW) {
      flags.push({ kind: "schedule-context", label: "schedule context — very easy schedule" });
    }
  }
  if (teamStats && teamStats.gamesPlayed > 0 && teamStats.offensiveEpaPerPlay == null) {
    flags.push({ kind: "missing-efficiency-data", label: "missing efficiency data — EPA unavailable" });
  }
  return flags;
}
