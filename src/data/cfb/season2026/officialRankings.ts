import generated from "../../../../data/generated/cfb/2026-rankings.json";

/**
 * Official 2026 poll rankings (AP / CFP) as ingested from the CFBD `/rankings`
 * endpoint by `npm run cfb:refresh-rankings`.
 *
 * These are OFFICIAL polls only — never a JKB model output. When a poll has not
 * been published (or ingestion has never run), its entry is `null` and every
 * team is officially unranked; the UI then falls back to a clearly-labeled JKB
 * rank. Teams merely receiving votes are NOT given a numeric rank, and nothing
 * is ever assigned a rank of 26 or higher.
 *
 * Do not hand-edit the underlying artifact.
 */

export type CfbOfficialPollArtifact = {
  /** Poll name exactly as published by the source, e.g. "AP Top 25". */
  pollName: string;
  seasonType: string;
  week: number;
  /** JKB team id -> official rank (1-25). */
  ranks: Readonly<Record<string, number>>;
};

export type CfbOfficialRankingsArtifact = {
  season: number;
  source: string;
  /** Generation timestamp, or null when never generated. Never a fabricated publication date. */
  generatedAt: string | null;
  polls: {
    ap: CfbOfficialPollArtifact | null;
    cfp: CfbOfficialPollArtifact | null;
  };
};

const artifact = generated as CfbOfficialRankingsArtifact;

export const CFB_OFFICIAL_RANKINGS_2026: CfbOfficialRankingsArtifact = artifact;

/** Null when the AP poll has not been published/ingested. */
export const CFB_AP_POLL_2026: CfbOfficialPollArtifact | null = artifact.polls.ap ?? null;

/**
 * Null until the CFP selection committee publishes its first rankings of the
 * season. This being null is a normal in-season state, not a failure.
 */
export const CFB_CFP_POLL_2026: CfbOfficialPollArtifact | null = artifact.polls.cfp ?? null;

export const CFB_AP_RANKS_2026: Readonly<Partial<Record<string, number>>> = Object.freeze({
  ...(CFB_AP_POLL_2026?.ranks ?? {}),
});

export const CFB_CFP_RANKS_2026: Readonly<Partial<Record<string, number>>> = Object.freeze({
  ...(CFB_CFP_POLL_2026?.ranks ?? {}),
});

/** True once a real CFP poll exists — the single switch that flips CFP ahead of AP. */
export const CFB_IS_CFP_POLL_ACTIVE: boolean =
  CFB_CFP_POLL_2026 !== null && Object.keys(CFB_CFP_RANKS_2026).length > 0;
