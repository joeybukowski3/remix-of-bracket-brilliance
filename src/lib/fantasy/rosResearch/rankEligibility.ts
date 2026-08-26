/**
 * ROS projection authority -- Phase 3C rank-eligibility layer.
 *
 * Separates "is there a diagnostic projection for this player" from "should
 * this player appear in the SHADOW-only Model Rank / position rank." Status
 * NEVER scales, penalizes, or withholds a candidate's projectedPpg -- that is
 * the explicit rule this module exists to enforce (see `isProjectionEligible`
 * and the Phase 3B `STATUS_PROJECTION_MODIFIER`, which this module does not
 * use). Eligibility for the SHADOW rank is instead an explicit, literal
 * decision recorded in `rankEligible`/`rankEligibilityReason`.
 *
 * This module also produces a normalized 7-category availability status
 * (ACTIVE/RESERVE/INJURED/SUSPENDED/RELEASED/FREE_AGENT/UNKNOWN) from the
 * existing Phase 3B `StatusCategory` (nflverse-derived) plus one additional
 * literal signal already present in this repo: the live PAR-consensus
 * source's `Team` field, which uses the explicit code "FA" for free agents
 * (`data/fantasy/2026-par-consensus.json`; verified: 15/587 rows use this
 * exact code). No fuzzy matching, no invented thresholds -- every mapping
 * below is an exact string/category match.
 */
import { normalizeNflTeamAbbr } from "@/lib/fantasy/weekly/identity";
import type { StatusCategory } from "@/lib/fantasy/rosResearch/statusAvailability";

export const RANK_ELIGIBILITY_SCHEMA_VERSION = "ros-rank-eligibility-v1" as const;

export type NormalizedAvailabilityStatus =
  | "ACTIVE"
  | "RESERVE"
  | "INJURED"
  | "SUSPENDED"
  | "RELEASED"
  | "FREE_AGENT"
  | "UNKNOWN";

export type AvailabilitySource = "current-season-roster" | "master-player-table" | "par-consensus-team" | "none";
export type AvailabilityConfidence = "current" | "stale" | "unknown";

/**
 * INJURED is deliberately never emitted. This repo already documents (see
 * `src/lib/nfl/injuryData.ts`: "nflverse publishes no authoritative
 * dictionary for its RES/* sub-codes, so IR, PUP and NFI are not
 * distinguished here") that PUP/IR-style injury reserve cannot be reliably
 * separated from general roster reserve without guessing. Consistent with
 * that existing, reviewed precedent, PUP/RES fold into RESERVE here too.
 *
 * RET (retired) and DEV (practice-squad) both collapse into the Phase 3B
 * "otherUnavailable" bucket. The Phase 3C enum has no RETIRED or
 * PRACTICE_SQUAD category, so each is mapped deterministically by its raw
 * code rather than guessed as a group: DEV means "still rostered, just not
 * on the active game-day roster," the closest fit is RESERVE; RET (no longer
 * playing) fits none of the seven categories and is left UNKNOWN rather than
 * forced into one.
 */
export function normalizeAvailabilityStatus(rawCode: string | null, category: StatusCategory): NormalizedAvailabilityStatus {
  switch (category) {
    case "active": return "ACTIVE";
    case "reserve": return "RESERVE";
    case "released": return "RELEASED";
    case "suspended": return "SUSPENDED";
    case "otherUnavailable": return rawCode === "DEV" ? "RESERVE" : "UNKNOWN";
    case "unknown":
    default: return "UNKNOWN";
  }
}

export function deriveAvailabilityConfidence(source: AvailabilitySource): AvailabilityConfidence {
  if (source === "current-season-roster") return "current";
  if (source === "none") return "unknown";
  return "stale"; // master-player-table and par-consensus-team are both non-season-specific/older signals.
}

/**
 * True only when a genuinely current, season-specific signal confirms the
 * player is on a 2026 team roster right now:
 *   (a) the current-season roster snapshot itself reports "active", or
 *   (b) two independently-sourced live signals -- the JKB workbook's own
 *       `team` field and the live PAR-consensus `Team` field -- agree on the
 *       same real team (after exact, reviewed abbreviation normalization via
 *       `normalizeNflTeamAbbr`; e.g. "wsh" == "WAS"), and PAR's team is not
 *       the literal "FA" free-agent code.
 * Otherwise false, regardless of what the (possibly stale) nflverse master
 * table's status category says.
 */
export function determineCurrentRosterVerified(input: {
  verifiedByCurrentSeasonRoster: boolean;
  workbookTeam: string | null;
  parTeam: string | null;
}): boolean {
  if (input.verifiedByCurrentSeasonRoster) return true;
  if (!input.workbookTeam || !input.parTeam) return false;
  if (input.parTeam.toUpperCase() === "FA") return false;
  return normalizeNflTeamAbbr(input.workbookTeam) === normalizeNflTeamAbbr(input.parTeam);
}

export type NormalizedAvailability = {
  availabilityStatus: NormalizedAvailabilityStatus;
  availabilitySource: AvailabilitySource;
  availabilityAsOf: string | null;
  availabilityConfidence: AvailabilityConfidence;
  currentRosterVerified: boolean;
  statusConflict: boolean;
  statusConflictReason: string | null;
  underlyingRosterStatus: { category: StatusCategory; rawCode: string | null; source: string; asOf: string | null };
  parTeam: string | null;
  workbookTeam: string | null;
};

