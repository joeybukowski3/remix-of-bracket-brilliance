import type { HrDashboardBatter } from "@/pages/MlbHrProps";

export type HrBestBetCategory = "model" | "longshot";

export type HrBestBet = {
  category: HrBestBetCategory;
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  gameKey: string;
  odds: string;
  book: string | null;
  hrScore: number;
  rank: number;
  barrelRate: number | null;
  hardHitRate: number | null;
  last7HR: number;
  pitcherHrVs: number | null;
  confidenceLevel: HrDashboardBatter["confidenceLevel"];
  selectionScore: number;
  reason: string;
};

function parseAmericanOdds(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceBonus(level: HrDashboardBatter["confidenceLevel"]) {
  if (level === "high") return 5;
  if (level === "medium") return 2;
  if (level === "low") return -2;
  if (level === "incomplete") return -8;
  return 0;
}

function buildReason(row: HrDashboardBatter, category: HrBestBetCategory) {
  const details: string[] = [];
  if ((row.barrelRate ?? 0) >= 14) details.push(`${row.barrelRate?.toFixed(1)}% barrel rate`);
  else if ((row.hardHitRate ?? 0) >= 45) details.push(`${row.hardHitRate?.toFixed(1)}% hard-hit rate`);

  if ((row.opposingPitcherHrVs ?? 0) >= 65) details.push(`vulnerable opposing pitcher (${row.opposingPitcherHrVs?.toFixed(1)} HR score)`);
  if (row.last7HR >= 2) details.push(`${row.last7HR} HR over the recent window`);
  if ((row.weatherBoost ?? 0) >= 3) details.push("favorable weather context");
  if (row.parkFactor >= 1.1) details.push("hitter-friendly park");

  const lead = category === "model"
    ? `Ranks #${row.hrScoreRank} with a ${row.hrScore.toFixed(1)} HR Quality Score.`
    : `Combines a ${row.hrScore.toFixed(1)} HR Quality Score with a longer available price.`;

  return details.length ? `${lead} ${details.slice(0, 2).join(" and ")}.` : lead;
}

export function buildHrPropBestBets(rows: HrDashboardBatter[], maxPerCategory = 3) {
  const eligible = rows.filter((row) => {
    const odds = parseAmericanOdds(row.hrOddsYes);
    return odds != null
      && row.hrScore >= 55
      && row.confidenceLevel !== "incomplete"
      && Number.isFinite(row.hrScore);
  });

  const modelPlays = eligible.map((row): HrBestBet => {
    const selectionScore = Number((
      row.hrScore
      + confidenceBonus(row.confidenceLevel)
      + Math.min(5, Math.max(0, ((row.barrelRate ?? 8) - 8) * 0.45))
      + Math.min(4, Math.max(0, ((row.opposingPitcherHrVs ?? 45) - 45) * 0.08))
    ).toFixed(1));

    return {
      category: "model",
      player: row.player,
      team: row.team,
      opponent: row.opponent,
      opposingPitcher: row.opposingPitcher,
      gameKey: row.gameKey,
      odds: row.hrOddsYes!,
      book: row.hrOddsBook ?? null,
      hrScore: row.hrScore,
      rank: row.hrScoreRank,
      barrelRate: row.barrelRate,
      hardHitRate: row.hardHitRate,
      last7HR: row.last7HR,
      pitcherHrVs: row.opposingPitcherHrVs,
      confidenceLevel: row.confidenceLevel,
      selectionScore,
      reason: buildReason(row, "model"),
    };
  }).sort((a, b) => b.selectionScore - a.selectionScore || a.rank - b.rank || a.player.localeCompare(b.player));

  const longshots = eligible.filter((row) => (parseAmericanOdds(row.hrOddsYes) ?? 0) >= 350).map((row): HrBestBet => {
    const price = parseAmericanOdds(row.hrOddsYes) ?? 0;
    const selectionScore = Number((
      row.hrScore * 0.72
      + Math.min(14, Math.max(0, (price - 300) / 50))
      + confidenceBonus(row.confidenceLevel)
      + Math.min(5, Math.max(0, ((row.barrelRate ?? 8) - 8) * 0.4))
    ).toFixed(1));

    return {
      category: "longshot",
      player: row.player,
      team: row.team,
      opponent: row.opponent,
      opposingPitcher: row.opposingPitcher,
      gameKey: row.gameKey,
      odds: row.hrOddsYes!,
      book: row.hrOddsBook ?? null,
      hrScore: row.hrScore,
      rank: row.hrScoreRank,
      barrelRate: row.barrelRate,
      hardHitRate: row.hardHitRate,
      last7HR: row.last7HR,
      pitcherHrVs: row.opposingPitcherHrVs,
      confidenceLevel: row.confidenceLevel,
      selectionScore,
      reason: buildReason(row, "longshot"),
    };
  }).sort((a, b) => b.selectionScore - a.selectionScore || b.hrScore - a.hrScore || a.player.localeCompare(b.player));

  return {
    modelPlays: modelPlays.slice(0, maxPerCategory),
    longshots: longshots.slice(0, maxPerCategory),
  };
}
