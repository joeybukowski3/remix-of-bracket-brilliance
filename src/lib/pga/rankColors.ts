export function getRankColor(rank: number | null, total = 83) {
  if (rank == null || total <= 0) {
    return { bg: "transparent", text: "currentColor" };
  }

  const pct = rank / total;

  if (pct <= 0.18) return { bg: "#1a7a3a", text: "#e6f5ec" };
  if (pct <= 0.36) return { bg: "#7ec89a", text: "#0f4a22" };
  if (pct <= 0.6) return { bg: "#f5f5f2", text: "#444444" };
  if (pct <= 0.8) return { bg: "#f0a090", text: "#6b1a10" };
  return { bg: "#b93030", text: "#fce8e8" };
}

export const RANK_COLOR_LEGEND = [
  { label: "Rank 1–15", bg: "#1a7a3a", text: "#e6f5ec" },
  { label: "16–30", bg: "#7ec89a", text: "#0f4a22" },
  { label: "31–50", bg: "#f5f5f2", text: "#444444", border: "0.5px solid #ccc" },
  { label: "51–67", bg: "#f0a090", text: "#6b1a10" },
  { label: "68–83", bg: "#b93030", text: "#fce8e8" },
] as const;
