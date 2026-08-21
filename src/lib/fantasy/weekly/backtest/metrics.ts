import type { FantasyPosition } from "@/lib/fantasy/rankings";

export type ScoredPlayerWeek = {
  season: number;
  week: number;
  position: FantasyPosition;
  playerId: string;
  actualFantasyPoints: number;
  score: number | null;
};

export type RankingMetrics = {
  rows: number;
  scoredRows: number;
  coverage: number;
  weeks: number;
  spearman: number | null;
  kendall: number | null;
  topK: number;
  topKHitRate: number | null;
  thresholdPrecision: number | null;
  thresholdRecall: number | null;
  thresholdAccuracy: number | null;
  meanAbsoluteRankChange: number | null;
};

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value || a.index - b.index);
  const ranks = Array(values.length).fill(0) as number[];
  for (let start = 0; start < indexed.length;) {
    let end = start + 1;
    while (end < indexed.length && indexed[end].value === indexed[start].value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) ranks[indexed[index].index] = rank;
    start = end;
  }
  return ranks;
}

function pearson(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = average(left)!;
  const rightMean = average(right)!;
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftSquared += a * a;
    rightSquared += b * b;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator ? numerator / denominator : null;
}

export function spearmanRankCorrelation(actual: readonly number[], predicted: readonly number[]): number | null {
  return pearson(averageRanks(actual), averageRanks(predicted));
}

export function kendallRankCorrelation(actual: readonly number[], predicted: readonly number[]): number | null {
  if (actual.length !== predicted.length || actual.length < 2) return null;
  let concordant = 0;
  let discordant = 0;
  let actualTies = 0;
  let predictedTies = 0;
  for (let left = 0; left < actual.length; left += 1) {
    for (let right = left + 1; right < actual.length; right += 1) {
      const actualSign = Math.sign(actual[left] - actual[right]);
      const predictedSign = Math.sign(predicted[left] - predicted[right]);
      if (actualSign === 0 && predictedSign === 0) continue;
      if (actualSign === 0) actualTies += 1;
      else if (predictedSign === 0) predictedTies += 1;
      else if (actualSign === predictedSign) concordant += 1;
      else discordant += 1;
    }
  }
  const denominator = Math.sqrt(
    (concordant + discordant + actualTies) * (concordant + discordant + predictedTies),
  );
  return denominator ? (concordant - discordant) / denominator : null;
}

function weeklyGroups(rows: readonly ScoredPlayerWeek[]) {
  const groups = new Map<string, ScoredPlayerWeek[]>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.position}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function defaultStartThreshold(position: FantasyPosition): number {
  return position === "QB" || position === "TE" ? 12 : 24;
}

export function evaluateRankingMetrics(rows: readonly ScoredPlayerWeek[], topK?: number): RankingMetrics {
  const position = rows[0]?.position ?? "QB";
  const threshold = topK ?? defaultStartThreshold(position);
  const correlations: Array<{ spearman: number; kendall: number }> = [];
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let totalHits = 0;
  let totalSlots = 0;
  let scoredRows = 0;
  const ranksByPlayer = new Map<string, Array<{ season: number; week: number; rank: number }>>();

  const groups = weeklyGroups(rows);
  for (const group of groups) {
    const scored = group.filter((row): row is ScoredPlayerWeek & { score: number } => row.score != null);
    scoredRows += scored.length;
    if (scored.length >= 2) {
      const actual = scored.map((row) => row.actualFantasyPoints);
      const predicted = scored.map((row) => row.score);
      const spearman = spearmanRankCorrelation(actual, predicted);
      const kendall = kendallRankCorrelation(actual, predicted);
      if (spearman != null && kendall != null) correlations.push({ spearman, kendall });
    }

    const slots = Math.min(threshold, group.length);
    const actualTop = new Set([...group].sort((a, b) => b.actualFantasyPoints - a.actualFantasyPoints || a.playerId.localeCompare(b.playerId)).slice(0, slots).map((row) => row.playerId));
    const predictedTop = new Set([...scored].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId)).slice(0, Math.min(slots, scored.length)).map((row) => row.playerId));
    [...scored].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId)).forEach((row, index) => {
      const list = ranksByPlayer.get(row.playerId) ?? [];
      list.push({ season: row.season, week: row.week, rank: index + 1 });
      ranksByPlayer.set(row.playerId, list);
    });
    for (const row of group) {
      const actualStart = actualTop.has(row.playerId);
      const predictedStart = predictedTop.has(row.playerId);
      if (actualStart && predictedStart) truePositive += 1;
      else if (!actualStart && predictedStart) falsePositive += 1;
      else if (actualStart) falseNegative += 1;
      else trueNegative += 1;
    }
    totalHits += [...predictedTop].filter((id) => actualTop.has(id)).length;
    totalSlots += slots;
  }

  const rankChanges: number[] = [];
  for (const appearances of ranksByPlayer.values()) {
    appearances.sort((a, b) => a.season - b.season || a.week - b.week);
    for (let index = 1; index < appearances.length; index += 1) {
      if (appearances[index].season === appearances[index - 1].season) {
        rankChanges.push(Math.abs(appearances[index].rank - appearances[index - 1].rank));
      }
    }
  }

  const safeRatio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
  return {
    rows: rows.length,
    scoredRows,
    coverage: rows.length ? scoredRows / rows.length : 0,
    weeks: groups.length,
    spearman: average(correlations.map((row) => row.spearman)),
    kendall: average(correlations.map((row) => row.kendall)),
    topK: threshold,
    topKHitRate: safeRatio(totalHits, totalSlots),
    thresholdPrecision: safeRatio(truePositive, truePositive + falsePositive),
    thresholdRecall: safeRatio(truePositive, truePositive + falseNegative),
    thresholdAccuracy: safeRatio(truePositive + trueNegative, truePositive + falsePositive + falseNegative + trueNegative),
    meanAbsoluteRankChange: average(rankChanges),
  };
}
