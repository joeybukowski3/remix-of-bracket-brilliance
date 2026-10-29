// @vitest-environment node
// Lives in api/_lib (underscore-prefixed) on purpose: Vercel deploys every other file under api/ as a function.
// The complete 978-entry board (the size of the real board) through publish plan, store and public delivery, under the real
// license records (what is public today) and under records that would allow the complete board (what is public once recorded).
import { describe, expect, it } from "vitest";

import { buildDemoBoard } from "../../../src/lib/nba/props/__fixtures__/boardDemo";
import { planPublish } from "../../../src/lib/nba/props/hosted/publishPlan";
import { PUBLIC_TEXT } from "../../../src/lib/nba/props/hosted/redact";
import type { BoardEntry, LineDetail, PropsBoardArtifact } from "../../../src/lib/nba/props/propsBoard";
import { SOURCE_LICENSES } from "../../../src/lib/nba/props/sources/licenses";
import type { NbaSourceId, SourceLicense } from "../../../src/lib/nba/props/sources/types";
import { createHandlers } from "./handlers";
import type { SnapshotStore } from "./snapshotStore";

const ENTRY_COUNT = 978;
const NOW = Date.UTC(2026, 9, 29, 18, 0, 0);
const PUBLISHED = "2026-10-29T17:30:00Z";

const detail = (i: number): LineDetail => ({
  selection: `consensus ${i}`,
  books: [
    { sportsbook: "fanduel", line: 20.5, overPrice: -110, underPrice: -110, sourceLastUpdateUtc: "2026-10-29T17:20:00Z", capturedAtUtc: "2026-10-29T17:25:00Z", freshness: "fresh", ageMinutes: 5, role: "shown" },
    { sportsbook: "betmgm", line: 21.5, overPrice: -105, underPrice: -115, sourceLastUpdateUtc: null, capturedAtUtc: "2026-10-29T17:25:00Z", freshness: "unknown", ageMinutes: null, role: "unknown-age" },
  ],
  excluded: [{ sportsbook: "bovada", lines: [10.5, 20.5], reason: "alternate-line ladder" }],
});

/** The demo board's real-shaped fields (season stats with recent games, opponent tables, DvP rows), grown to the real entry count. */
function bigBoard(): PropsBoardArtifact {
  const demo = buildDemoBoard();
  const entries: BoardEntry[] = Array.from({ length: ENTRY_COUNT }, (_, i) => {
    const source = demo.entries[i % demo.entries.length];
    return {
      ...source,
      entryKey: `${source.entryKey}#${i}`,
      line: i % 3 === 0 ? { sportsbook: "fanduel", line: 20.5, overPrice: -110, underPrice: -110, capturedAtUtc: "2026-10-29T17:25:00Z", freshness: "fresh", ageMinutes: 5 } : null,
      ...(i % 3 === 0 ? { lineDetail: detail(i) } : {}),
    };
  });
  return {
    ...demo,
    isSynthetic: false,
    sources: { lines: ["the-odds-api"], dvp: "hoopr-espn", dvpUpdatedUtc: "2026-10-27T12:52:37Z" },
    entries,
    privatePreview: { notice: "Local builder notice: do not publish, share or deploy.", attribution: "Data: hoopR; Lines: The Odds API, for private research only" },
  };
}

const grant = (uses: SourceLicense["permittedUses"]): SourceLicense => ({ status: "unlicensed", permittedUses: uses, basis: "test", reviewedOn: "2026-10-29" });
/** A statistics record narrowed to private use: what the public board would carry if the owner's public statement were withdrawn. */
const STATS_NARROWED: Record<NbaSourceId, SourceLicense> = { ...SOURCE_LICENSES, espn: grant(["private-research", "private-hosted"]) };

