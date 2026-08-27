/**
 * Typed loader for the generated Draft Preview identity-correction artifact.
 * Produced by `scripts/audit-fantasy-draft-preview-identity.ts` (see
 * `docs/fantasy-draft-preview-identity-audit-2026.md` for the full 267-row
 * audit) -- this module never parses source data itself.
 *
 * Every entry here is a Sleeper Rank whose source `team` and/or
 * `sourcePosition` was confirmed stale against the canonical 2026 nflverse
 * roster snapshot (identity match, not guessed). Applying a correction only
 * ever changes DISPLAY team/position; the raw Sleeper `team`/
 * `sourcePosition` values on `DraftPreviewRow` are left untouched.
 */
import identityCorrectionsArtifact from "../../../../data/fantasy/draft-preview/2026-identity-corrections.json";

export type IdentityCorrection = {
  sleeperRank: number;
  player: string;
  sourceTeam: string | null;
  canonicalTeam: string | null;
  sourcePosition: string;
  canonicalPosition: string | null;
  classification: "B" | "C" | "D";
  reason: string;
};

type IdentityCorrectionsArtifact = {
  _meta: {
    schemaVersion: string;
    source: string;
    generatedBy: string;
    rowCount: number;
  };
  corrections: readonly IdentityCorrection[];
};

const ARTIFACT = identityCorrectionsArtifact as IdentityCorrectionsArtifact;

export const DRAFT_PREVIEW_IDENTITY_CORRECTIONS: readonly IdentityCorrection[] = ARTIFACT.corrections;

export const DRAFT_PREVIEW_IDENTITY_CORRECTIONS_BY_RANK: ReadonlyMap<number, IdentityCorrection> = new Map(
  DRAFT_PREVIEW_IDENTITY_CORRECTIONS.map((row) => [row.sleeperRank, row]),
);
