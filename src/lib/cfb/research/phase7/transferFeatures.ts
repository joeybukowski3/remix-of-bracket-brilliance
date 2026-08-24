import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_RAW_DIR } from "../config/researchConfig";
import { TRANSFER_PORTAL_COVERAGE_START_SEASON } from "./config";
import { loadTeamNames } from "./teamNames";
import type { CfbdResearchTransferPortalRaw } from "./ingestion/types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function loadPortal(season: number): CfbdResearchTransferPortalRaw[] {
  try {
    return JSON.parse(
      readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_RAW_DIR, String(season), "transfer-portal.json"), "utf8"),
    ) as CfbdResearchTransferPortalRaw[];
  } catch {
    return [];
  }
}

export type TransferCounts = { incoming: number; outgoing: number; net: number };

/**
 * Section 9 — simple incoming/outgoing/net counts per team per season.
 * CFBD's portal coverage is empirically empty before 2021 (verified in
 * cfb-research-phase7-fetch.ts); seasons before TRANSFER_PORTAL_COVERAGE_START_SEASON
 * return an empty map rather than fabricated zeros treated as meaningful signal.
 * Entries whose origin/destination doesn't match a known FBS school name
 * that season (juco, non-FBS, unresolved) are skipped, never guessed.
 */
export function buildTransferCountsByTeam(season: number): Map<string, TransferCounts> {
  if (season < TRANSFER_PORTAL_COVERAGE_START_SEASON) return new Map();

  const portal = loadPortal(season);
  const nameById = loadTeamNames(season);
  const idByName = new Map([...nameById.entries()].map(([id, name]) => [name.trim().toLowerCase(), id]));

  const result = new Map<string, TransferCounts>();
  for (const id of nameById.keys()) result.set(id, { incoming: 0, outgoing: 0, net: 0 });

  for (const entry of portal) {
    if (entry.destination) {
      const destId = idByName.get(entry.destination.trim().toLowerCase());
      if (destId) {
        const counts = result.get(destId)!;
        counts.incoming += 1;
        counts.net += 1;
      }
    }
    if (entry.origin) {
      const originId = idByName.get(entry.origin.trim().toLowerCase());
      if (originId) {
        const counts = result.get(originId)!;
        counts.outgoing += 1;
        counts.net -= 1;
      }
    }
  }
  return result;
}
