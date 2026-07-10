/**
 * Matchup analysis layer: side-by-side comparison rows, deterministic advantage
 * summaries, and rules-based "angles to watch".
 *
 * Everything here is a pure function of an NflMatchup (which itself only carries
 * existing repository data). No fabricated narrative, no betting recommendation,
 * no invented injury/rest/weather/form context. All thresholds are named
 * constants documented inline so the logic is transparent and testable.
 */

import { formatSigned } from "@/lib/nfl/guideData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

// ---------------------------------------------------------------------------
// Comparison rows
// ---------------------------------------------------------------------------

/**
 * How a metric should be interpreted when deciding an advantage.
 *  - higher-is-better: larger raw value wins (ratings, projected wins)
 *  - lower-is-better:  smaller raw value wins (ranks)
 *  - context-only:     shown for context, never awards an advantage
 *  - none:             identity/label rows (conference, division)
 */
export type ComparisonDirection = "higher-is-better" | "lower-is-better" | "context-only" | "none";

export type MatchupAdvantage = "away" | "home" | "even" | "none";

export type MatchupComparisonRow = {
  key: string;
  label: string;
  /** Display strings, already formatted; "N/A" when the value is genuinely missing. */
  awayValue: string;
  homeValue: string;
  /** Raw comparable values used for advantage math; null when missing. */
  awayRaw: number | null;
  homeRaw: number | null;
  direction: ComparisonDirection;
  advantage: MatchupAdvantage;
  /** Short human explanation of what the metric means / how it is compared. */
  explanation: string;
};

const NA = "N/A";

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${formatSigned(value)}%`;
}

function rank(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `#${value}`;
}

function wins(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toFixed(1);
}

function computeAdvantage(
  awayRaw: number | null,
  homeRaw: number | null,
  direction: ComparisonDirection
): MatchupAdvantage {
  if (direction === "context-only" || direction === "none") return "none";
  if (awayRaw == null || homeRaw == null || !Number.isFinite(awayRaw) || !Number.isFinite(homeRaw)) {
    return "none";
  }
  if (awayRaw === homeRaw) return "even";
  const awayBetter = direction === "higher-is-better" ? awayRaw > homeRaw : awayRaw < homeRaw;
  return awayBetter ? "away" : "home";
}

type RowSpec = {
  key: string;
  label: string;
  direction: ComparisonDirection;
  explanation: string;
  raw: (team: NflMatchupTeam) => number | null;
  display: (team: NflMatchupTeam) => string;
};

// Ordered so the most decisive team-strength rows lead the table.
const ROW_SPECS: RowSpec[] = [
  {
    key: "overallRating",
    label: "Overall power rating",
    direction: "higher-is-better",
    explanation: "2025 composite performance rating versus league average.",
    raw: (t) => t.overallPct,
    display: (t) => pct(t.overallPct),
  },
  {
    key: "overallRank",
    label: "Overall power rank",
    direction: "lower-is-better",
    explanation: "League rank from the Joe Knows Ball power ratings (1 = best).",
    raw: (t) => t.powerRank,
    display: (t) => rank(t.powerRank),
  },
  {
    key: "offenseRating",
    label: "Offense rating",
    direction: "higher-is-better",
    explanation: "Offensive composite versus league average.",
    raw: (t) => t.offensePct,
    display: (t) => pct(t.offensePct),
  },
  {
    key: "offenseRank",
    label: "Offense rank",
    direction: "lower-is-better",
    explanation: "League offensive rank (1 = best).",
    raw: (t) => t.offenseRank,
    display: (t) => rank(t.offenseRank),
  },
  {
    key: "defenseRating",
    label: "Defense rating",
    direction: "higher-is-better",
    explanation: "Defensive composite versus league average (higher = better defense).",
    raw: (t) => t.defensePct,
    display: (t) => pct(t.defensePct),
  },
  {
    key: "defenseRank",
    label: "Defense rank",
    direction: "lower-is-better",
    explanation: "League defensive rank (1 = best).",
    raw: (t) => t.defenseRank,
    display: (t) => rank(t.defenseRank),
  },
  {
    key: "record2025",
    label: "2025 record",
    direction: "context-only",
    explanation: "Last season's regular-season record for context.",
    raw: () => null,
    display: (t) => t.record2025 || NA,
  },
  {
    key: "marketWinTotal",
    label: "2026 market win total",
    direction: "context-only",
    explanation: "Sportsbook season win total — market expectation, not a matchup edge.",
    raw: (t) => t.marketWinTotal,
    display: (t) => wins(t.marketWinTotal),
  },
  {
    key: "projectedWins",
    label: "Model projected wins",
    direction: "higher-is-better",
    explanation: "Joe Knows Ball projected 2026 wins.",
    raw: (t) => t.projectedWins,
    display: (t) => wins(t.projectedWins),
  },
  {
    key: "modelVsMarket",
    label: "Model vs market gap",
    direction: "context-only",
    explanation: "Projected wins minus market win total — season value, not a head-to-head edge.",
    raw: (t) => t.modelVsMarketGap,
    display: (t) => (t.modelVsMarketGap == null ? NA : formatSigned(t.modelVsMarketGap)),
  },
  {
    key: "scheduleRank",
    label: "Schedule strength rank",
    direction: "context-only",
    explanation: "Season strength-of-schedule rank (1 = hardest); context only.",
    raw: (t) => t.scheduleRank,
    display: (t) => rank(t.scheduleRank),
  },
  {
    key: "conference",
    label: "Conference",
    direction: "none",
    explanation: "Team conference.",
    raw: () => null,
    display: (t) => t.conference,
  },
  {
    key: "division",
    label: "Division",
    direction: "none",
    explanation: "Team division.",
    raw: () => null,
    display: (t) => t.division,
  },
];

