/**
 * Turns the fetched hoopR files into the V1 inputs, offline: no network, no provider, no credential.
 *
 *   python scripts/nba-hoopr-fetch.py --confirm-owner-decision        # hoopR files (gated, pinned; see that script)
 *   npx tsx scripts/nba-wikidata-position-probe.ts                    # Wikidata labels (read-only, 8 capped requests)
 *   npx tsx scripts/nba-hoopr-import.ts [--overrides=<json>] [--overrides-csv=<reviewed csv>] [--wikidata=<snapshot>] [--now=ISO]
 *
 * Writes under data/nba/props-v1/: player-games.json (the strict import), positions-2025-26.json and
 * positions-2026-27.json, slate.json, position-map-report.json, and the review list (position-review-list.json and .csv)
 * for players with no position. hoopR season 2026 = 2025-26 and 2027 = 2026-27. The console prints counts only; names stay
 * in the files under data/nba/.
 * Nothing here publishes anything: the data is ESPN-derived and only private use is recorded (docs/nba-props-v1.md).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { inside, writeAtomically } from "../src/lib/nba/props/pipeline/boardBuildRun";
import { normalizeHooprPlayerBox, type HooprPlayerBoxRow } from "../src/lib/nba/props/v1/hooprAdapter";
import { buildHooprSlate, type HooprScheduleRow } from "../src/lib/nba/props/v1/hooprSlate";
import { buildPositionFiles, indexWikidataSnapshot, overridesFileSchema } from "../src/lib/nba/props/v1/positionMapper";
import { buildReviewList, overridesFromCsv, reviewListCsv } from "../src/lib/nba/props/v1/positionReview";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join("data", "nba");
const RAW = path.join(DATA, "props-v1", "raw", "hoopr");
const OUT = path.join(DATA, "props-v1");
const arg = (name: string): string | undefined => process.argv.slice(2).find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);

const DEFAULT_SNAPSHOT = path.join(DATA, "wikidata-positions", "snapshot.json");
/** A Wikidata snapshot older than this is used, with a warning: labels change slowly, but new players appear. */
const SNAPSHOT_WARN_DAYS = 14;

const manifestSchema = z.object({
  schemaVersion: z.literal("jkb-hoopr-manifest-v1"),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  retrievedAtUtc: z.string(),
  files: z.array(z.object({ name: z.string(), sha256: z.string(), bytes: z.number(), json: z.string(), kind: z.string() })),
});

const readJson = (rel: string): unknown => JSON.parse(readFileSync(inside(root, rel, [DATA], rel), "utf8"));
const writeJson = (name: string, body: unknown, pretty = false): void => writeAtomically(inside(root, path.join(OUT, name), [DATA], name), `${JSON.stringify(body, null, pretty ? 2 : undefined)}\n`);
const rows = <T>(file: string): T[] => (readJson(path.join(RAW, file)) as { rows: T[] }).rows;

