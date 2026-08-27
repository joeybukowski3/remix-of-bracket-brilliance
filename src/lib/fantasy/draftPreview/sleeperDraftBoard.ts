/**
 * Typed loader for the generated Sleeper draft-board artifact. The artifact
 * itself is produced by `scripts/generate-fantasy-draft-preview.ts` (run via
 * `npm run fantasy:draft-preview`) -- this module never parses the CSV.
 */
import sleeperDraftBoardArtifact from "../../../../data/fantasy/draft-preview/2026-sleeper-draft-board.json";
import type { SleeperDraftBoardRow } from "@/lib/fantasy/draftPreview/sleeperCsv";

type SleeperDraftBoardArtifact = {
  _meta: {
    schemaVersion: string;
    source: string;
    sourceSha256: string;
    generatedBy: string;
    rowCount: number;
  };
  rows: readonly SleeperDraftBoardRow[];
};

const ARTIFACT = sleeperDraftBoardArtifact as SleeperDraftBoardArtifact;

export const SLEEPER_DRAFT_BOARD_2026: readonly SleeperDraftBoardRow[] = ARTIFACT.rows;
export const SLEEPER_DRAFT_BOARD_2026_META = ARTIFACT._meta;
