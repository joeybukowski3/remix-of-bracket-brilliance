import { sha256, writeAtomic } from "./cfbdClient";
import type { CfbResearchManifestFileEntry } from "../types";

export const RESEARCH_RAW_SCHEMA_VERSION = "jkb-cfb-research-raw-v1";

export type RawDatasetWriteInput = {
  filePath: string;
  data: unknown;
  endpoint: string;
  params: Record<string, string | number>;
  season: number;
  week: number | null;
  fetchedAt: string;
};

/**
 * Writes one raw dataset file plus a sibling `<name>.manifest.json` with
 * the Stage 4 provenance fields. Returns the manifest entry so callers can
 * also fold it into a season-level or top-level manifest.json.
 */
export function writeRawDataset(input: RawDatasetWriteInput): CfbResearchManifestFileEntry {
  const text = `${JSON.stringify(input.data, null, 2)}\n`;
  writeAtomic(input.filePath, text);
  const recordCount = Array.isArray(input.data) ? input.data.length : 1;
  const entry: CfbResearchManifestFileEntry = {
    provider: "CollegeFootballData.com API v2",
    endpoint: input.endpoint,
    params: input.params,
    season: input.season,
    week: input.week,
    fetchedAt: input.fetchedAt,
    recordCount,
    sha256: sha256(text),
    schemaVersion: RESEARCH_RAW_SCHEMA_VERSION,
  };
  const manifestPath = input.filePath.replace(/\.json$/, ".manifest.json");
  writeAtomic(manifestPath, `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

export type SeasonManifestInput = {
  filePath: string;
  season: number;
  fetchedAt: string;
  datasets: Record<string, CfbResearchManifestFileEntry | CfbResearchManifestFileEntry[]>;
  incomplete: boolean;
  incompleteReasons: string[];
};

/** Aggregates a season's per-dataset manifest entries into one season manifest file. */
export function writeSeasonManifest(input: SeasonManifestInput): void {
  writeAtomic(
    input.filePath,
    `${JSON.stringify(
      {
        schemaVersion: RESEARCH_RAW_SCHEMA_VERSION,
        season: input.season,
        fetchedAt: input.fetchedAt,
        complete: !input.incomplete,
        incompleteReasons: input.incompleteReasons,
        datasets: input.datasets,
      },
      null,
      2,
    )}\n`,
  );
}