export function buildComparisonRows(matchup: NflMatchup): MatchupComparisonRow[] {
  return ROW_SPECS.map((spec) => {
    const awayRaw = spec.raw(matchup.away);
    const homeRaw = spec.raw(matchup.home);
    return {
      key: spec.key,
      label: spec.label,
      awayValue: spec.display(matchup.away),
      homeValue: spec.display(matchup.home),
      awayRaw,
      homeRaw,
      direction: spec.direction,
      advantage: computeAdvantage(awayRaw, homeRaw, spec.direction),
      explanation: spec.explanation,
    };
  });
}

// ---------------------------------------------------------------------------
// Advantages summary
// ---------------------------------------------------------------------------

export type MatchupAdvantageNote = {
  key: string;
  teamSlug: string;
  teamName: string;
  text: string;
};

/** Max advantage sentences to surface (brief asks for ~3–6). */
export const MAX_ADVANTAGE_NOTES = 6;

// Rows that make the clearest, most decision-relevant advantage sentences,
// in the order we prefer to show them.
const ADVANTAGE_ROW_KEYS = ["overallRank", "offenseRank", "defenseRank", "projectedWins"] as const;

const ADVANTAGE_PHRASE: Record<string, string> = {
  overallRank: "the higher overall power rating",
  offenseRank: "the stronger offense",
  defenseRank: "the defensive advantage",
  projectedWins: "the higher model win projection",
};

