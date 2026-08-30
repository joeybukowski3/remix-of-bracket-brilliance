/**
 * WU6 publisher CLI: project the private file-backed betting-splits history into
 * the sanitized public browser artifacts.
 *
 * Reads   data/market/betting-splits/history/**
 * Writes  public/data/market/betting-splits-current.json
 *         public/data/market/betting-splits-history/<league>/<gameToken>.json
 *
 * This step is deliberately separate from collection: `collect` never publishes,
 * `publish` never touches the private store or the network. Run order is
 * always collect -> publish.
 *
 * Usage:
 *   npm run market:betting-splits:publish
 */

import { resolve } from "node:path";
import { createBettingSplitFileStore } from "../../src/lib/market/bettingSplitsFileStore";
import { publishBettingSplitsArtifacts } from "../../src/lib/market/bettingSplitsPublicArtifacts";

const ROOT =
  process.env.MARKET_BETTING_SPLITS_ROOT?.trim() || resolve(import.meta.dirname, "..", "..");
const STORE_ROOT = resolve(ROOT, "data", "market", "betting-splits");
const PUBLIC_ROOT = resolve(ROOT, "public", "data", "market");

async function main(): Promise<void> {
  const store = createBettingSplitFileStore({ rootDir: STORE_ROOT });
  const result = await publishBettingSplitsArtifacts({
    store,
    publicRoot: PUBLIC_ROOT,
    generatedAt: new Date().toISOString(),
  });

  console.log(
    `[market:betting-splits:publish] wrote ${result.currentArtifactPath} and ` +
      `${result.historyArtifactPaths.length} history artifact(s).`,
  );
}

main().catch((error) => {
  console.error(`[market:betting-splits:publish] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
