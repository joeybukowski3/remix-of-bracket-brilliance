type HeatmapTone = {
  bg: string;
  text: string;
  border?: string;
};

export function getPercentileColor(percentile: number | null): HeatmapTone {
  if (percentile == null || !Number.isFinite(percentile)) {
    return { bg: "transparent", text: "currentColor" };
  }

  if (percentile < 20) return { bg: "#b93030", text: "#fce8e8" };
  if (percentile < 40) return { bg: "#f0a090", text: "#6b1a10" };
  if (percentile < 60) return { bg: "#f5f5f2", text: "#444444", border: "0.5px solid #d8d8d2" };
  if (percentile < 80) return { bg: "#7ec89a", text: "#0f4a22" };
  return { bg: "#1a7a3a", text: "#e6f5ec" };
}

export function getPercentileFromRank(rank: number | null, total = 83) {
  if (rank == null || total <= 1 || !Number.isFinite(rank)) return null;
  const boundedRank = Math.max(1, Math.min(total, rank));
  return Math.round(((total - boundedRank) / (total - 1)) * 100);
}

export function getRankColor(rank: number | null, total = 83) {
  return getPercentileColor(getPercentileFromRank(rank, total));
}

export const RANK_COLOR_LEGEND = [
  { label: "Top 20%", bg: "#1a7a3a", text: "#e6f5ec" },
  { label: "60-79%", bg: "#7ec89a", text: "#0f4a22" },
  { label: "40-59%", bg: "#f5f5f2", text: "#444444", border: "0.5px solid #d8d8d2" },
  { label: "20-39%", bg: "#f0a090", text: "#6b1a10" },
  { label: "0-19%", bg: "#b93030", text: "#fce8e8" },
] as const;
