export type WeeklyGlossaryKey =
  | "rank"
  | "player"
  | "projection"
  | "seasonPpg"
  | "last5Ppg"
  | "matchup"
  | "opponentFpaSeason"
  | "opponentFpaLast5"
  | "trenches"
  | "epa"
  | "success"
  | "touches"
  | "yardsPerCarry"
  | "receivingTargets"
  | "targetShare"
  | "airYardsPerGame"
  | "targetsPerGame";

export type WeeklyStatDefinition = {
  key: WeeklyGlossaryKey;
  abbreviation: string;
  name: string;
  meaning: string;
};

export type WeeklyGlossaryGroup = {
  label: "Common" | "QB" | "RB" | "WR / TE";
  definitions: readonly WeeklyStatDefinition[];
};

const COMMON_DEFINITIONS: readonly WeeklyStatDefinition[] = [
  { key: "rank", abbreviation: "RK", name: "Rank", meaning: "JKB weekly rank by projected fantasy points." },
  { key: "player", abbreviation: "PLR", name: "Player", meaning: "Player identity; the compact grid shows the last name." },
  { key: "projection", abbreviation: "PROJ", name: "Projected Points", meaning: "JKB projected Full-PPR fantasy points for this week." },
  { key: "seasonPpg", abbreviation: "SZN", name: "Season PPG", meaning: "Fantasy points per game for the current season sample; Week 1 uses the approved prior-season sample." },
  { key: "last5Ppg", abbreviation: "L5", name: "Last 5 Trend", meaning: "Fantasy points per game across the player's last five eligible games." },
  { key: "matchup", abbreviation: "MU", name: "Matchup", meaning: "Overall opponent fantasy matchup grade." },
  { key: "opponentFpaSeason", abbreviation: "OA", name: "Opp Allowed SZN", meaning: "Opponent fantasy points allowed to this position over the season sample." },
  { key: "opponentFpaLast5", abbreviation: "O5", name: "Opp Allowed L5", meaning: "Opponent fantasy points allowed to this position over its last five eligible games." },
  { key: "trenches", abbreviation: "TR", name: "Trenches", meaning: "Offensive-line vs defensive-front edge: pass protection for QB/WR/TE and run blocking for RB." },
];

const QB_DEFINITIONS: readonly WeeklyStatDefinition[] = [
  { key: "epa", abbreviation: "EPA", name: "EPA Advantage", meaning: "Team passing or rushing EPA rank versus the opponent's corresponding defensive EPA rank." },
  { key: "success", abbreviation: "SR", name: "Success Rate Advantage", meaning: "Team passing or rushing success-rate rank versus the opponent's corresponding defensive success-rate rank." },
];

const RB_DEFINITIONS: readonly WeeklyStatDefinition[] = [
  { key: "touches", abbreviation: "TCH", name: "Touches", meaning: "RB rushing attempts plus receptions, using the research layer's canonical touch definition." },
  { key: "yardsPerCarry", abbreviation: "YPC", name: "Yards Per Carry", meaning: "RB rushing yards per attempt." },
  { key: "receivingTargets", abbreviation: "TGT", name: "Receiving Targets", meaning: "RB receiving target volume." },
];

const RECEIVER_DEFINITIONS: readonly WeeklyStatDefinition[] = [
  { key: "targetShare", abbreviation: "T%", name: "Target Share", meaning: "WR/TE share of team passing targets." },
  { key: "airYardsPerGame", abbreviation: "AY", name: "Air Yards", meaning: "WR/TE air-yards evidence from the existing research authority." },
  { key: "targetsPerGame", abbreviation: "T/G", name: "Targets/Game", meaning: "Targets per eligible game." },
];

export const WEEKLY_STAT_GLOSSARY_GROUPS: readonly WeeklyGlossaryGroup[] = [
  { label: "Common", definitions: COMMON_DEFINITIONS },
  { label: "QB", definitions: QB_DEFINITIONS },
  { label: "RB", definitions: RB_DEFINITIONS },
  { label: "WR / TE", definitions: RECEIVER_DEFINITIONS },
];

const WEEKLY_STAT_DEFINITIONS = new Map(
  WEEKLY_STAT_GLOSSARY_GROUPS.flatMap((group) => group.definitions.map((definition) => [definition.key, definition] as const)),
);

export function weeklyStatDefinition(key: WeeklyGlossaryKey): WeeklyStatDefinition {
  const definition = WEEKLY_STAT_DEFINITIONS.get(key);
  if (!definition) throw new Error(`Missing Weekly Rankings presentation metadata for ${key}`);
  return definition;
}
