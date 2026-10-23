/**
 * Pure join of the probe's raw SPARQL result sets into one deterministic snapshot.
 * No network or file access. A missing result set is an error: a partial snapshot
 * would silently understate coverage.
 */
import type { QueryId } from "./wikidataQueries";
import {
  compareCodeUnits as compare,
  EXPECTED_ENTITY_LABELS,
  ID_SCHEMES,
  SNAPSHOT_SCHEMA_VERSION,
  WIKIDATA_LICENSE,
  type IdScheme,
  type RequestRecord,
  type SparqlJson,
  type StatementRank,
  type WikidataPlayerRecord,
  type WikidataPositionSnapshot,
  type WikidataPositionStatement,
  type WikidataReference,
  type WikidataStatementQualifiers,
} from "./wikidataTypes";

type Binding = SparqlJson["results"]["bindings"][number];

const RANK_BY_URI: Readonly<Record<string, StatementRank>> = Object.freeze({
  "http://wikiba.se/ontology#PreferredRank": "preferred",
  "http://wikiba.se/ontology#NormalRank": "normal",
  "http://wikiba.se/ontology#DeprecatedRank": "deprecated",
});

const qidOf = (binding: Binding, name: string): string | null => /\/entity\/(Q\d+)$/.exec(binding[name]?.value ?? "")?.[1] ?? null;
const textOf = (binding: Binding, name: string): string | null => binding[name]?.value ?? null;
/** A label, or null when the label service fell back to printing the item id for an unlabelled item. */
const labelOf = (binding: Binding, name: string): string | null => {
  const text = binding[name]?.value ?? null;
  return text === null || /^[PQ]\d+$/.test(text) ? null : text;
};
const dayOf = (binding: Binding, name: string): string | null => /^(\d{4}-\d{2}-\d{2})/.exec(binding[name]?.value ?? "")?.[1] ?? null;
const instantOf = (binding: Binding, name: string): string | null => {
  const value = binding[name]?.value;
  return value !== undefined && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
};
const statementIdOf = (binding: Binding): string | null => /\/entity\/statement\/(.+)$/.exec(binding.st?.value ?? "")?.[1] ?? null;
const qidNumber = (qid: string) => Number(qid.slice(1));
const rankOf = (binding: Binding, name: string): StatementRank | undefined => {
  const uri = binding[name]?.value ?? "";
  // Own-property check: a response string such as "constructor" must not resolve to an inherited member.
  return Object.hasOwn(RANK_BY_URI, uri) ? RANK_BY_URI[uri] : undefined;
};
const distinctSorted = (values: readonly string[]): string[] => [...new Set(values)].sort(compare);

function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== null) groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function referencesOf(rows: readonly Binding[]): WikidataReference[] {
  const seen = new Set<string>();
  const references: WikidataReference[] = [];
  for (const row of rows) {
    const reference: WikidataReference = {
      sourceQid: qidOf(row, "stated") ?? qidOf(row, "imported"),
      sourceHost: hostOf(textOf(row, "url")),
      retrievedOn: dayOf(row, "retrieved"),
    };
    const key = JSON.stringify(reference);
    if (!seen.has(key)) {
      seen.add(key);
      references.push(reference);
    }
  }
  return references.sort((a, b) => compare(`${a.sourceQid ?? ""}|${a.sourceHost ?? ""}|${a.retrievedOn ?? ""}`, `${b.sourceQid ?? ""}|${b.sourceHost ?? ""}|${b.retrievedOn ?? ""}`));
}

function qualifiersOf(rows: readonly Binding[] | undefined): WikidataStatementQualifiers {
  const all = rows ?? [];
  const nonNull = (pick: (row: Binding) => string | null) => all.map(pick).filter((v): v is string => v !== null);
  const seasons = new Map<string, string | null>();
  for (const row of all) {
    const qid = qidOf(row, "season");
    // The label comes from the same row as its season item, never from another season's row.
    if (qid !== null && (!seasons.has(qid) || seasons.get(qid) === null)) seasons.set(qid, labelOf(row, "seasonLabel"));
  }
  const starts = distinctSorted(nonNull((r) => dayOf(r, "start")));
  const ends = distinctSorted(nonNull((r) => dayOf(r, "end")));
  return {
    seasons: [...seasons.entries()].sort((a, b) => compare(a[0], b[0])).map(([qid, label]) => ({ qid, label })),
    teamQids: distinctSorted(nonNull((r) => qidOf(r, "team"))),
    start: starts[0] ?? null,
    end: ends[ends.length - 1] ?? null,
  };
}

