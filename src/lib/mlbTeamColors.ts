export type MlbTeamColorEntry = {
  primary: string;
  tint: string;
  secondary?: string;
};

const TEAM_COLORS: Record<string, MlbTeamColorEntry> = {
  ARI: { primary: "#A71930", tint: "rgba(167,25,48,0.12)", secondary: "#E3D4AD" },
  ATL: { primary: "#CE1141", tint: "rgba(206,17,65,0.12)", secondary: "#13274F" },
  ATH: { primary: "#003831", tint: "rgba(0,56,49,0.12)", secondary: "#EFB21E" },
  OAK: { primary: "#003831", tint: "rgba(0,56,49,0.12)", secondary: "#EFB21E" },
  BAL: { primary: "#DF4601", tint: "rgba(223,70,1,0.12)", secondary: "#000000" },
  BOS: { primary: "#BD3039", tint: "rgba(189,48,57,0.12)", secondary: "#0C2340" },
  CHC: { primary: "#0E3386", tint: "rgba(14,51,134,0.12)", secondary: "#CC3433" },
  CIN: { primary: "#C6011F", tint: "rgba(198,1,31,0.12)", secondary: "#000000" },
  CLE: { primary: "#E31937", tint: "rgba(227,25,55,0.12)", secondary: "#002B5C" },
  COL: { primary: "#33006F", tint: "rgba(51,0,111,0.12)", secondary: "#C4CED4" },
  CWS: { primary: "#111111", tint: "rgba(17,17,17,0.1)", secondary: "#C4CED4" },
  DET: { primary: "#0C2340", tint: "rgba(12,35,64,0.12)", secondary: "#FA4616" },
  HOU: { primary: "#EB6E1F", tint: "rgba(235,110,31,0.12)", secondary: "#002D62" },
  KC: { primary: "#004687", tint: "rgba(0,70,135,0.12)", secondary: "#BD9B60" },
  KCR: { primary: "#004687", tint: "rgba(0,70,135,0.12)", secondary: "#BD9B60" },
  LAA: { primary: "#BA0021", tint: "rgba(186,0,33,0.12)", secondary: "#003263" },
  LAD: { primary: "#005A9C", tint: "rgba(0,90,156,0.12)", secondary: "#EF3E42" },
  MIA: { primary: "#00A3E0", tint: "rgba(0,163,224,0.12)", secondary: "#EF3340" },
  MIL: { primary: "#12284B", tint: "rgba(18,40,75,0.12)", secondary: "#FFC52F" },
  MIN: { primary: "#002B5C", tint: "rgba(0,43,92,0.12)", secondary: "#D31145" },
  NYM: { primary: "#002D72", tint: "rgba(0,45,114,0.12)", secondary: "#FF5910" },
  NYY: { primary: "#132448", tint: "rgba(19,36,72,0.12)", secondary: "#C4CED3" },
  PHI: { primary: "#E81828", tint: "rgba(232,24,40,0.12)", secondary: "#002D72" },
  PIT: { primary: "#FDB827", tint: "rgba(253,184,39,0.16)", secondary: "#27251F" },
  SD: { primary: "#2F241D", tint: "rgba(47,36,29,0.12)", secondary: "#FFC425" },
  SDP: { primary: "#2F241D", tint: "rgba(47,36,29,0.12)", secondary: "#FFC425" },
  SEA: { primary: "#005C5C", tint: "rgba(0,92,92,0.12)", secondary: "#0C2C56" },
  SF: { primary: "#FD5A1E", tint: "rgba(253,90,30,0.12)", secondary: "#27251F" },
  SFG: { primary: "#FD5A1E", tint: "rgba(253,90,30,0.12)", secondary: "#27251F" },
  STL: { primary: "#C41E3A", tint: "rgba(196,30,58,0.12)", secondary: "#0C2340" },
  TB: { primary: "#092C5C", tint: "rgba(9,44,92,0.12)", secondary: "#8FBCE6" },
  TBR: { primary: "#092C5C", tint: "rgba(9,44,92,0.12)", secondary: "#8FBCE6" },
  TEX: { primary: "#003278", tint: "rgba(0,50,120,0.12)", secondary: "#C0111F" },
  TOR: { primary: "#134A8E", tint: "rgba(19,74,142,0.12)", secondary: "#E8291C" },
  WSH: { primary: "#AB0003", tint: "rgba(171,0,3,0.12)", secondary: "#14225A" },
};