function main(): void {
  const manifest = manifestSchema.parse(readJson(path.join(RAW, "manifest.json")));
  const now = arg("now") ? new Date(arg("now") as string) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now must be an ISO instant");
  const snapshotPath = arg("wikidata") ?? DEFAULT_SNAPSHOT;
  if (!existsSync(inside(root, snapshotPath, [DATA], "the Wikidata snapshot"))) throw new Error(`no Wikidata snapshot at ${snapshotPath}: run "npx tsx scripts/nba-wikidata-position-probe.ts" first (read-only, 8 capped requests)`);

  const file = (name: string) => manifest.files.find((f) => f.name === name)?.json;
  const need = (name: string): string => file(name) ?? (() => { throw new Error(`manifest has no ${name}`); })();
  const normalized = normalizeHooprPlayerBox(
    [{ hooprSeason: 2026, rows: rows<HooprPlayerBoxRow>(need("player_box_2026")) }, { hooprSeason: 2027, rows: rows<HooprPlayerBoxRow>(need("player_box_2027")) }],
    { commit: manifest.commit, retrievedAtUtc: manifest.retrievedAtUtc, files: manifest.files },
  );
  writeJson("player-games.json", { schemaVersion: "jkb-player-games-import-v1", source: { sourceId: normalized.imported.sourceId, retrievedAtUtc: normalized.imported.retrievedAtUtc, provenance: normalized.imported.provenance }, rows: normalized.imported.rows });
  writeJson("hoopr-import-report.json", normalized.report, true);

  const overridesPath = arg("overrides");
  const csvPath = arg("overrides-csv");
  const jsonOverrides = overridesPath ? overridesFileSchema.parse(readJson(overridesPath)).overrides : [];
  const csvOverrides = csvPath ? overridesFromCsv(readFileSync(inside(root, csvPath, [DATA], "the reviewed overrides CSV"), "utf8"), normalized.players) : [];
  const wikidata = indexWikidataSnapshot(readJson(snapshotPath));
  const snapshotAgeDays = (now.getTime() - Date.parse(wikidata.retrievedAtUtc)) / 86_400_000;
  const mapped = buildPositionFiles({ players: normalized.players, wikidata, overrides: [...jsonOverrides, ...csvOverrides], asOfUtc: manifest.retrievedAtUtc });
  for (const [season, body] of Object.entries(mapped.files)) writeJson(`positions-${season}.json`, body, true);
  writeJson("position-map-report.json", mapped.report, true);

  const slate = buildHooprSlate(rows<HooprScheduleRow>(need("nba_schedule_2027")), now);
  writeJson("slate.json", slate.slate, true);

  const slateTeams = new Set(slate.slate.games.flatMap((g) => g.gameKey.split("|")[1].split("@")));
  const review = buildReviewList(mapped.unclassified, normalized.players, slateTeams);
  writeJson("position-review-list.json", review, true);
  writeAtomically(inside(root, path.join(OUT, "position-review-list.csv"), [DATA], "the review list CSV"), reviewListCsv(review.entries));

  const r = normalized.report;
  console.log(`hoopR commit ${manifest.commit.slice(0, 10)}, retrieved ${manifest.retrievedAtUtc}`);
  console.log(`Player-game records imported: ${JSON.stringify(r.rowsImported)} from ${JSON.stringify(r.gamesImported)} games`);
  console.log(`Excluded: ${JSON.stringify({ ...r.excluded, incompleteGameIds: undefined, unknownTeamCodes: r.excluded.unknownTeamCodes })}`);
  console.log(`Players with a season: ${JSON.stringify(r.identity.playersBySeason)}; names changed ${r.identity.namesChanged.length}, shared names ${r.identity.sharedNames.length}`);
  for (const [season, s] of Object.entries(mapped.report.seasons)) {
    console.log(`Positions ${season}: ${s.classified}/${s.players} players (${((s.minutesCoverage ?? 0) * 100).toFixed(1)}% of minutes); ${JSON.stringify(s.bySource)}; unclassified ${JSON.stringify(s.unclassified)}`);
  }
  console.log(`Slate: ${slate.slate.games.length} game(s) on ${slate.date ?? "no upcoming date"}`);
  console.log(`Wikidata snapshot retrieved ${wikidata.retrievedAtUtc} (${snapshotAgeDays.toFixed(1)} days old)${snapshotAgeDays > SNAPSHOT_WARN_DAYS ? ` - OLDER THAN ${SNAPSHOT_WARN_DAYS} DAYS: re-run the probe` : ""}`);
  for (const [season, gap] of Object.entries(review.analysis)) {
    console.log(`Gap ${season}: ${gap.unclassifiedPlayers} players, ${(gap.unclassifiedMinutesShare * 100).toFixed(1)}% of minutes; weak evidence only ${(gap.weakEvidenceMinutesShare * 100).toFixed(1)}% (not applied); top 50 would lift coverage to ${(gap.topN["50"].coverageWouldBe * 100).toFixed(1)}%`);
  }
  console.log(`Review list: ${review.entries.length} players -> ${path.join(OUT, "position-review-list.csv")} (${csvOverrides.length ? `${csvOverrides.length} reviewed overrides applied` : "none reviewed yet"})`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
