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

export function getStatusBadgeTheme(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("progress") || normalized.includes("live") || normalized.includes("delayed")) {
    return { background: "#166534", color: "#f0fdf4" };
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
