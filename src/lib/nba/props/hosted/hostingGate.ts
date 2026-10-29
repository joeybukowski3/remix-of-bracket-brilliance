/**
 * Decides how much of a private board may be stored on, and served from, the hosted site. Runs in the publish script
 * (never in the serverless function, which re-applies the stored tier through redact.ts).
 *
 * Logging in does not make a source hostable. A board may leave the owner's computer only as far as the license records say:
 *
 *  - Statistics (projections, season and last-ten rows, Defense vs. Position): the box-score source's EFFECTIVE uses, which
 *    include every origin's record (registry.ts), must contain `private-hosted`. This is stricter than the lines rule because
 *    the full board serves raw per-game rows, which `public-display` (derived outputs only) never covered. hoopR/ESPN holds
 *    `private-research` alone today, so this is closed until the owner records a decision or ESPN grants permission.
 *  - Lines (The Odds API): `private-hosted` too. The owner recorded it on 2026-10-29 after accepting the provider's current terms
 *    for displaying captured lines in the dashboard; `raw-redistribution` stays absent because nothing is resold, fed or
 *    bulk-downloadable. No other use stands in for it.
 *
 * Unknown source ids, a missing statistics source and a board with no line source all fail closed.
 */
import { ODDS_SOURCE_LICENSES } from "../pipeline/oddsSources";
import type { PropsBoardArtifact } from "../propsBoard";
import { SOURCE_LICENSES } from "../sources/licenses";
import { effectivePermittedUses } from "../sources/registry";
import type { DataUse, NbaSourceId, SourceLicense } from "../sources/types";
import type { HostedTier } from "./redact";

export interface SourceVerdict {
  sourceId: string;
  role: "lines" | "statistics";
  hostable: boolean;
  permittedUses: readonly DataUse[];
  why: string;
}

export interface HostingDecision {
  /** null: nothing may be hosted. */
  tier: HostedTier | null;
  verdicts: readonly SourceVerdict[];
  reason: string;
}

export interface GateLicenses {
  stats?: Readonly<Record<NbaSourceId, SourceLicense>>;
  odds?: Readonly<Record<string, SourceLicense>>;
}

const linesHostable = (uses: readonly DataUse[]): boolean => uses.includes("private-hosted");

function lineVerdict(sourceId: string, odds: Readonly<Record<string, SourceLicense>>): SourceVerdict {
  const license = odds[sourceId];
  if (!license) return { sourceId, role: "lines", hostable: false, permittedUses: [], why: "no license record for this line source" };
  const hostable = linesHostable(license.permittedUses);
  return { sourceId, role: "lines", hostable, permittedUses: license.permittedUses, why: hostable ? "private-hosted is recorded" : "private-hosted is not recorded" };
}

function statisticsVerdict(sourceId: string | null, licenses: Readonly<Record<NbaSourceId, SourceLicense>>): SourceVerdict {
  if (sourceId === null) return { sourceId: "none", role: "statistics", hostable: false, permittedUses: [], why: "the board names no statistics source, so its statistics cannot be attributed" };
  if (!Object.prototype.hasOwnProperty.call(licenses, sourceId)) return { sourceId, role: "statistics", hostable: false, permittedUses: [], why: "no license record for this statistics source" };
  const { permittedUses, chain } = effectivePermittedUses(sourceId as NbaSourceId, licenses);
  const hostable = permittedUses.includes("private-hosted");
  return { sourceId, role: "statistics", hostable, permittedUses, why: hostable ? `private-hosted is recorded through ${chain.join(" -> ")}` : `private-hosted is not recorded through ${chain.join(" -> ")}` };
}

export function decideHosting(board: PropsBoardArtifact, licenses: GateLicenses = {}): HostingDecision {
  const odds = licenses.odds ?? ODDS_SOURCE_LICENSES;
  const stats = licenses.stats ?? SOURCE_LICENSES;
  const lineSources = board.sources.lines;
  const lineVerdicts = lineSources.map((id) => lineVerdict(id, odds));
  const statVerdict = statisticsVerdict(board.sources.dvp, stats);
  const verdicts = [...lineVerdicts, statVerdict];
  if (lineVerdicts.length === 0 || !lineVerdicts.every((v) => v.hostable)) {
    return { tier: null, verdicts, reason: "the sportsbook line source is missing or not cleared for hosting; nothing is published" };
  }
  if (!statVerdict.hostable) return { tier: "lines-only", verdicts, reason: "statistics-derived fields stay local; only sportsbook lines are cleared" };
  return { tier: "full", verdicts, reason: "all sources are cleared for hosting" };
}
