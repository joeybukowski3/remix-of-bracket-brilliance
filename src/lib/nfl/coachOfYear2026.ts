import { getNflOffseasonProfile } from "@/data/nflOffseason2026";
import {
  NFL_GUIDE_DIVISIONS,
  NFL_GUIDE_TEAMS,
  type NflGuideTeam,
} from "@/lib/nfl/guide2026";
import { getWarrenSharpScheduleProfile } from "@/lib/nfl/warrenSharpSchedule2026";

export type CoachOfYearHistoryRow = {
  season: number;
  coach: string;
  team: string;
  tenureYear: number;
  priorRecord: string;
  priorPlayoffs: boolean;
  awardRecord: string;
  winIncrease: number;
  divisionWinner: boolean;
  priorPpg: number;
  awardPpg: number;
  ppgIncrease: number;
  awardPlayoffs: boolean;
  priorSos: number;
  awardSos: number;
};

export const COACH_OF_YEAR_HISTORY: CoachOfYearHistoryRow[] = [
  { season: 2025, coach: "Mike Vrabel", team: "New England Patriots", tenureYear: 1, priorRecord: "4-13", priorPlayoffs: false, awardRecord: "14-3", winIncrease: 10, divisionWinner: true, priorPpg: 17.0, awardPpg: 28.8, ppgIncrease: 11.8, awardPlayoffs: true, priorSos: .471, awardSos: .391 },
  { season: 2024, coach: "Kevin O'Connell", team: "Minnesota Vikings", tenureYear: 3, priorRecord: "7-10", priorPlayoffs: false, awardRecord: "14-3", winIncrease: 7, divisionWinner: false, priorPpg: 20.2, awardPpg: 25.4, ppgIncrease: 5.2, awardPlayoffs: true, priorSos: .509, awardSos: .474 },
  { season: 2023, coach: "Kevin Stefanski", team: "Cleveland Browns", tenureYear: 4, priorRecord: "7-10", priorPlayoffs: false, awardRecord: "11-6", winIncrease: 4, divisionWinner: false, priorPpg: 21.2, awardPpg: 23.3, ppgIncrease: 2.1, awardPlayoffs: true, priorSos: .524, awardSos: .536 },
  { season: 2022, coach: "Brian Daboll", team: "New York Giants", tenureYear: 1, priorRecord: "4-13", priorPlayoffs: false, awardRecord: "9-7-1", winIncrease: 5, divisionWinner: false, priorPpg: 15.2, awardPpg: 21.5, ppgIncrease: 6.3, awardPlayoffs: true, priorSos: .536, awardSos: .526 },
  { season: 2021, coach: "Mike Vrabel", team: "Tennessee Titans", tenureYear: 4, priorRecord: "11-5", priorPlayoffs: true, awardRecord: "12-5", winIncrease: 1, divisionWinner: true, priorPpg: 30.7, awardPpg: 24.6, ppgIncrease: -6.1, awardPlayoffs: true, priorSos: .475, awardSos: .472 },
  { season: 2020, coach: "Kevin Stefanski", team: "Cleveland Browns", tenureYear: 1, priorRecord: "6-10", priorPlayoffs: false, awardRecord: "11-5", winIncrease: 5, divisionWinner: false, priorPpg: 20.9, awardPpg: 25.5, ppgIncrease: 4.6, awardPlayoffs: true, priorSos: .533, awardSos: .451 },
  { season: 2019, coach: "John Harbaugh", team: "Baltimore Ravens", tenureYear: 12, priorRecord: "10-6", priorPlayoffs: true, awardRecord: "14-2", winIncrease: 4, divisionWinner: true, priorPpg: 24.3, awardPpg: 33.2, ppgIncrease: 8.9, awardPlayoffs: true, priorSos: .496, awardSos: .494 },
  { season: 2018, coach: "Matt Nagy", team: "Chicago Bears", tenureYear: 1, priorRecord: "5-11", priorPlayoffs: false, awardRecord: "12-4", winIncrease: 7, divisionWinner: true, priorPpg: 16.5, awardPpg: 26.3, ppgIncrease: 9.8, awardPlayoffs: true, priorSos: .559, awardSos: .430 },
  { season: 2017, coach: "Sean McVay", team: "Los Angeles Rams", tenureYear: 1, priorRecord: "4-12", priorPlayoffs: false, awardRecord: "11-5", winIncrease: 7, divisionWinner: true, priorPpg: 14.0, awardPpg: 29.9, ppgIncrease: 15.9, awardPlayoffs: true, priorSos: .504, awardSos: .504 },
  { season: 2016, coach: "Jason Garrett", team: "Dallas Cowboys", tenureYear: 6, priorRecord: "4-12", priorPlayoffs: false, awardRecord: "13-3", winIncrease: 9, divisionWinner: true, priorPpg: 17.2, awardPpg: 26.3, ppgIncrease: 9.1, awardPlayoffs: true, priorSos: .531, awardSos: .471 },
];

