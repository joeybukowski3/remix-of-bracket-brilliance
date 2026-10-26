/**
 * SPARQL queries for the Wikidata position probe. Read-only SELECTs against the
 * public query service; every query carries a LIMIT, and the whole probe is
 * capped by PROBE_LIMITS (see wikidataProbe.ts).
 */
import {
  BASKETBALL_TEAM_CLASS_QID,
  EXPECTED_ENTITY_LABELS,
  ID_PROPERTY,
  ID_SCHEMES,
  NBA_LEAGUE_QID,
  POSITION_PROPERTY,
  TEAM_MEMBERSHIP_PROPERTY,
} from "./wikidataTypes";

export const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * Wikidata Query Service limits (https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual, read
 * 2026-10-23): 60 s per query, 60 s of processing per client per 60 s, at most 5 parallel queries per IP, HTTP 429
 * with Retry-After when over, and bans for clients that keep sending after a 429. The probe is serial, spaced, and
 * stops at the first 429 instead of retrying.
 */
export const PROBE_LIMITS = Object.freeze({
  maxRequests: 10,
  minIntervalMs: 5_000,
  requestTimeoutMs: 65_000,
  maxRowsPerQuery: 30_000,
  maxResponseBytes: 30 * 1024 * 1024,
});

export type QueryId = "meta" | "ids" | "labels" | "positions" | "positionRefs" | "positionQualifiers" | "openTeams" | "modified";

export interface ProbeQuery {
  id: QueryId;
  sparql: string;
}

const QID_PATTERN = /^Q\d+$/;

/**
 * The population: any item carrying one of the three NBA player id properties. A plain UNION has bag semantics,
 * so an item with all three ids would be counted three times and every join would multiply; hence DISTINCT.
 */
const POPULATION = `{ SELECT DISTINCT ?item WHERE { ${ID_SCHEMES.map((s) => `{ ?item wdt:${ID_PROPERTY[s]} [] }`).join(" UNION ")} } }`;

function population(itemQids: readonly string[] | null): string {
  if (itemQids === null) return POPULATION;
  for (const qid of itemQids) if (!QID_PATTERN.test(qid)) throw new Error(`Not a Wikidata item id: "${qid}"`);
  return `VALUES ?item { ${itemQids.map((q) => `wd:${q}`).join(" ")} }`;
}

const limit = (n: number = PROBE_LIMITS.maxRowsPerQuery) => `LIMIT ${n}`;

/**
 * Run the patterns in written order, population first. Without this the optimizer may start from every item that
 * has a position statement (millions) and filter down, which exceeds the service's 60 s limit.
 */
const ORDERED = `hint:Query hint:optimizer "None" .`;

function idsQuery(pop: string): string {
  const blocks = ID_SCHEMES.map(
    (scheme) => `{ ?item p:${ID_PROPERTY[scheme]} ?s . ?s ps:${ID_PROPERTY[scheme]} ?id ; wikibase:rank ?rank . BIND("${scheme}" AS ?scheme) }`,
  );
  return `SELECT ?item ?scheme ?id ?rank WHERE { ${pop} ${blocks.join(" UNION ")} } ${limit()}`;
}

/** Builds the full query set; `itemQids` restricts every population query to explicit items (fixture recording). */
export function buildQueries(itemQids: readonly string[] | null = null): ProbeQuery[] {
  const pop = population(itemQids);
  const entities = Object.keys(EXPECTED_ENTITY_LABELS).map((e) => `wd:${e}`).join(" ");
  return [
    {
      id: "meta",
      sparql: `SELECT ?entity ?label ?description WHERE { VALUES ?entity { ${entities} } ?entity rdfs:label ?label . FILTER(LANG(?label) = "en") OPTIONAL { ?entity schema:description ?description . FILTER(LANG(?description) = "en") } } ${limit(200)}`,
    },
    { id: "ids", sparql: idsQuery(pop) },
    // The label service resolves only the bound items; a plain rdfs:label join scans every language and hit the 60 s limit.
    { id: "labels", sparql: `SELECT ?item ?label WHERE { ${pop} SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?item rdfs:label ?label } } ${limit()}` },
    {
      id: "positions",
      sparql: `SELECT ?item ?st ?pos ?rank WHERE { ${ORDERED} ${pop} ?item p:${POSITION_PROPERTY} ?st . ?st ps:${POSITION_PROPERTY} ?pos ; wikibase:rank ?rank } ${limit()}`,
    },
    {
      id: "positionRefs",
      sparql: `SELECT ?st ?stated ?imported ?url ?retrieved WHERE { ${ORDERED} ${pop} ?item p:${POSITION_PROPERTY} ?st . ?st prov:wasDerivedFrom ?ref . OPTIONAL { ?ref pr:P248 ?stated } OPTIONAL { ?ref pr:P143 ?imported } OPTIONAL { ?ref pr:P854 ?url } OPTIONAL { ?ref pr:P813 ?retrieved } } ${limit()}`,
    },
    {
      id: "positionQualifiers",
      sparql: `SELECT ?st ?season ?seasonLabel ?team ?start ?end WHERE { ${ORDERED} ${pop} ?item p:${POSITION_PROPERTY} ?st . OPTIONAL { ?st pq:P3450 ?season . OPTIONAL { ?season rdfs:label ?seasonLabel . FILTER(LANG(?seasonLabel) = "en") } } OPTIONAL { ?st pq:${TEAM_MEMBERSHIP_PROPERTY} ?team } OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } FILTER(BOUND(?season) || BOUND(?team) || BOUND(?start) || BOUND(?end)) } ${limit()}`,
    },
    {
      id: "openTeams",
      sparql: `SELECT ?item ?team ?start WHERE { ${ORDERED} ${pop} ?item p:${TEAM_MEMBERSHIP_PROPERTY} ?st . ?st ps:${TEAM_MEMBERSHIP_PROPERTY} ?team . ?team wdt:P118 wd:${NBA_LEAGUE_QID} . ?team wdt:P31/wdt:P279* wd:${BASKETBALL_TEAM_CLASS_QID} . FILTER NOT EXISTS { ?team wdt:P576 [] } FILTER NOT EXISTS { ?st pq:P582 [] } OPTIONAL { ?st pq:P580 ?start } } ${limit()}`,
    },
    { id: "modified", sparql: `SELECT ?item ?modified WHERE { ${ORDERED} ${pop} ?item schema:dateModified ?modified } ${limit()}` },
  ];
}
