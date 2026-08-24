import type { CfbResearchPlayCategory } from "./types";

/**
 * Maps CFBD's rawPlayType (verified against the full 2018-2025 dataset —
 * 41 distinct values) to a research category. Do not alter normalized
 * source rows; this is a pure derived-layer classification.
 *
 * Two categories CFBD does not expose as distinct playType values:
 *  - "pat": CFBD's historical /plays response has no separate extra-point
 *    playType in this dataset (verified: 0 occurrences across all 8
 *    seasons) — the category exists in the type union for forward
 *    compatibility but will always have zero matches here. Documented as
 *    a Work Unit 3 finding, not a bug.
 *  - "kneel"/"spike": no distinct playType either; detected only via a
 *    playText regex heuristic (see detectKneelOrSpike), which has very
 *    uneven season coverage (near-zero pre-2024, meaningful 2025+) because
 *    CFBD's playText annotation conventions changed over time. Treat
 *    kneel/spike classification as low-confidence for older seasons.
 */
const RAW_PLAY_TYPE_CATEGORY: Readonly<Record<string, CfbResearchPlayCategory>> = Object.freeze({
  Rush: "rush",
  "Rushing Touchdown": "rush",
  "Two Point Rush": "two_point_try",

  Pass: "pass",
  "Pass Reception": "pass",
  "Pass Completion": "pass",
  "Pass Incompletion": "pass",
  "Passing Touchdown": "pass",
  "Two Point Pass": "two_point_try",

  Sack: "sack",

  Interception: "turnover",
  "Pass Interception Return": "turnover",
  "Interception Return Touchdown": "turnover",
  "Fumble Recovery (Opponent)": "turnover",
  "Fumble Return Touchdown": "turnover",
  "Fumble Recovery (Own)": "rush", // ball stayed with the offense — not a turnover
  Fumble: "rush",

  Punt: "punt",
  "Punt Return": "punt",
  "Punt Return Touchdown": "punt",
  "Blocked Punt": "punt",
  "Blocked Punt Touchdown": "punt",

  Kickoff: "kickoff",
  "Kickoff Return (Offense)": "kickoff",
  "Kickoff Return Touchdown": "kickoff",

  "Field Goal Good": "field_goal",
  "Field Goal Missed": "field_goal",
  "Blocked Field Goal": "field_goal",
  "Blocked Field Goal Touchdown": "field_goal",
  "Missed Field Goal Return": "field_goal",
  "Missed Field Goal Return Touchdown": "field_goal",

  Penalty: "penalty_no_play",

  Safety: "defensive_score",
  "Defensive 2pt Conversion": "defensive_score",

  Timeout: "administrative",
  "End Period": "administrative",
  "End of Half": "administrative",
  "End of Game": "administrative",
  "End of Regulation": "administrative",

  Uncategorized: "unknown",
  placeholder: "unknown",
});

const KNEEL_TEXT_PATTERN = /\bkneel(s|ed|ing)?\b/i;
const SPIKE_TEXT_PATTERN = /\bspike(s|d)?\b/i;

/** Heuristic only — see module doc. Returns null when the base category isn't kneel/spike-eligible. */
export function detectKneelOrSpike(
  baseCategory: CfbResearchPlayCategory,
  playText: string | null,
): "kneel" | "spike" | null {
  if (baseCategory !== "rush" && baseCategory !== "pass") return null;
  if (!playText) return null;
  if (baseCategory === "rush" && KNEEL_TEXT_PATTERN.test(playText)) return "kneel";
  if (baseCategory === "pass" && SPIKE_TEXT_PATTERN.test(playText)) return "spike";
  return null;
}

export function classifyRawPlayType(rawPlayType: string | null): CfbResearchPlayCategory {
  if (rawPlayType === null) return "unknown";
  return RAW_PLAY_TYPE_CATEGORY[rawPlayType] ?? "unknown";
}

export function classifyResearchPlayCategory(
  rawPlayType: string | null,
  playText: string | null,
): CfbResearchPlayCategory {
  const base = classifyRawPlayType(rawPlayType);
  const kneelOrSpike = detectKneelOrSpike(base, playText);
  return kneelOrSpike ?? base;
}
