import { loadRushingShadowModel, type NflRushingShadowModel } from "./rushingShadowArtifact";

/**
 * WU4D.3 — mirrors `resolveReceivingV2ProductionModel.ts` exactly: pure
 * resolution step, no filesystem I/O (callers read the artifact JSON
 * themselves), trivially testable against the exact hosted-runner
 * condition (compact artifact present, 34MB research dataset never
 * referenced). Fail-closed: any load error returns `{ ok: false }` rather
 * than throwing, so a caller can implement the WU4D.3 §10 failure policy
 * (permit production, mark shadow diagnostics unavailable) without a
 * try/catch at every call site.
 */
export type NflRushingShadowResolution =
  | { ok: true; model: NflRushingShadowModel }
  | { ok: false; reason: string };

export function resolveRushingShadowModel(artifactJson: unknown): NflRushingShadowResolution {
  try {
    return { ok: true, model: loadRushingShadowModel(artifactJson) };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
