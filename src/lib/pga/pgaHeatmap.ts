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
    const hue = 146 - mix * 96;
    const saturation = 34 - mix * 8;
    const lightness = 93 + mix * 2;
    return {
      backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
      color: `hsl(155 34% ${28 + mix * 8}%)`,
    };
  }

  const mix = (normalized - 0.5) / 0.5;
  const hue = 50 - mix * 42;
  const saturation = 18 + mix * 20;
  const lightness = 95 - mix * 5;
  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    color: `hsl(${28 - mix * 18} 42% ${36 + mix * 8}%)`,
  };
}
