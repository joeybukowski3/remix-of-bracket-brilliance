/**
 * Decides how much of a board may be stored in the snapshot table and shown to every visitor of /nba/props. Runs in the
 * publish script (never in the serverless function, which re-applies the stored tier through redact.ts).
 *
 * This is a PUBLIC gate, and it is deliberately at least as strict as the existing public board builder
 * (`pipeline/boardBuild.ts`), which withholds statistics-derived outputs unless the source's effective rights include both
 * `model-development` and `public-display`. A recorded owner authorization for private hosting never opens it:
 *
 *  - Statistics (projections, season and per-minute stats, last-ten and box-score tables, Defense vs. Position): the box-score
 *    source's EFFECTIVE uses (its own record intersected with every origin's, registry.ts) must contain `public-display`,
 *    `model-development` (the builder's own rule) and `raw-redistribution` (the dashboard serves per-game rows, which the
 *    repository defines as source rows) and `private-hosted` (a copy is stored in the snapshot table). hoopR/ESPN records
 *    `private-research` and `private-hosted` only, so this is closed until the owner records a statement covering public display.
 *  - Lines (The Odds API): `public-display`. The provider's terms permit displaying its data in a website, including
 *    commercially, and forbid redistributing it as a standalone product, feed or API; `raw-redistribution` is therefore not
 *    required, and the snapshot endpoint exists only to render the page.
 *
 * Unknown source ids, a missing statistics source and a board with no line source all fail closed.
 */
import { ODDS_SOURCE_LICENSES } from "../pipeline/oddsSources";
import type { PropsBoardArtifact } from "../propsBoard";
import { SOURCE_LICENSES } from "../sources/licenses";
import { effectivePermittedUses } from "../sources/registry";
import type { DataUse, NbaSourceId, SourceLicense } from "../sources/types";
import type { HostedTier } from "./redact";

export const PUBLIC_STATISTICS_USES: readonly DataUse[] = ["public-display", "model-development", "raw-redistribution", "private-hosted"];
export const PUBLIC_LINES_USES: readonly DataUse[] = ["public-display"];

export interface SourceVerdict {
  sourceId: string;
  role: "lines" | "statistics";
  hostable: boolean;
  permittedUses: readonly DataUse[];
  why: string;
}

export interface HostingDecision {
  /** null: nothing may be published. */
  tier: HostedTier | null;
  verdicts: readonly SourceVerdict[];
  reason: string;
}

export interface GateLicenses {
  stats?: Readonly<Record<NbaSourceId, SourceLicense>>;
  odds?: Readonly<Record<string, SourceLicense>>;
}

const missing = (uses: readonly DataUse[], required: readonly DataUse[]): DataUse[] => required.filter((use) => !uses.includes(use));

function lineVerdict(sourceId: string, odds: Readonly<Record<string, SourceLicense>>): SourceVerdict {
  const license = odds[sourceId];
  if (!license) return { sourceId, role: "lines", hostable: false, permittedUses: [], why: "no license record for this line source" };
  const lacking = missing(license.permittedUses, PUBLIC_LINES_USES);
  return { sourceId, role: "lines", hostable: lacking.length === 0, permittedUses: license.permittedUses, why: lacking.length === 0 ? "public-display is recorded" : `not recorded: ${lacking.join(", ")}` };
}

function statisticsVerdict(sourceId: string | null, licenses: Readonly<Record<NbaSourceId, SourceLicense>>): SourceVerdict {
  if (sourceId === null) return { sourceId: "none", role: "statistics", hostable: false, permittedUses: [], why: "the board names no statistics source, so its statistics cannot be attributed" };
  if (!Object.prototype.hasOwnProperty.call(licenses, sourceId)) return { sourceId, role: "statistics", hostable: false, permittedUses: [], why: "no license record for this statistics source" };
  const { permittedUses, chain } = effectivePermittedUses(sourceId as NbaSourceId, licenses);
  const lacking = missing(permittedUses, PUBLIC_STATISTICS_USES);
  return {
    sourceId,
    role: "statistics",
    hostable: lacking.length === 0,
    permittedUses,
    why: lacking.length === 0 ? `all of ${PUBLIC_STATISTICS_USES.join(", ")} are recorded through ${chain.join(" -> ")}` : `not recorded through ${chain.join(" -> ")}: ${lacking.join(", ")}`,
  };
}

export function decideHosting(board: PropsBoardArtifact, licenses: GateLicenses = {}): HostingDecision {
  const odds = licenses.odds ?? ODDS_SOURCE_LICENSES;
  const stats = licenses.stats ?? SOURCE_LICENSES;
  const lineVerdicts = board.sources.lines.map((id) => lineVerdict(id, odds));
  const statVerdict = statisticsVerdict(board.sources.dvp, stats);
  const verdicts = [...lineVerdicts, statVerdict];
  if (lineVerdicts.length === 0 || !lineVerdicts.every((v) => v.hostable)) {
    return { tier: null, verdicts, reason: "the sportsbook line source is missing or not cleared for public display; nothing is published" };
  }
  if (!statVerdict.hostable) return { tier: "lines-only", verdicts, reason: "statistics-derived fields are withheld from the public board; only sportsbook lines are cleared" };
  return { tier: "full", verdicts, reason: "all sources are cleared for public display" };
}