export type CoachCandidateBucket = "eliminated" | "unlikely" | "rated";

export type CoachCandidateScore = {
  schedule: number;
  firstYearCoach: number;
  improvement: number;
  path: number;
  total: number;
};

export type CoachCandidateRow = {
  team: NflGuideTeam;
  coach: string;
  firstYearCoach: boolean;
  made2025Playoffs: boolean;
  winningRecord2025: boolean;
  significantSosIncrease: boolean;
  sosChangeNote: string | null;
  sharpSosRank: number;
  divisionPathLabel: string;
  elevated: boolean;
  bucket: CoachCandidateBucket;
  bucketReason: string;
  score: CoachCandidateScore | null;
};

const PLAYOFF_TEAMS_2025 = new Set([
  "buf", "den", "hou", "jax", "lac", "ne", "pit",
  "car", "chi", "gb", "lar", "phi", "sea", "sf",
]);

const VERIFIED_SIGNIFICANT_SOS_INCREASES: Record<string, string> = {
  dal: "From the #2 easiest schedule in 2025 to the #4 toughest in 2026.",
};

export const COACH_OF_YEAR_CANDIDATES: CoachCandidateRow[] = NFL_GUIDE_TEAMS
  .map(buildCandidate)
  .sort((a, b) => {
    const bucketOrder: Record<CoachCandidateBucket, number> = { rated: 0, unlikely: 1, eliminated: 2 };
    const bucketDiff = bucketOrder[a.bucket] - bucketOrder[b.bucket];
    if (bucketDiff !== 0) return bucketDiff;
    if (a.elevated !== b.elevated) return a.elevated ? -1 : 1;
    return (b.score?.total ?? -1) - (a.score?.total ?? -1) || a.team.powerRank - b.team.powerRank;
  });

function buildCandidate(team: NflGuideTeam): CoachCandidateRow {
  const coachProfile = getNflOffseasonProfile(team.abbr);
  const sharp = getWarrenSharpScheduleProfile(team.abbr);
  const made2025Playoffs = PLAYOFF_TEAMS_2025.has(team.abbr);
  const winningRecord2025 = team.wins2025 > team.losses2025;
  const sosChangeNote = VERIFIED_SIGNIFICANT_SOS_INCREASES[team.abbr] ?? null;
  const significantSosIncrease = Boolean(sosChangeNote);
  const firstYearCoach = coachProfile.status === "Changed";
  const sharpSosRank = sharp?.strengthOfSchedule.hardestFirstRank ?? team.scheduleRank ?? 16;

  let bucket: CoachCandidateBucket = "rated";
  let bucketReason = "Advanced to the preliminary rating model.";
  let score: CoachCandidateScore | null = null;

  if (made2025Playoffs) {
    bucket = "eliminated";
    bucketReason = "Eliminated because the team made the 2025 playoffs.";
  } else if (winningRecord2025 || significantSosIncrease) {
    bucket = "unlikely";
    const reasons = [
      winningRecord2025 ? `finished ${team.record2025}` : null,
      significantSosIncrease ? "faces a verified major schedule increase" : null,
    ].filter(Boolean);
    bucketReason = `Unlikely profile: ${reasons.join(" and ")}.`;
  } else {
    score = scoreCandidate(team, sharpSosRank, firstYearCoach);
  }

  const elevated = bucket === "rated"
    && team.projectedWins >= 7
    && team.regressionGap >= 3
    && sharpSosRank >= 17
    && (team.offRank <= 20 || team.defRank <= 20);

  return {
    team,
    coach: coachProfile.headCoach2026,
    firstYearCoach,
    made2025Playoffs,
    winningRecord2025,
    significantSosIncrease,
    sosChangeNote,
    sharpSosRank,
    divisionPathLabel: getDivisionPathLabel(team),
    elevated,
    bucket,
    bucketReason,
    score,
  };
}

