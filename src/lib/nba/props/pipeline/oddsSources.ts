/**
 * Odds-source records for the NBA research pipeline.
 *
 * Same rule as the stat sources: nothing is permitted until a verified grant
 * or an explicit user decision is recorded, and a key or an account is not a
 * license. These records change only by such a decision.
 */
import { DATA_USES, type DataUse, type SourceLicense } from "../sources/types";
import type { CaptureMethod, OddsSourceId } from "./contracts";

export interface OddsSourceProfile {
  sourceId: OddsSourceId;
  label: string;
  method: CaptureMethod;
  /** Quota-manager account that must fund every live request; null for manual and synthetic sources. */
  quotaAccountId: string | null;
  /** Credits one capture costs per (market x region equivalent); null when the provider is not metered by credits. */
  creditsPerMarketRegion: number | null;
  /** Days a captured line may be kept, from the source's terms; null when no cap is recorded. */
  retentionCapDays: number | null;
}

export const ODDS_SOURCE_PROFILES: Readonly<Record<OddsSourceId, OddsSourceProfile>> = Object.freeze({
  "the-odds-api": { sourceId: "the-odds-api", label: "The Odds API (basketball_nba player props)", method: "api", quotaAccountId: "the-odds-api:unverified-pool", creditsPerMarketRegion: 1, retentionCapDays: null },
  parlayapi: { sourceId: "parlayapi", label: "ParlayAPI", method: "api", quotaAccountId: "parlayapi:primary", creditsPerMarketRegion: null, retentionCapDays: 90 },
  "manual-import": { sourceId: "manual-import", label: "Manual CSV import", method: "manual-import", quotaAccountId: null, creditsPerMarketRegion: null, retentionCapDays: null },
  "synthetic-odds": { sourceId: "synthetic-odds", label: "Synthetic test lines", method: "synthetic", quotaAccountId: null, creditsPerMarketRegion: null, retentionCapDays: null },
});

export const ODDS_SOURCE_LICENSES: Readonly<Record<OddsSourceId, SourceLicense>> = Object.freeze({
  "the-odds-api": {
    status: "restricted",
    permittedUses: ["private-research", "model-development", "public-display"],
    basis:
      "Owner decision 2026-10-20, based on The Odds API Terms and Conditions (updated 2026-08-31, https://the-odds-api.com/terms-and-conditions.html): captured current odds may be stored indefinitely for private research, model development and prediction evaluation; derived statistics and projections may be displayed publicly. Raw-data resale, standalone feeds/APIs and downloadable raw odds remain prohibited. This source-use decision does not approve any live request or change the blocked shared quota account. The free Starter plan does not include the provider's historical odds API.",
    reviewedOn: "2026-10-20",
  },
  parlayapi: {
    status: "restricted",
    permittedUses: [],
    basis:
      "ParlayAPI Terms (2026-09-30) s4.1: free access is personal evaluation and non-commercial research only; s4.2(f): no public or customer-facing product, including derived insights, without a signed agreement; s4.2(c): 90-day cap on stored line-level prices. Registered as blocked for new JKB consumers in api-quota/accounts.ts.",
    reviewedOn: "2026-10-19",
  },
  "manual-import": {
    status: "unlicensed",
    permittedUses: [],
    basis:
      "Rights depend on where each batch came from. A batch carries its own attestation (who, when, origin, which uses); it can grant at most what it attests, defaults to private research, and never grants raw redistribution.",
    reviewedOn: "2026-10-19",
  },
  "synthetic-odds": { status: "synthetic", permittedUses: [...DATA_USES], basis: "Generated test lines with invented values", reviewedOn: "2026-10-19" },
});

/** Uses a manual batch may attest. Raw redistribution is never attestable. */
export const ATTESTABLE_USES: readonly DataUse[] = ["private-research", "model-development", "public-display"];

export function assertAttestableUses(uses: readonly DataUse[]): void {
  const bad = uses.filter((use) => !ATTESTABLE_USES.includes(use));
  if (bad.length > 0) throw new Error(`Manual batches cannot attest ${bad.join(", ")}`);
}

/** Uses permitted for data from an API source: exactly what its record says. */
export const apiPermittedUses = (sourceId: OddsSourceId, licenses: Readonly<Record<OddsSourceId, SourceLicense>> = ODDS_SOURCE_LICENSES): readonly DataUse[] =>
  licenses[sourceId].permittedUses;
