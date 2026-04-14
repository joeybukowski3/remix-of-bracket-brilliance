import type { CSSProperties } from "react";

export function getRankHeatmapStyle(rank: number | null, maxRank: number): CSSProperties {
  if (rank == null || !Number.isFinite(rank) || maxRank <= 1) {
    return {
      backgroundColor: "hsl(var(--secondary))",
      color: "hsl(var(--muted-foreground))",
    };
  }

  const normalized = Math.max(0, Math.min(1, (rank - 1) / Math.max(1, maxRank - 1)));

  if (normalized <= 0.5) {
    const mix = normalized / 0.5;
    const hue = 145 - mix * 95;
    const saturation = 38 - mix * 10;
    const lightness = 92 + mix * 2;
    return {
      backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
      color: `hsl(${154 - mix * 34} 34% ${27 + mix * 10}%)`,
    };
  }

  const mix = (normalized - 0.5) / 0.5;
  const hue = 48 - mix * 42;
  const saturation = 20 + mix * 28;
  const lightness = 94 - mix * 7;
  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    color: `hsl(${28 - mix * 20} 45% ${36 + mix * 6}%)`,
  };
}
