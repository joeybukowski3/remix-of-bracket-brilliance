import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

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

function buildReason(row: PitcherStrikeoutTeamRow, side: KBestBetSide, edge: number, projectedKs: number) {
  const projection = projectedKs.toFixed(1);
  const line = row.kLine?.toFixed(1) ?? "—";
  const gap = Math.abs(edge).toFixed(1);
  if (side === "over") {
    return `Model projection ${projection} vs ${line} line (+${gap} K), supported by a ${row.strikeoutMatchupScore.toFixed(1)} matchup score.`;
  }
  return `Model projection ${projection} vs ${line} line (-${gap} K), suggesting the posted number is above the model expectation.`;
}

export function buildKPropBestBets(rows: PitcherStrikeoutTeamRow[], maxPerSide = 3) {
  const overs: KBestBet[] = [];
  const unders: KBestBet[] = [];

  for (const row of rows) {
    // A reliever/opener whose live projection required a workload-role
    // safety override but had no eligible bounded candidate to substitute
    // is excluded from public recommendations entirely -- surfacing a
    // number here (even a correctly-labeled one) would still imply a
    // confidence the model doesn't have. See generate-mlb-hr-props-with-
    // k-shadow.mjs's applyKProjectionMode for where this flag is set.
    if (row.publicRecommendationEligible === false) continue;
    const projectedKs = resolveProjectedKs(row);
    if (row.kLine == null || projectedKs == null || !Number.isFinite(row.kLine)) continue;
    const projectionEdge = Number((projectedKs - row.kLine).toFixed(1));

    if (projectionEdge >= 0.4 && row.kOddsOver) {
      const valueScore = Number((
        projectionEdge * 18
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
        projectionEdge,
        matchupScore: row.strikeoutMatchupScore,
        valueScore,
        reason: buildReason(row, "over", projectionEdge, projectedKs),
      });
    }

    if (projectionEdge <= -0.4 && row.kOddsUnder) {
      const valueScore = Number((
        Math.abs(projectionEdge) * 20
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
        projectionEdge,
        matchupScore: row.strikeoutMatchupScore,
        valueScore,
        reason: buildReason(row, "under", projectionEdge, projectedKs),
      });
    }
  }

  const sorter = (a: KBestBet, b: KBestBet) =>
    b.valueScore - a.valueScore
    || Math.abs(b.projectionEdge) - Math.abs(a.projectionEdge)
    || a.pitcher.localeCompare(b.pitcher);

  return {
    overs: overs.sort(sorter).slice(0, maxPerSide),
    unders: unders.sort(sorter).slice(0, maxPerSide),
  };
}
