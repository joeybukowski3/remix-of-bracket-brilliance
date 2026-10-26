/**
 * Types and constants for the Wikidata five-position feasibility audit.
 *
 * Wikidata is deliberately NOT in the source registry or the license table: it is
 * CC0 reference data used only to propose position labels (v1/positionMapper.ts),
 * joined to hoopR players by the ESPN athlete id.
 */
import type { DvpPosition } from "../../dvpPositions";

export const SNAPSHOT_SCHEMA_VERSION = "wikidata-positions-snapshot-v1";

/** Stable id schemes a roster can carry; each maps to one Wikidata external-id property. */
export const ID_SCHEMES = ["espn", "nba-com", "bbref"] as const;
export type IdScheme = (typeof ID_SCHEMES)[number];

export const ID_PROPERTY: Readonly<Record<IdScheme, string>> = Object.freeze({
  espn: "P3685",
  "nba-com": "P3647",
  bbref: "P2685",
});

/** Code-unit order: locale-dependent collation could order ids differently across Node builds. */
export const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const POSITION_PROPERTY = "P413";
export const TEAM_MEMBERSHIP_PROPERTY = "P54";

/**
 * Basketball position items, keyed by QID. Matching is by QID only: Wikidata
 * also has a "center" and a "guard" that are American-football positions.
 */
export const FIVE_POSITION_QIDS: Readonly<Record<string, DvpPosition>> = Object.freeze({
  Q212413: "PG",
  Q273199: "SG",
  Q308879: "SF",
  Q462471: "PF",
  Q222052: "C",
});

/** Basketball positions that are not one of the five (generic or hybrid). Never expanded into the five. */
export const OTHER_BASKETBALL_POSITION_QIDS: Readonly<Record<string, string>> = Object.freeze({
  Q10498241: "forward",
  Q798373: "guard",
  Q2302133: "swingman",
  Q1607137: "point forward",
  Q1113709: "combo guard",
  Q1439280: "forward center",
  Q17094372: "stretch four",
});

/** Expected English labels per position QID, checked against the live vocabulary on every probe. */
export const EXPECTED_ENTITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  P3685: "ESPN.com NBA player ID",
  P3647: "NBA.com player ID",
  P2685: "Basketball Reference NBA player ID",
  P413: "position played on team / speciality",
  P54: "member of sports team",
  Q212413: "point guard",
  Q273199: "shooting guard",
  Q308879: "small forward",
  Q462471: "power forward",
  Q222052: "center",
});

/** Wikidata item for the NBA, and the class used to find current franchises. */
export const NBA_LEAGUE_QID = "Q155223";
export const BASKETBALL_TEAM_CLASS_QID = "Q13393265";

export const WIKIDATA_LICENSE = Object.freeze({
  spdx: "CC0-1.0",
  basis:
    "Wikidata:Licensing (https://www.wikidata.org/wiki/Wikidata:Licensing, read 2026-10-23): structured data in the main, Property, Lexeme and EntitySchema namespaces is released under CC0. The page states no attribution requirement and says additional terms may apply; statement values copied from third-party sites are not independently verified.",
  reviewedOn: "2026-10-23",
});

export type StatementRank = "preferred" | "normal" | "deprecated";

export interface WikidataIdValue {
  value: string;
  rank: StatementRank;
}

export interface WikidataReference {
  /** Stated-in or imported-from item (for example a Wikipedia edition), when the reference names one. */
  sourceQid: string | null;
  /** Host of a reference URL, when the reference has one. */
  sourceHost: string | null;
  /** "Retrieved" date, YYYY-MM-DD, when the reference has one. */
  retrievedOn: string | null;
}

export interface WikidataSeasonQualifier {
  qid: string;
  label: string | null;
}

/** All qualifier values of a statement, kept as sorted sets: row order in a SPARQL result is unspecified. */
export interface WikidataStatementQualifiers {
  /** Season items (property P3450). */
  seasons: WikidataSeasonQualifier[];
  /** Team items (property P54). */
  teamQids: string[];
  /** Earliest start and latest end time, YYYY-MM-DD. */
  start: string | null;
  end: string | null;
}

export interface WikidataPositionStatement {
  statementId: string;
  positionQid: string;
  rank: StatementRank;
  references: WikidataReference[];
  qualifiers: WikidataStatementQualifiers;
}

export interface WikidataTeamMembership {
  teamQid: string;
  start: string | null;
}

export interface WikidataPlayerRecord {
  qid: string;
  label: string | null;
  ids: Record<IdScheme, WikidataIdValue[]>;
  positions: WikidataPositionStatement[];
  /** Memberships of a current NBA franchise with no end time. Undated entries are common and do not mean "active". */
  openTeamMemberships: WikidataTeamMembership[];
  modifiedAtUtc: string | null;
}

export interface RequestRecord {
  queryId: string;
  queryHash: string;
  status: number;
  rows: number;
  bytes: number;
  elapsedMs: number;
  startedAtUtc: string;
}

export interface SnapshotProvenance {
  endpoint: string;
  retrievedAtUtc: string;
  userAgent: string;
  requests: RequestRecord[];
  license: typeof WIKIDATA_LICENSE;
  /** Set when the run was limited to explicit items (fixture recording); such a snapshot is not the population. */
  restrictedToItems: string[] | null;
  /** Checks of the live vocabulary against EXPECTED_ENTITY_LABELS; empty when everything matched. */
  vocabularyIssues: string[];
}

export interface WikidataPositionSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  provenance: SnapshotProvenance;
  players: WikidataPlayerRecord[];
}

/** A SPARQL JSON result set (application/sparql-results+json). */
export interface SparqlJson {
  head?: { vars?: string[] };
  results: { bindings: Record<string, { type: string; value: string } | undefined>[] };
}