/**
 * Combines the Phase 3B nflverse-derived status with the PAR-consensus team
 * signal. The PAR "FA" code only ever ESCALATES a category that is already
 * ambiguous about current-team attachment (nflverse "reserve"/"unknown") into
 * the more specific FREE_AGENT category -- it never overrides a decisive
 * nflverse signal (active/released/suspended), because PAR-consensus is the
 * stalest of the three sources by commit date (2026-08-13, vs. the master
 * table's 2026-08-21 and the Week 1 roster's 2026-08-22) and should not
 * silently outrank fresher, more specific data.
 */
export function buildNormalizedAvailability(input: {
  status: { category: StatusCategory; rawCode: string | null; source: string; asOf: string | null };
  parTeam: string | null;
  parTeamAsOf: string | null;
  workbookTeam: string | null;
}): NormalizedAvailability {
  const { status, parTeam, parTeamAsOf, workbookTeam } = input;
  const isFreeAgentSignal = parTeam != null && parTeam.toUpperCase() === "FA";
  const escalateToFreeAgent = isFreeAgentSignal && (status.category === "reserve" || status.category === "unknown");

  const availabilityStatus: NormalizedAvailabilityStatus = escalateToFreeAgent
    ? "FREE_AGENT"
    : normalizeAvailabilityStatus(status.rawCode, status.category);
  const availabilitySource: AvailabilitySource = escalateToFreeAgent
    ? "par-consensus-team"
    : (status.source as AvailabilitySource);
  const availabilityAsOf = escalateToFreeAgent ? parTeamAsOf : status.asOf;

  const verifiedByCurrentSeasonRoster = status.source === "current-season-roster" && status.category === "active";
  const currentRosterVerified = determineCurrentRosterVerified({ verifiedByCurrentSeasonRoster, workbookTeam, parTeam });

  // A player nflverse marks decisively unavailable (released/suspended) but
  // whom two independent live sources still verify on a current team is a
  // genuine, real disagreement between authorities -- surfaced explicitly
  // rather than silently resolved in either direction.
  const statusConflict = (status.category === "released" || status.category === "suspended") && currentRosterVerified;
  const statusConflictReason = statusConflict
    ? `nflverse ${status.source} reports "${status.category}" (rawCode ${status.rawCode ?? "null"}, asOf ${status.asOf ?? "unknown"}), but the JKB workbook team ("${workbookTeam}") and PAR-consensus team ("${parTeam}") independently agree the player is still attached to a current team.`
    : null;

  return {
    availabilityStatus,
    availabilitySource,
    availabilityAsOf,
    availabilityConfidence: deriveAvailabilityConfidence(availabilitySource),
    currentRosterVerified,
    statusConflict,
    statusConflictReason,
    underlyingRosterStatus: { category: status.category, rawCode: status.rawCode, source: status.source, asOf: status.asOf },
    parTeam,
    workbookTeam,
  };
}

// ---------------------------------------------------------------------------
// Rank-eligibility policies (R1-R3)
// ---------------------------------------------------------------------------

export type EligibilityPolicyId = "R1" | "R2" | "R3";
export const ELIGIBILITY_POLICY_IDS: readonly EligibilityPolicyId[] = ["R1", "R2", "R3"];

export const ELIGIBILITY_POLICY_LABELS: Record<EligibilityPolicyId, string> = {
  R1: "Exclude only confirmed RELEASED from the SHADOW Model Rank / position rank.",
  R2: "Exclude RELEASED + confirmed FREE_AGENT.",
  R3: "Exclude RELEASED + FREE_AGENT + any player without a verified current 2026 roster attachment (currentRosterVerified === false), regardless of their normalized status category.",
};

export type RankEligibilityResult = { rankEligible: boolean; rankEligibilityReason: string | null };

/** Pure policy evaluation. Never reads or writes projectedPpg -- rank eligibility and projection availability are deliberately independent. */
export function evaluateRankEligibility(
  policy: EligibilityPolicyId,
  availabilityStatus: NormalizedAvailabilityStatus,
  currentRosterVerified: boolean,
): RankEligibilityResult {
  const isReleased = availabilityStatus === "RELEASED";
  const isFreeAgent = availabilityStatus === "FREE_AGENT";

  if (isReleased) return { rankEligible: false, rankEligibilityReason: `confirmed released (excluded under ${policy})` };
  if (policy === "R1") return { rankEligible: true, rankEligibilityReason: null };

  if (isFreeAgent) return { rankEligible: false, rankEligibilityReason: `confirmed free agent (excluded under ${policy})` };
  if (policy === "R2") return { rankEligible: true, rankEligibilityReason: null };

  // R3
  if (!currentRosterVerified) {
    return { rankEligible: false, rankEligibilityReason: "no verified current 2026 roster attachment (excluded under R3)" };
  }
  return { rankEligible: true, rankEligibilityReason: null };
}

/** A candidate retains a diagnostic projection whenever it has a computed PPG at all -- independent of status/rank eligibility, per the "no status-based PPG penalty" rule. */
export function isProjectionEligible(projectedPpg: number | null): boolean {
  return projectedPpg != null;
}