/** Checks the live property and position vocabulary against the labels this audit was written for. */
export function checkVocabulary(meta: SparqlJson): string[] {
  const labels = new Map<string, string>();
  for (const row of meta.results.bindings) {
    const qid = /\/entity\/([PQ]\d+)$/.exec(row.entity?.value ?? "")?.[1];
    if (qid !== undefined && row.label !== undefined) labels.set(qid, row.label.value);
  }
  return Object.entries(EXPECTED_ENTITY_LABELS).flatMap(([entity, expected]) => {
    const actual = labels.get(entity);
    if (actual === undefined) return [`${entity}: no English label returned (expected "${expected}")`];
    return actual === expected ? [] : [`${entity}: label is "${actual}", expected "${expected}"`];
  });
}

function emptyIds(): Record<IdScheme, { value: string; rank: StatementRank }[]> {
  return { espn: [], "nba-com": [], bbref: [] };
}

function addIds(players: Map<string, WikidataPlayerRecord>, rows: readonly Binding[]): void {
  for (const row of rows) {
    const qid = qidOf(row, "item");
    const scheme = textOf(row, "scheme") as IdScheme | null;
    const rank = rankOf(row, "rank");
    const value = textOf(row, "id");
    if (qid === null || scheme === null || !(ID_SCHEMES as readonly string[]).includes(scheme) || rank === undefined || value === null) continue;
    const player = players.get(qid) ?? { qid, label: null, ids: emptyIds(), positions: [], openTeamMemberships: [], modifiedAtUtc: null };
    const exists = player.ids[scheme].some((i) => i.value === value && i.rank === rank);
    players.set(qid, exists ? player : { ...player, ids: { ...player.ids, [scheme]: [...player.ids[scheme], { value, rank }].sort((a, b) => compare(a.value, b.value)) } });
  }
}

function positionStatements(raw: Record<QueryId, SparqlJson>): Map<string, WikidataPositionStatement[]> {
  const refsByStatement = groupBy(raw.positionRefs.results.bindings, statementIdOf);
  const qualifiersByStatement = groupBy(raw.positionQualifiers.results.bindings, statementIdOf);
  const byItem = new Map<string, WikidataPositionStatement[]>();
  for (const row of raw.positions.results.bindings) {
    const item = qidOf(row, "item");
    const statementId = statementIdOf(row);
    const positionQid = qidOf(row, "pos");
    const rank = rankOf(row, "rank");
    if (item === null || statementId === null || positionQid === null || rank === undefined) continue;
    const statement: WikidataPositionStatement = {
      statementId,
      positionQid,
      rank,
      references: referencesOf(refsByStatement.get(statementId) ?? []),
      qualifiers: qualifiersOf(qualifiersByStatement.get(statementId)),
    };
    byItem.set(item, [...(byItem.get(item) ?? []), statement]);
  }
  return byItem;
}

export interface SnapshotInput {
  raw: Partial<Record<QueryId, SparqlJson>>;
  retrievedAtUtc: string;
  userAgent: string;
  endpoint: string;
  requests: RequestRecord[];
  restrictedToItems: string[] | null;
}

const REQUIRED: readonly QueryId[] = ["meta", "ids", "labels", "positions", "positionRefs", "positionQualifiers", "openTeams", "modified"];

export function buildSnapshot(input: SnapshotInput): WikidataPositionSnapshot {
  const missing = REQUIRED.filter((id) => input.raw[id] === undefined);
  if (missing.length > 0) throw new Error(`Cannot build a snapshot without result sets: ${missing.join(", ")}`);
  const raw = input.raw as Record<QueryId, SparqlJson>;
  const players = new Map<string, WikidataPlayerRecord>();
  addIds(players, raw.ids.results.bindings);
  const positions = positionStatements(raw);
  const labels = new Map(raw.labels.results.bindings.map((r) => [qidOf(r, "item"), labelOf(r, "label")] as const));
  const modified = new Map(raw.modified.results.bindings.map((r) => [qidOf(r, "item"), instantOf(r, "modified")] as const));
  const teams = groupBy(raw.openTeams.results.bindings, (r) => qidOf(r, "item"));
  const built = [...players.values()].map((player): WikidataPlayerRecord => ({
    ...player,
    label: labels.get(player.qid) ?? null,
    positions: [...(positions.get(player.qid) ?? [])].sort((a, b) => compare(a.statementId, b.statementId)),
    openTeamMemberships: (teams.get(player.qid) ?? [])
      .flatMap((r) => {
        const teamQid = qidOf(r, "team");
        return teamQid === null ? [] : [{ teamQid, start: dayOf(r, "start") }];
      })
      .sort((a, b) => compare(a.teamQid, b.teamQid) || compare(a.start ?? "", b.start ?? "")),
    modifiedAtUtc: modified.get(player.qid) ?? null,
  }));
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    provenance: {
      endpoint: input.endpoint,
      retrievedAtUtc: input.retrievedAtUtc,
      userAgent: input.userAgent,
      requests: input.requests,
      license: WIKIDATA_LICENSE,
      restrictedToItems: input.restrictedToItems,
      vocabularyIssues: checkVocabulary(raw.meta),
    },
    players: built.sort((a, b) => qidNumber(a.qid) - qidNumber(b.qid)),
  };
}
