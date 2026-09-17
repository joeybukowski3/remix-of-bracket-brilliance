/**
 * WU3.2 -- mechanical (not model-judged) classification of how a side/total
 * opinion changed between two snapshots. This answers the structural
 * question ("did the lean change, did confidence move, did it flip to/from
 * pass") purely from the two SideOpinionState/TotalOpinionState values --
 * never the football "why", which stays a model-generated explanation field
 * on SideAssessment/TotalAssessment (nfl-snapshot-types.ts).
 *
 * "none" (no change at all) is a fully valid, expected result -- see the
 * architecture doc's "NO-CHANGE IS VALID" requirement. Nothing here treats
 * an unchanged lean as an error or an incomplete run.
 */

import type { SideChangeKind, SideOpinionState, TotalChangeKind, TotalOpinionState } from "./nfl-snapshot-types";

export function classifySideOpinionChange(previous: SideOpinionState, current: SideOpinionState): SideChangeKind {
  if (previous.lean === current.lean) {
    if (previous.confidence == null || current.confidence == null || previous.confidence === current.confidence) return "none";
    return current.confidence > previous.confidence ? "strengthened" : "weakened";
  }

  if (current.lean === "pass" && previous.lean !== "pass") return "moved_to_pass";
  if (previous.lean === "pass" && current.lean !== "pass") return "pass_to_play";
  // Includes "undecided" transitions in either direction alongside a genuine home<->away flip -- all are a change of side, not a confidence move.
  return "changed_side";
}

export function classifyTotalOpinionChange(previous: TotalOpinionState, current: TotalOpinionState): TotalChangeKind {
  if (previous.lean === current.lean) {
    if (previous.confidence == null || current.confidence == null || previous.confidence === current.confidence) return "none";
    return current.confidence > previous.confidence ? "strengthened" : "weakened";
  }

  if (current.lean === "pass" && previous.lean !== "pass") return "moved_to_pass";
  if (previous.lean === "pass" && current.lean !== "pass") return "pass_to_play";
  return "changed_total";
}
