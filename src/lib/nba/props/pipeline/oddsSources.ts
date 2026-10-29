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
    permittedUses: ["private-research", "private-hosted", "model-development", "public-display"],
    basis:
      "Owner decisions 2026-10-20 and 2026-10-29, based on The Odds API Terms and Conditions (last updated 31 August 2026, re-read 2026-10-29, https://the-odds-api.com/terms-and-conditions.html). 2026-10-20: captured current odds may be stored indefinitely for private research, model development and prediction evaluation; derived statistics and projections may be displayed publicly. 2026-10-29: the owner accepted the provider's current terms for displaying captured sportsbook lines in the JoeKnowsBall dashboard (the terms list 'Displaying our data in a UI, website, or mobile app, including for commercial use' and 'Storing our data and retaining it indefinitely' as permitted), recorded as private-hosted for the owner-only hosted board, subject to the provider's restrictions: no reselling, repackaging or redistributing the data as a standalone data product, feed or API, and the data may not be the primary product sold (so raw-redistribution stays absent); the API key stays private. 2026-10-29 (later): the owner confirmed the dashboard is intended to be publicly accessible, so the same acceptance covers showing captured lines (bookmaker, line, Over/Under prices, timestamps) to visitors of the NBA props page, which is the use the provider's terms describe ('Displaying our data in a UI, website, or mobile app, including for commercial use'). The page's backing endpoint exists only to render that page and is not offered as a data feed. Conditions kept in code: every displayed line keeps its bookmaker and its capture and provider timestamps, stale lines are flagged, and no code path in the hosted board calls the provider. The provider says the user must independently verify accuracy. These decisions do not approve any live request or change the blocked shared quota account. The free Starter plan does not include the provider's historical odds API.",
    reviewedOn: "2026-10-29",
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
