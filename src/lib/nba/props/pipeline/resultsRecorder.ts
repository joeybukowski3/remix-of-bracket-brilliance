/**
 * Records a final player result as a new revision, never over an old one.
 *
 * First sighting is revision 1. A later record that says something different
 * (a stat correction, a game going final, a DNP being confirmed) becomes the
 * next revision with a reason. A record that says the same thing is a no-op,
 * so re-running a settlement job or re-importing a file changes nothing.
 */
import { buildResult, playerKeyOf, resultSubstance, type NbaFinalResult, type ResultInput } from "./contracts";
import type { PipelineStore } from "./store";

export type ResultDraft = Omit<ResultInput, "revision" | "recordedAtUtc" | "correctionReason"> & { correctionReason: string | null };

export interface RecordOutcome {
  /** refused: the draft would move a settled result backwards without an explicit correction reason. */
  outcome: "inserted" | "unchanged" | "refused";
  result: NbaFinalResult;
}

const SETTLED_PARTICIPATION = new Set(["played", "dnp_confirmed", "inactive_confirmed"]);

export async function recordResultDraft(store: PipelineStore, draft: ResultDraft, recordedAtUtc: string): Promise<RecordOutcome> {
  const latest = await store.latestResult(draft.game.canonicalGameKey, playerKeyOf(draft.player));
  if (latest && resultSubstance(latest) === resultSubstance(draft)) return { outcome: "unchanged", result: latest };
  // A glitchy provider answer or a stray schedule flag must not turn a settled result back into a pending one.
  const regresses = latest !== null && ((latest.game.status === "final" && draft.game.status !== "final") || (SETTLED_PARTICIPATION.has(latest.participation) && draft.participation === "unverified_absent"));
  if (latest && regresses && !draft.correctionReason) return { outcome: "refused", result: latest };
  const revision = (latest?.revision ?? 0) + 1;
  const correctionReason = revision === 1 ? null : draft.correctionReason ?? `update from ${latest!.game.status}/${latest!.participation}`;
  const result = buildResult({ ...draft, revision, recordedAtUtc, correctionReason });
  await store.appendResult(result);
  return { outcome: "inserted", result };
}
