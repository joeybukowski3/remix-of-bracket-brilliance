/**
 * License records per source. Change a record only with a signed agreement or
 * an explicit user decision, and cite it in `basis`. Holding an API key or a
 * subscription is not a license for every use.
 */
import { DATA_USES, type NbaSourceId, type SourceLicense } from "./types";

export const SOURCE_LICENSES: Readonly<Record<NbaSourceId, SourceLicense>> = Object.freeze({
  "stats.nba.com": {
    status: "restricted",
    permittedUses: [],
    basis:
      "NBA.com Terms of Use section 9 (private, non-commercial use only; read 2026-10-12) and user decision 2026-10-12: no development or evaluation use of local NBA.com data pending legal review",
    reviewedOn: "2026-10-12",
  },
  espn: {
    status: "unlicensed",
    permittedUses: ["private-research", "private-hosted"],
    basis:
      "Origin of hoopR's ESPN-derived datasets. Disney Terms of Use - United States, last updated May 24, 2024 (https://disneytermsofuse.com/english/): section 2.A personal, noncommercial license excluding AI training/validation; 2.B bars commercial use (viii) and automated extraction or scraping, including dataset building (x), without express written permission; 3.H bars commercial use unless expressly licensed. No ESPN-specific sports-data or API terms were found. No ESPN permission is on file. OWNER DECISION 2026-10-23 (task instruction to proceed with hoopR/ESPN as the NBA player-statistics source): private-research ONLY is recorded, for local and private analysis and preview. This is the owner's decision to use the data privately; it is NOT ESPN's permission and does not resolve the commercial or public reuse question. model-development, public-display and raw-redistribution stay unpermitted, so nothing derived from this source reaches the public board. Re-review before any publication. See docs/nba-espn-upstream-rights-review.md. OWNER AUTHORIZATION 2026-10-29 (owner-provided, final): the owner states they have permission to use the existing hoopR/ESPN-derived NBA statistics for their JoeKnowsBall hosted dashboard. This is the owner's own statement; no ESPN or SportsDataverse license, written permission or other document is on file and none is claimed here. Recorded as private-hosted ONLY: storing the statistics and the JKB projections built from them on the owner's Supabase/Vercel deployment and serving them to the authenticated owner. model-development, public-display and raw-redistribution stay unpermitted, so nothing derived from this source reaches the public board or any unauthenticated route.",
    reviewedOn: "2026-10-29",
  },
  "hoopr-espn": {
    status: "unlicensed",
    permittedUses: ["private-research", "private-hosted"],
    basis:
      "sportsdataverse hoopR-nba-data. LICENSE.md (read 2026-10-18) is CC BY 4.0 over the repository's 'data, code, and documentation' (commercial use and adaptation allowed with credit, a license link and a note of changes). It says nothing about ESPN or other upstream rights, the repository README labels the data 'source: ESPN', the plain LICENSE file is a two-line stub and GitHub reports NOASSERTION. A licensor can only license rights it holds, so the CC BY grant is recorded here but NOT applied as a basis for public use: model-development, public-display and raw-redistribution stay empty until written evidence of ESPN authority (or a counsel conclusion accepted by the user) is on file; see docs/nba-espn-upstream-rights-review.md. Attribution to hoopR (sportsdataverse, CC BY 4.0) and ESPN as the upstream source is kept wherever the data is used. Effective rights are in any case capped by the ESPN origin record. OWNER DECISION 2026-10-23 (task instruction to proceed with hoopR/ESPN as the NBA player-statistics source): private-research ONLY is recorded, for local and private analysis and preview. This is the owner's decision to use the data privately; it is NOT ESPN's permission and does not resolve the commercial or public reuse question. model-development, public-display and raw-redistribution stay unpermitted, so nothing derived from this source reaches the public board. Re-review before any publication. OWNER AUTHORIZATION 2026-10-29 (owner-provided, final): the owner states they have permission to use the existing hoopR/ESPN-derived NBA statistics for their JoeKnowsBall hosted dashboard. This is the owner's own statement; no ESPN or SportsDataverse license, written permission or other document is on file and none is claimed here. Recorded as private-hosted ONLY: storing the statistics and the JKB projections built from them on the owner's Supabase/Vercel deployment and serving them to the authenticated owner. model-development, public-display and raw-redistribution stay unpermitted, so nothing derived from this source reaches the public board or any unauthenticated route.",
    reviewedOn: "2026-10-29",
  },
  "llimllib-nba-data": {
    status: "restricted",
    permittedUses: [],
    basis:
      "llimllib/nba_data states no license for code or data, and its NBA tables are sourced from stats.nba.com, so the stats.nba.com record (NBA.com Terms section 9; user decision 2026-10-12) applies to every use.",
    reviewedOn: "2026-10-18",
  },
  thesportsdb: {
    status: "unlicensed",
    permittedUses: [],
    basis:
      "Free v1 key (30 requests/min). Terms of use were not retrieved (terms URL returned 502; /api.php does not state them), and no per-game player statistics endpoint is documented. No permission is assumed.",
    reviewedOn: "2026-10-18",
  },
  sportsdataio: {
    status: "unlicensed",
    permittedUses: [],
    basis: "No agreement. Published help page says commercial licenses can cover betting analytics and derived-output display, quoted per client.",
    reviewedOn: "2026-10-12",
  },
  balldontlie: {
    status: "unlicensed",
    permittedUses: [],
    basis:
      "No subscription or written confirmation. Terms (updated 2026-09-17) permit commercial use but disclaim third-party rights; re-read 2026-10-18: section 6 also permits analytics, wagering products and AI/ML training with no attribution, but forbids reselling raw data. Terms do not expand tier access, and game player stats need a paid tier, so nothing is permitted until a subscription and a recorded decision exist.",
    reviewedOn: "2026-10-18",
  },
  "api-sports-nba": {
    status: "unlicensed",
    permittedUses: [],
    basis:
      "Probe-only record (Phase 3B readiness Q7). API-Sports terms grant no publication license; private-evaluation permission and the free-plan season window are unverified. The 10-request coverage probe is gated by liveApproval on api-sports:nba, not by this record.",
    reviewedOn: "2026-10-13",
  },
  synthetic: {
    status: "synthetic",
    permittedUses: [...DATA_USES],
    basis: "Generated test data with invented ids and values",
    reviewedOn: "2026-10-12",
  },
});
