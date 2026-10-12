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
  sportsdataio: {
    status: "unlicensed",
    permittedUses: [],
    basis: "No agreement. Published help page says commercial licenses can cover betting analytics and derived-output display, quoted per client.",
    reviewedOn: "2026-10-12",
  },
  balldontlie: {
    status: "unlicensed",
    permittedUses: [],
    basis: "No subscription or written confirmation. Terms (updated 2026-09-17) permit commercial use but disclaim third-party rights.",
    reviewedOn: "2026-10-12",
  },
  synthetic: {
    status: "synthetic",
    permittedUses: [...DATA_USES],
    basis: "Generated test data with invented ids and values",
    reviewedOn: "2026-10-12",
  },
});