function serve(envelope: unknown) {
  const store: SnapshotStore = { read: async () => JSON.parse(JSON.stringify(envelope)), write: async () => undefined };
  return createHandlers({ store: () => store, now: () => NOW, logError: () => undefined });
}
const get = async (envelope: unknown) => {
  const response = await serve(envelope).GET();
  return { response, text: await response.clone().text(), body: (await response.json()) as { tier: string; publishedAtUtc: string; attribution: string; notice: string | null; board: PropsBoardArtifact } };
};

describe("the 978-entry board when a statistics record is narrowed", () => {
  const board = bigBoard();
  const plan = planPublish(board, PUBLISHED, { stats: STATS_NARROWED });

  it("publishes lines only: no projection, season stat, table, DvP row or source notice reaches a visitor", async () => {
    expect(plan.envelope?.tier).toBe("lines-only");
    const { response, text, body } = await get(plan.envelope);
    expect(response.status).toBe(200);
    expect(body.tier).toBe("lines-only");
    expect(body.board.entries).toHaveLength(Math.ceil(ENTRY_COUNT / 3));
    expect(body.board.entries.every((entry) => entry.line !== null && entry.projection === null && entry.positionLabel === null && !("seasonStats" in entry))).toBe(true);
    expect(body.board.dvpRows).toEqual([]);
    expect(body.board.opponentRecent).toBeUndefined();
    expect(body.board.opponentBoxScores).toBeUndefined();
    expect(text).not.toMatch(/hoopr|do not publish|privatePreview|seasonStats|recentGames/i);
    expect(body.attribution).toBe(PUBLIC_TEXT["lines-only"].attribution);
  });

  it("keeps each line's bookmaker, prices and every timestamp byte for byte", async () => {
    const { body } = await get(plan.envelope);
    const original = board.entries.filter((entry) => entry.line !== null);
    expect(body.board.entries.map((entry) => entry.line)).toEqual(original.map((entry) => entry.line));
    expect(body.board.entries.map((entry) => entry.lineDetail)).toEqual(original.map((entry) => entry.lineDetail));
  });
});

describe("the 978-entry board under the real license records", () => {
  const board = bigBoard();
  const plan = planPublish(board, PUBLISHED);

  it("delivers the complete board: every entry, projection, season stat, last-ten input, DvP row, opponent table and line detail", async () => {
    expect(plan.envelope?.tier).toBe("full");
    const { response, body } = await get(plan.envelope);
    expect(response.status).toBe(200);
    expect(body.tier).toBe("full");
    expect(body.publishedAtUtc).toBe(PUBLISHED);
    expect(body.board.entries).toHaveLength(ENTRY_COUNT);
    expect(body.board.entries).toEqual(board.entries);
    expect(body.board.dvpRows).toEqual(board.dvpRows);
    expect(body.board.opponentRecent).toEqual(board.opponentRecent);
    expect(body.board.opponentBoxScores).toEqual(board.opponentBoxScores);
    expect(body.board.sources).toEqual(board.sources);
    expect(body.attribution).toBe(PUBLIC_TEXT.full.attribution);
    expect(body.notice).toBeNull();
  });

  it("carries the fields the dashboard columns read", async () => {
    const { body } = await get(plan.envelope);
    const entries = body.board.entries;
    expect(entries.filter((e) => e.projection !== null)).toHaveLength(board.entries.filter((e) => e.projection !== null).length);
    expect(entries.filter((e) => (e.seasonStats?.recentGames?.length ?? 0) > 0).length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.line !== null)).toHaveLength(Math.ceil(ENTRY_COUNT / 3));
    expect(entries.find((e) => e.lineDetail)?.lineDetail?.books.map((b) => [b.sportsbook, b.sourceLastUpdateUtc])).toEqual([["fanduel", "2026-10-29T17:20:00Z"], ["betmgm", null]]);
  });

  it("never carries the builder's private notice, and is cacheable for the CDN", async () => {
    const { response, text } = await get(plan.envelope);
    expect(text).not.toMatch(/do not publish|privatePreview|private preview/i);
    expect(response.headers.get("cache-control")).toMatch(/s-maxage/);
  });
});