export function deriveAdvantages(matchup: NflMatchup, rows?: MatchupComparisonRow[]): MatchupAdvantageNote[] {
  const comparisonRows = rows ?? buildComparisonRows(matchup);
  const byKey = new Map(comparisonRows.map((row) => [row.key, row]));
  const notes: MatchupAdvantageNote[] = [];

  for (const key of ADVANTAGE_ROW_KEYS) {
    const row = byKey.get(key);
    if (!row || (row.advantage !== "away" && row.advantage !== "home")) continue;
    const winner = row.advantage === "away" ? matchup.away : matchup.home;
    const winnerValue = row.advantage === "away" ? row.awayValue : row.homeValue;
    const loserValue = row.advantage === "away" ? row.homeValue : row.awayValue;
    notes.push({
      key,
      teamSlug: winner.slug,
      teamName: winner.teamName,
      text: `${winner.teamName} holds ${ADVANTAGE_PHRASE[key]}: ${winnerValue} versus ${loserValue}.`,
    });
    if (notes.length >= MAX_ADVANTAGE_NOTES) break;
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Angles to watch (rules-based, conservative)
// ---------------------------------------------------------------------------

export type AngleSeverity = "small" | "moderate" | "strong";

export type MatchupAngle = {
  key: string;
  label: string;
  explanation: string;
  /** Canonical slug of the team the angle favors, when applicable. */
  favoredSlug?: string;
  favoredName?: string;
  /** Metric keys the angle is derived from (for transparency). */
  sourceMetrics: string[];
  severity?: AngleSeverity;
};

// --- Documented thresholds ---------------------------------------------------

/** Offense-rating minus opponent defense-rating gap (pct points) to flag a mismatch. */
export const OFFENSE_DEFENSE_MISMATCH_PCT = 6;
/** Larger offense/defense gap that reads as a strong mismatch. */
export const OFFENSE_DEFENSE_STRONG_PCT = 12;
/** Overall power-rank separation to flag a moderate / strong power gap. */
export const POWER_GAP_RANK_MODERATE = 6;
export const POWER_GAP_RANK_STRONG = 12;
/** Projected-wins vs market-win-total gap (wins) that reads as a notable season lean. */
export const MODEL_MARKET_ANGLE_WINS = 1.0;
/** Schedule-rank separation (positions) worth noting as context. */
export const SCHEDULE_CONTEXT_RANK_GAP = 8;
/** Max angles surfaced. */
export const MAX_ANGLES = 6;

export const NO_ANGLE_MESSAGE = "No strong model-defined angle is available yet.";

function severityFromPct(gap: number): AngleSeverity {
  const abs = Math.abs(gap);
  if (abs >= OFFENSE_DEFENSE_STRONG_PCT) return "strong";
  return "moderate";
}

function offenseDefenseAngle(
  offenseTeam: NflMatchupTeam,
  defenseTeam: NflMatchupTeam,
  key: string
): MatchupAngle | null {
  if (offenseTeam.offensePct == null || defenseTeam.defensePct == null) return null;
  const edge = offenseTeam.offensePct - defenseTeam.defensePct;
  if (edge < OFFENSE_DEFENSE_MISMATCH_PCT) return null;
  return {
    key,
    label: `${offenseTeam.teamName} offense vs ${defenseTeam.teamName} defense`,
    explanation: `${offenseTeam.teamName}'s offense (${pct(offenseTeam.offensePct)}) rates well above ${defenseTeam.teamName}'s defense (${pct(defenseTeam.defensePct)}).`,
    favoredSlug: offenseTeam.slug,
    favoredName: offenseTeam.teamName,
    sourceMetrics: ["offenseRating", "defenseRating"],
    severity: severityFromPct(edge),
  };
}

function powerGapAngle(matchup: NflMatchup): MatchupAngle | null {
  const { away, home } = matchup;
  if (away.powerRank == null || home.powerRank == null) return null;
  const gap = Math.abs(away.powerRank - home.powerRank);
  if (gap < POWER_GAP_RANK_MODERATE) return null;
  const favored = away.powerRank < home.powerRank ? away : home;
  const other = favored === away ? home : away;
  return {
    key: "powerGap",
    label: "Overall power gap",
    explanation: `${favored.teamName} (#${favored.powerRank}) carries a clear power-rating edge over ${other.teamName} (#${other.powerRank}).`,
    favoredSlug: favored.slug,
    favoredName: favored.teamName,
    sourceMetrics: ["overallRank"],
    severity: gap >= POWER_GAP_RANK_STRONG ? "strong" : "moderate",
  };
}

function modelMarketAngle(team: NflMatchupTeam, key: string): MatchupAngle | null {
  if (team.projectedWins == null || team.marketWinTotal == null) return null;
  const gap = team.projectedWins - team.marketWinTotal;
  if (Math.abs(gap) < MODEL_MARKET_ANGLE_WINS) return null;
  const direction = gap > 0 ? "above" : "below";
  return {
    key,
    label: `${team.teamName} model-vs-market lean`,
    explanation: `The model projects ${team.teamName} ${formatSigned(gap)} wins ${direction} its market total (${wins(team.projectedWins)} vs ${wins(team.marketWinTotal)}).`,
    favoredSlug: team.slug,
    favoredName: team.teamName,
    sourceMetrics: ["projectedWins", "marketWinTotal"],
    severity: Math.abs(gap) >= MODEL_MARKET_ANGLE_WINS * 2 ? "strong" : "moderate",
  };
}

function regressionAngle(team: NflMatchupTeam, key: string): MatchupAngle | null {
  if (team.regressionSignal !== "Bounce Back" && team.regressionSignal !== "Regression") return null;
  const label = team.regressionSignal === "Bounce Back" ? "bounce-back" : "regression";
  return {
    key,
    label: `${team.teamName} ${label} watch`,
    explanation: `The guide flags ${team.teamName} as a ${label} candidate for 2026 (${formatSigned(team.regressionGap)} projected-win swing versus 2025).`,
    favoredSlug: team.regressionSignal === "Bounce Back" ? team.slug : undefined,
    favoredName: team.regressionSignal === "Bounce Back" ? team.teamName : undefined,
    sourceMetrics: ["regressionSignal"],
    severity: "small",
  };
}

function scheduleContextAngle(matchup: NflMatchup): MatchupAngle | null {
  const { away, home } = matchup;
  if (away.scheduleRank == null || home.scheduleRank == null) return null;
  const gap = Math.abs(away.scheduleRank - home.scheduleRank);
  if (gap < SCHEDULE_CONTEXT_RANK_GAP) return null;
  // Lower schedule rank = harder schedule. Context only — no favored team.
  const harder = away.scheduleRank < home.scheduleRank ? away : home;
  const easier = harder === away ? home : away;
  return {
    key: "scheduleContext",
    label: "Schedule strength context",
    explanation: `Season schedules differ: ${harder.teamName} (#${harder.scheduleRank}) faces a tougher slate than ${easier.teamName} (#${easier.scheduleRank}). Context only.`,
    sourceMetrics: ["scheduleRank"],
    severity: "small",
  };
}

function divisionAngle(matchup: NflMatchup): MatchupAngle | null {
  const { away, home } = matchup;
  if (away.division !== home.division) return null;
  return {
    key: "division",
    label: "Division matchup",
    explanation: `Both teams share the ${away.division} — a division game with standings and tiebreaker weight.`,
    sourceMetrics: ["division"],
    severity: "small",
  };
}

function conferenceAngle(matchup: NflMatchup): MatchupAngle {
  const { away, home } = matchup;
  const sameConf = away.conference === home.conference;
  return {
    key: "conference",
    label: sameConf ? `${away.conference} conference matchup` : "Interconference matchup",
    explanation: sameConf
      ? `An intra-${away.conference} game that can affect conference tiebreakers.`
      : `${away.conference} visits ${home.conference} in a cross-conference game.`,
    sourceMetrics: ["conference"],
  };
}

/**
 * Deterministic, conservative set of angles for a matchup.
 * Returns [] when nothing model-defined applies; consumers show NO_ANGLE_MESSAGE.
 */
export function deriveAngles(matchup: NflMatchup): MatchupAngle[] {
  const { away, home } = matchup;
  const candidates: (MatchupAngle | null)[] = [
    offenseDefenseAngle(away, home, "awayOffenseVsHomeDefense"),
    offenseDefenseAngle(home, away, "homeOffenseVsAwayDefense"),
    powerGapAngle(matchup),
    modelMarketAngle(away, "awayModelMarket"),
    modelMarketAngle(home, "homeModelMarket"),
    regressionAngle(away, "awayRegression"),
    regressionAngle(home, "homeRegression"),
    scheduleContextAngle(matchup),
    divisionAngle(matchup),
    conferenceAngle(matchup),
  ];

  const severityRank: Record<AngleSeverity, number> = { strong: 0, moderate: 1, small: 2 };
  const angles = candidates.filter((angle): angle is MatchupAngle => angle != null);

  // Stable ordering: by severity (strong first), context/undefined severity last,
  // preserving insertion order within a tier.
  const ordered = angles
    .map((angle, index) => ({ angle, index }))
    .sort((a, b) => {
      const sa = a.angle.severity ? severityRank[a.angle.severity] : 3;
      const sb = b.angle.severity ? severityRank[b.angle.severity] : 3;
      return sa - sb || a.index - b.index;
    })
    .map(({ angle }) => angle);

  return ordered.slice(0, MAX_ANGLES);
}
