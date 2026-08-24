// CFB Model V2 — cross-artifact shadow-state validation (WU4 §5/§9/§14).
// Validates ratings and projections TOGETHER, plus support-artifact
// provenance, before a shadow state is allowed to publish. Fails closed —
// every check throws CfbV2ShadowValidationError rather than silently
// degrading. Zero research runtime dependency.

import { CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION, CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION } from "./scoringSupportTypes";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import type { CfbV2ArtifactEnvelope } from "./artifactContracts";
import type { CfbV2GameProjection, CfbV2TeamRating } from "./types";

export class CfbV2ShadowValidationError extends Error {}

export type CfbV2ShadowCompatibilityInput = {
  ratingArtifact: CfbV2ArtifactEnvelope<CfbV2TeamRating>;
  projectionArtifact: CfbV2ArtifactEnvelope<CfbV2GameProjection>;
  scoringSupportArtifact: CfbV2ScoringNormalEquationsArtifact;
  calibrationSupportArtifact: CfbV2CalibrationResidualSeedArtifact;
  expectedConfigVersion: string;
};

/**
 * §5 — cross-artifact validation. Ratings and projections are validated
 * TOGETHER here (each artifact's own internal shape is already checked by
 * ratingValidation.ts/projectionValidation.ts before this runs — this
 * module only checks the *relationship* between the two artifacts, plus
 * their shared support-artifact provenance).
 */
export function validateCfbV2ArtifactCompatibility(input: CfbV2ShadowCompatibilityInput): void {
  const { ratingArtifact, projectionArtifact, scoringSupportArtifact, calibrationSupportArtifact, expectedConfigVersion } = input;

  // D. same season.
  if (ratingArtifact.season !== projectionArtifact.season) {
    throw new CfbV2ShadowValidationError(`season mismatch: ratings season ${ratingArtifact.season} vs projections season ${projectionArtifact.season}`);
  }

  // B/§19 — compatible dataAsOf: a projection must never be built from a
  // rating state that is chronologically AFTER the projection's own cutoff
  // (that would mean the projection used ratings info not yet available at
  // its own claimed as-of point). Equal dataAsOf is the expected case for a
  // single coherent build; a rating dataAsOf strictly before the projection's
  // is also compatible (ratings frozen earlier, reused for a later cutoff)
  // but a rating dataAsOf strictly AFTER the projection's is stale-in-reverse
  // and must fail closed.
  const ratingAsOf = Date.parse(ratingArtifact.dataAsOf);
  const projectionAsOf = Date.parse(projectionArtifact.dataAsOf);
  if (Number.isNaN(ratingAsOf) || Number.isNaN(projectionAsOf)) {
    throw new CfbV2ShadowValidationError(`unparseable dataAsOf: ratings=${ratingArtifact.dataAsOf} projections=${projectionArtifact.dataAsOf}`);
  }
  if (ratingAsOf > projectionAsOf) {
    throw new CfbV2ShadowValidationError(
      `projections built from a future rating state: ratings dataAsOf (${ratingArtifact.dataAsOf}) is after projections dataAsOf (${projectionArtifact.dataAsOf})`,
    );
  }

  // C. same model/config version — both artifacts, and the live running config.
  if (ratingArtifact.configVersion !== projectionArtifact.configVersion) {
    throw new CfbV2ShadowValidationError(`configVersion mismatch between ratings (${ratingArtifact.configVersion}) and projections (${projectionArtifact.configVersion})`);
  }
  if (ratingArtifact.configVersion !== expectedConfigVersion) {
    throw new CfbV2ShadowValidationError(`configVersion (${ratingArtifact.configVersion}) does not match the live running production config (${expectedConfigVersion}) — artifact is stale`);
  }

  // G. support artifact versions match expected frozen versions.
  if (scoringSupportArtifact.artifactVersion !== CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION) {
    throw new CfbV2ShadowValidationError(`scoring support artifactVersion mismatch: expected ${CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION}, got ${scoringSupportArtifact.artifactVersion}`);
  }
  if (calibrationSupportArtifact.artifactVersion !== CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION) {
    throw new CfbV2ShadowValidationError(`calibration support artifactVersion mismatch: expected ${CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION}, got ${calibrationSupportArtifact.artifactVersion}`);
  }
  if (scoringSupportArtifact.configVersion !== expectedConfigVersion) {
    throw new CfbV2ShadowValidationError(`scoring support configVersion (${scoringSupportArtifact.configVersion}) does not match the live running production config (${expectedConfigVersion})`);
  }
  if (calibrationSupportArtifact.configVersion !== expectedConfigVersion) {
    throw new CfbV2ShadowValidationError(`calibration support configVersion (${calibrationSupportArtifact.configVersion}) does not match the live running production config (${expectedConfigVersion})`);
  }

  // F. no duplicate game IDs.
  const seenGameIds = new Set<string>();
  for (const p of projectionArtifact.records) {
    if (seenGameIds.has(p.gameId)) throw new CfbV2ShadowValidationError(`duplicate projection gameId: ${p.gameId}`);
    seenGameIds.add(p.gameId);
  }

  // no duplicate team IDs in ratings.
  const seenTeamIds = new Set<string>();
  for (const r of ratingArtifact.records) {
    if (seenTeamIds.has(r.teamId)) throw new CfbV2ShadowValidationError(`duplicate rating teamId: ${r.teamId}`);
    seenTeamIds.add(r.teamId);
  }

  // E. every supported (fbs_vs_fbs) projection team exists in ratings —
  // this covers "no projection references stale/missing ratings" for the
  // one matchup population where a rating is actually required.
  const ratingTeamIds = new Set(ratingArtifact.records.map((r) => r.teamId));
  for (const p of projectionArtifact.records) {
    if (p.matchupPopulation !== "fbs_vs_fbs") continue;
    if (!ratingTeamIds.has(p.homeTeamId)) throw new CfbV2ShadowValidationError(`projection ${p.gameId} references home team ${p.homeTeamId} with no matching rating`);
    if (!ratingTeamIds.has(p.awayTeamId)) throw new CfbV2ShadowValidationError(`projection ${p.gameId} references away team ${p.awayTeamId} with no matching rating`);
  }
}

/**
 * §9/§23 — the single publish gate. If this does not throw, the shadow
 * state is structurally sound and safe to promote (§4 atomic promotion is a
 * separate concern, handled by shadowPublish.ts, but nothing may be
 * promoted without first passing this).
 */
export function assertPublishableCfbV2Shadow(input: CfbV2ShadowCompatibilityInput): void {
  validateCfbV2ArtifactCompatibility(input);
}