const FALLBACK: MlbTeamColorEntry = {
  primary: "#334155",
  tint: "rgba(51,65,85,0.12)",
  secondary: "#CBD5E1",
};

export function getMlbTeamColors(teamAbbreviation: string | null | undefined): MlbTeamColorEntry {
  if (!teamAbbreviation) return FALLBACK;
  return TEAM_COLORS[teamAbbreviation.toUpperCase()] ?? FALLBACK;
}

// ---------------------------------------------------------------------------
// Contrast helpers
// ---------------------------------------------------------------------------

/** Parse a hex color string (#rrggbb) into [r, g, b] in 0-255 range. */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Compute WCAG relative luminance for an sRGB triplet [0-255].
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearize = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG contrast ratio between two colors. Values ≥ 3.0 are acceptable for
 * large/bold text; ≥ 4.5 for body text.
 */
function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const L1 = relativeLuminance(rgb1);
  const L2 = relativeLuminance(rgb2);
  const lighter = Math.max(L1, L2);
  const darker  = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Return the best readable color for this team when placed on a dark background.
 *
 * Strategy (in priority order):
 * 1. If the primary color has sufficient contrast on the given `bgHex`, use it.
 * 2. If the secondary color has better contrast, use it instead.
 * 3. Fall back to a bright tint of the primary (+80% lightness boost).
 * 4. Final fallback: white.
 *
 * `minContrast` defaults to 3.0 (WCAG AA for large/bold text).
 */
export function getReadableOnDark(
  teamAbbreviation: string | null | undefined,
  bgHex = "#0b1220",
  minContrast = 3.0,
): string {
  const entry = getMlbTeamColors(teamAbbreviation);

  const primaryContrast   = contrastRatio(entry.primary, bgHex);
  const secondaryContrast = entry.secondary ? contrastRatio(entry.secondary, bgHex) : 0;

  // Primary is readable — use it
  if (primaryContrast >= minContrast) return entry.primary;

  // Secondary is readable and better than primary — use it
  if (secondaryContrast >= minContrast && secondaryContrast > primaryContrast) {
    return entry.secondary!;
  }

  // Neither is readable — lighten the primary by blending toward white
  const rgb = hexToRgb(entry.primary);
  if (rgb) {
    // Blend 65% toward white to guarantee visibility
    const blend = (c: number) => Math.round(c + (255 - c) * 0.65);
    const [r, g, b] = rgb.map(blend) as [number, number, number];
    const lightHex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    if (contrastRatio(lightHex, bgHex) >= minContrast) return lightHex;
  }

  return "#ffffff";
}

export function getStatusBadgeTheme(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("progress") || normalized.includes("live") || normalized.includes("delayed")) {
    return { background: "#166534", color: "#f0fdf4" };
  }
  if (normalized.includes("pre-game") || normalized.includes("warmup")) {
    return { background: "#2563eb", color: "#eff6ff" };
  }
  if (normalized.includes("final")) {
    return { background: "#0f172a", color: "#f8fafc" };
  }
  return { background: "#e2e8f0", color: "#334155" };
}

export function getEdgeTeamFromLabel(label: string, awayAbbreviation: string, homeAbbreviation: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes(awayAbbreviation.toLowerCase())) return awayAbbreviation;
  if (normalized.includes(homeAbbreviation.toLowerCase())) return homeAbbreviation;
  if (normalized === "even" || normalized.includes("neutral")) return null;
  return null;
}

export function getTrendArrow(record: string) {
  const [wins, losses] = record.split("-").map((value) => Number(value));
  if (!Number.isFinite(wins) || !Number.isFinite(losses)) return null;
  if (wins > losses) return "up";
  if (wins < losses) return "down";
  return "flat";
}
