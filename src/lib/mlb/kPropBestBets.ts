import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import {
  evaluateKPropOverRecommendation,
  evaluateKPropUnderRecommendation,
  type KPropRecommendationEvaluation,
  type KPropRecommendationInput,
} from "@/lib/mlb/kPropRecommendationEligibility";

export type KBestBetSide = "over" | "under";

export type KBestBet = {
  side: KBestBetSide;
  pitcher: string;
  team: string;
  opponent: string;
  gameKey: string;
  line: number;
  odds: string;
  book: string | null;
  projectedKs: number;
  projectionEdge: number;
  matchupScore: number;
  valueScore: number;
  reason: string;
  /** Raw (unadjusted) model-vs-line edge -- always the same value as projectionEdge; kept explicit for debug clarity. */
  rawEdge: number;
  /** Edge scaled by workloadReliability -- drives ranking; never used to alter the displayed projection. */
  adjustedRecommendationEdge: number;
  /** 0-1, how much of a full starter workload backs this projection. */
  workloadReliability: number;
  recommendationTier: KPropRecommendationEvaluation["tier"];
  /** True only for the narrow, elite-matchup low-workload Over override. */
  isExceptionalLowWorkload: boolean;
  workloadRole: string | null;
  expectedIP: number | null;
  expectedBF: number | null;
};

function parseAmericanOdds(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function priceBonus(odds: string | null | undefined) {
  const price = parseAmericanOdds(odds);
  if (price == null) return 0;
  if (price >= 100) return Math.min(8, price / 50);
  if (price >= -120) return 2;
  if (price >= -145) return 0;
  return -3;
}

function resolveProjectedKs(row: PitcherStrikeoutTeamRow) {
  if (row.projectedKs != null && Number.isFinite(row.projectedKs)) return row.projectedKs;
  if (
    row.projectedIP != null
    && row.projectedK9 != null
    && Number.isFinite(row.projectedIP)
    && Number.isFinite(row.projectedK9)
  ) {
    return Number(((row.projectedIP * row.projectedK9) / 9).toFixed(1));
  }
  return null;
}

function buildReason(row: PitcherStrikeoutTeamRow, side: KBestBetSide, edge: number, projectedKs: number, isExceptionalLowWorkload: boolean) {
  const projection = projectedKs.toFixed(1);
  const line = row.kLine?.toFixed(1) ?? "—";
  const gap = Math.abs(edge).toFixed(1);
  if (side === "over") {
    const base = `Model projection ${projection} vs ${line} line (+${gap} K), supported by a ${row.strikeoutMatchupScore.toFixed(1)} matchup score.`;
    return isExceptionalLowWorkload
      ? `${base} Low-workload role -- qualifies only via an elite matchup exception, not standard volume.`
      : base;
  }
  return `Model projection ${projection} vs ${line} line (-${gap} K), suggesting the posted number is above the model expectation.`;
}

function toRecommendationInput(row: PitcherStrikeoutTeamRow, projectedKs: number): KPropRecommendationInput {
  return {
    workloadRole: row.workloadRole ?? row.role ?? null,
    expectedIP: row.effectiveProjectedIP ?? row.projectedIP ?? null,
    expectedBF: row.workloadExpectedBF ?? null,
    projectedKs,
    kLine: row.kLine ?? null,
    publicRecommendationEligible: row.publicRecommendationEligible,
    workloadConfidenceGrade: row.workloadConfidenceGrade ?? null,
    workloadConfidenceScore: row.workloadConfidenceScore ?? null,
    teamAdjustedKRate: row.teamAdjustedKRate ?? null,
    workloadFlags: row.workloadFlags ?? null,
    strikeoutMatchupScore: row.strikeoutMatchupScore,
    opponentTeamKRate: row.opponentTeamKRate ?? null,
  };
}

export function buildKPropBestBets(rows: PitcherStrikeoutTeamRow[], maxPerSide = 3) {
  const overs: KBestBet[] = [];
  const unders: KBestBet[] = [];

  for (const row of rows) {
    const projectedKs = resolveProjectedKs(row);
    if (row.kLine == null || projectedKs == null || !Number.isFinite(row.kLine)) continue;
    const input = toRecommendationInput(row, projectedKs);

    if (row.kOddsOver) {
      const evaluation = evaluateKPropOverRecommendation(input);
      if (evaluation.eligible && evaluation.rawEdge != null && evaluation.adjustedRecommendationEdge != null) {
        const isExceptionalLowWorkload = evaluation.tier === "exceptional-low-workload";
        const valueScore = Number((
          evaluation.adjustedRecommendationEdge * 18
          + row.strikeoutMatchupScore * 0.42
          + row.pitcherKSkillScore * 0.18
          + priceBonus(row.kOddsOver)
        ).toFixed(1));
        overs.push({
          side: "over",
          pitcher: row.pitcher,
          team: row.team,
          opponent: row.opponent,
          gameKey: row.gameKey,
          line: row.kLine,
          odds: row.kOddsOver,
          book: row.kOddsBook ?? null,
          projectedKs,
          projectionEdge: evaluation.rawEdge,
          matchupScore: row.strikeoutMatchupScore,
          valueScore,
          reason: buildReason(row, "over", evaluation.rawEdge, projectedKs, isExceptionalLowWorkload),
          rawEdge: evaluation.rawEdge,
          adjustedRecommendationEdge: evaluation.adjustedRecommendationEdge,
          workloadReliability: evaluation.workloadScore,
          recommendationTier: evaluation.tier,
          isExceptionalLowWorkload,
          workloadRole: input.workloadRole ?? null,
          expectedIP: input.expectedIP ?? null,
          expectedBF: input.expectedBF ?? null,
        });
      }
    }

    if (row.kOddsUnder) {
      const evaluation = evaluateKPropUnderRecommendation(input);
      if (evaluation.eligible && evaluation.rawEdge != null && evaluation.adjustedRecommendationEdge != null) {
        const valueScore = Number((
          Math.abs(evaluation.adjustedRecommendationEdge) * 20
          + (100 - row.strikeoutMatchupScore) * 0.2
          + (100 - row.pitcherKSkillScore) * 0.12
          + priceBonus(row.kOddsUnder)
        ).toFixed(1));
        unders.push({
          side: "under",
          pitcher: row.pitcher,
          team: row.team,
          opponent: row.opponent,
          gameKey: row.gameKey,
          line: row.kLine,
          odds: row.kOddsUnder,
          book: row.kOddsBook ?? null,
          projectedKs,
          projectionEdge: evaluation.rawEdge,
          matchupScore: row.strikeoutMatchupScore,
          valueScore,
          reason: buildReason(row, "under", evaluation.rawEdge, projectedKs, false),
          rawEdge: evaluation.rawEdge,
          adjustedRecommendationEdge: evaluation.adjustedRecommendationEdge,
          workloadReliability: evaluation.workloadScore,
          recommendationTier: evaluation.tier,
          isExceptionalLowWorkload: false,
          workloadRole: input.workloadRole ?? null,
          expectedIP: input.expectedIP ?? null,
          expectedBF: input.expectedBF ?? null,
        });
      }
    }
  }

  const sorter = (a: KBestBet, b: KBestBet) =>
    b.valueScore - a.valueScore
    || Math.abs(b.adjustedRecommendationEdge) - Math.abs(a.adjustedRecommendationEdge)
    || a.pitcher.localeCompare(b.pitcher);

  return {
    overs: overs.sort(sorter).slice(0, maxPerSide),
    unders: unders.sort(sorter).slice(0, maxPerSide),
  };
}