function scoreCandidate(team: NflGuideTeam, sharpSosRank: number, firstYearCoach: boolean): CoachCandidateScore {
  const schedule = Math.round(((sharpSosRank - 1) / 31) * 25);
  const firstYearCoachScore = firstYearCoach ? 15 : 0;

  const improvementGap = Math.max(0, team.projectedWins - team.wins2025);
  const improvementFromGap = Math.min(20, improvementGap * 5);
  const lowExpectationBonus = team.winTotal == null ? 0 : team.winTotal <= 7.5 ? 8 : team.winTotal <= 9 ? 4 : 0;
  const modelEdgeBonus = team.modelEdge == null ? 0 : Math.min(7, Math.max(0, team.modelEdge) * 4);
  const improvement = Math.round(Math.min(35, improvementFromGap + lowExpectationBonus + modelEdgeBonus));

  const division = NFL_GUIDE_DIVISIONS.find((entry) => entry.division === team.division);
  const rivals = division?.teams.filter((entry) => entry.abbr !== team.abbr) ?? [];
  const bestRivalWins = rivals.length ? Math.max(...rivals.map((entry) => entry.projectedWins)) : team.projectedWins;
  const averageRivalPowerRank = rivals.length
    ? rivals.reduce((sum, entry) => sum + entry.powerRank, 0) / rivals.length
    : 16.5;
  const gapToBest = bestRivalWins - team.projectedWins;
  const contentionScore = gapToBest <= 0 ? 15 : gapToBest <= 1 ? 12 : gapToBest <= 2 ? 8 : gapToBest <= 3 ? 4 : 0;
  const divisionStrengthScore = averageRivalPowerRank >= 20 ? 10 : averageRivalPowerRank >= 15 ? 6 : 2;
  const path = contentionScore + divisionStrengthScore;

  return {
    schedule,
    firstYearCoach: firstYearCoachScore,
    improvement,
    path,
    total: schedule + firstYearCoachScore + improvement + path,
  };
}

function getDivisionPathLabel(team: NflGuideTeam) {
  const division = NFL_GUIDE_DIVISIONS.find((entry) => entry.division === team.division);
  const rivals = division?.teams.filter((entry) => entry.abbr !== team.abbr) ?? [];
  if (!rivals.length) return "Unknown";
  const bestRivalWins = Math.max(...rivals.map((entry) => entry.projectedWins));
  const gap = bestRivalWins - team.projectedWins;
  if (gap <= 0) return "Division favorite by model";
  if (gap <= 1) return "Strong division path";
  if (gap <= 2) return "Plausible playoff path";
  if (gap <= 3) return "Needs a meaningful jump";
  return "Long-shot path";
}

export function getCoachOfYearHistorySummary() {
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const percentage = (values: boolean[]) => Math.round((values.filter(Boolean).length / values.length) * 100);

  return {
    firstYearCoachPct: percentage(COACH_OF_YEAR_HISTORY.map((row) => row.tenureYear === 1)),
    missedPriorPlayoffsPct: percentage(COACH_OF_YEAR_HISTORY.map((row) => !row.priorPlayoffs)),
    awardPlayoffsPct: percentage(COACH_OF_YEAR_HISTORY.map((row) => row.awardPlayoffs)),
    divisionWinnerPct: percentage(COACH_OF_YEAR_HISTORY.map((row) => row.divisionWinner)),
    improvedPpgPct: percentage(COACH_OF_YEAR_HISTORY.map((row) => row.ppgIncrease > 0)),
    easierSchedulePct: percentage(COACH_OF_YEAR_HISTORY.map((row) => row.awardSos < row.priorSos)),
    averageTenure: average(COACH_OF_YEAR_HISTORY.map((row) => row.tenureYear)),
    averageWinIncrease: average(COACH_OF_YEAR_HISTORY.map((row) => row.winIncrease)),
    averagePpgIncrease: average(COACH_OF_YEAR_HISTORY.map((row) => row.ppgIncrease)),
    averagePriorSos: average(COACH_OF_YEAR_HISTORY.map((row) => row.priorSos)),
    averageAwardSos: average(COACH_OF_YEAR_HISTORY.map((row) => row.awardSos)),
    sampleSize: COACH_OF_YEAR_HISTORY.length,
  };
}

export function getCandidateByAbbr(abbr: string) {
  return COACH_OF_YEAR_CANDIDATES.find((row) => row.team.abbr === abbr.toLowerCase()) ?? null;
}

export function getCoachCandidateCounts() {
  return COACH_OF_YEAR_CANDIDATES.reduce(
    (counts, row) => ({ ...counts, [row.bucket]: counts[row.bucket] + 1 }),
    { eliminated: 0, unlikely: 0, rated: 0 } as Record<CoachCandidateBucket, number>,
  );
}

export const COACH_OF_YEAR_RATED_CANDIDATES = COACH_OF_YEAR_CANDIDATES.filter(
  (row): row is CoachCandidateRow & { score: CoachCandidateScore } => row.bucket === "rated" && row.score != null,
);
export const COACH_OF_YEAR_ELEVATED_CANDIDATES = COACH_OF_YEAR_RATED_CANDIDATES.filter((row) => row.elevated);
export const COACH_OF_YEAR_ELIMINATED = COACH_OF_YEAR_CANDIDATES.filter((row) => row.bucket === "eliminated");
export const COACH_OF_YEAR_UNLIKELY = COACH_OF_YEAR_CANDIDATES.filter((row) => row.bucket === "unlikely");
