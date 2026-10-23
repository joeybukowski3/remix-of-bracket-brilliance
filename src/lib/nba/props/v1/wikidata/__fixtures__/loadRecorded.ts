/**
 * Loader for the recorded Wikidata responses in ./recorded. The raw files are real, unmodified
 * query-service responses for 19 hand-picked items covering each classification edge case
 * (see recorded/README.md). Wikidata structured data is CC0.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { QueryId } from "../wikidataQueries";
import type { SparqlJson, WikidataPositionSnapshot } from "../wikidataTypes";

const RECORDED_DIR = path.join(__dirname, "recorded");

export const RECORDED_ITEMS = [
  "Q24200", "Q82004", "Q29604", "Q24178", "Q4883", "Q17717", "Q25369", "Q36159", "Q76438339", "Q1653956",
  "Q458065", "Q2737523", "Q298981", "Q441654", "Q371250", "Q29342", "Q58092211", "Q106486426", "Q16320595",
] as const;

const QUERY_IDS: readonly QueryId[] = ["meta", "ids", "labels", "positions", "positionRefs", "positionQualifiers", "openTeams", "modified"];

export function loadRecordedRaw(): Record<QueryId, SparqlJson> {
  return Object.fromEntries(QUERY_IDS.map((id) => [id, JSON.parse(readFileSync(path.join(RECORDED_DIR, "raw", `${id}.json`), "utf8")) as SparqlJson])) as Record<QueryId, SparqlJson>;
}

/** The snapshot the probe wrote when it recorded these responses (golden for the join logic). */
export const loadRecordedSnapshot = (): WikidataPositionSnapshot => JSON.parse(readFileSync(path.join(RECORDED_DIR, "snapshot.json"), "utf8")) as WikidataPositionSnapshot;
