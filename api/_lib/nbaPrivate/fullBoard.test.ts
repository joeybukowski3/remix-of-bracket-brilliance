// @vitest-environment node
// Lives in api/_lib (underscore-prefixed) on purpose: Vercel deploys every other file under api/ as a function.
// The complete 978-entry board (the size of the real private board) through publish plan, store, authorization and serialization.
import { beforeAll, describe, expect, it } from "vitest";

import { buildDemoBoard } from "../../../src/lib/nba/props/__fixtures__/boardDemo";
import { planPublish } from "../../../src/lib/nba/props/hosted/publishPlan";
import { FULL_NOTICE } from "../../../src/lib/nba/props/hosted/redact";
import type { BoardEntry, LineDetail, PropsBoardArtifact } from "../../../src/lib/nba/props/propsBoard";
import { createHandlers } from "./handlers";
import { SESSION_COOKIE, createFailureLimiter, hashPassphrase, issueSessionToken } from "./session";
import type { SnapshotStore } from "./snapshotStore";

const ENTRY_COUNT = 978;
const SECRET = "t".repeat(48);
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
    privatePreview: { notice: "Local builder notice.", attribution: "Data: hoopR (sportsdataverse, CC BY 4.0), derived from ESPN; Lines: The Odds API" },
  };
}

let passwordHash = "";
beforeAll(async () => {
  passwordHash = await hashPassphrase("an invented long passphrase");
});

function hosted(envelope: unknown) {
  const store: SnapshotStore = { read: async () => JSON.parse(JSON.stringify(envelope)), write: async () => undefined };
  const handlers = createHandlers({ env: { NBA_PRIVATE_PASSWORD_HASH: passwordHash, NBA_PRIVATE_SESSION_SECRET: SECRET }, store: () => store, now: () => NOW, limiter: createFailureLimiter(), logError: () => undefined });
  const cookie = `${SESSION_COOKIE}=${issueSessionToken(SECRET, NOW)}`;
  return { handlers, cookie };
}

describe("the complete 978-entry board through publish, storage and the authorization pathway", () => {
  const board = bigBoard();
  const plan = planPublish(board, PUBLISHED);

  it("is cleared for the full tier and loses no entry or table row in the plan", () => {
    expect(plan.ok).toBe(true);
    expect(plan.envelope?.tier).toBe("full");
    expect(plan.counts).toMatchObject({ entriesIn: ENTRY_COUNT, entriesOut: ENTRY_COUNT, dvpRowsOut: board.dvpRows.length });
    expect(plan.counts.envelopeBytes).toBeGreaterThan(500_000);
  });

  it("returns the identical board to a signed-in owner: every projection, season stat, last-ten row, DvP row, opponent table and line detail", async () => {
    const { handlers, cookie } = hosted(plan.envelope);
    const response = await handlers.GET(new Request("https://www.joeknowsball.com/api/nba/props-board", { headers: { cookie } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tier: string; publishedAtUtc: string; board: PropsBoardArtifact };
    expect(body.tier).toBe("full");
    expect(body.publishedAtUtc).toBe(PUBLISHED);
    expect(body.board.entries).toHaveLength(ENTRY_COUNT);
    expect(body.board.entries).toEqual(board.entries);
    expect(body.board.dvpRows).toEqual(board.dvpRows);
    expect(body.board.opponentRecent).toEqual(board.opponentRecent);
    expect(body.board.opponentBoxScores).toEqual(board.opponentBoxScores);
    expect(body.board.sources).toEqual(board.sources);
    expect(body.board.generatedAtUtc).toBe(board.generatedAtUtc);
    expect(body.board.privatePreview).toEqual({ notice: FULL_NOTICE, attribution: board.privatePreview?.attribution });
  });

  it("keeps the fields the dashboard columns read: projections, minutes, season and L5/L10 inputs, lines and per-book detail", async () => {
    const { handlers, cookie } = hosted(plan.envelope);
    const body = (await (await handlers.GET(new Request("https://www.joeknowsball.com/api/nba/props-board", { headers: { cookie } }))).json()) as { board: PropsBoardArtifact };
    const entries = body.board.entries;
    expect(entries.filter((e) => e.projection !== null).length).toBe(board.entries.filter((e) => e.projection !== null).length);
    expect(entries.filter((e) => e.projection?.minutes != null).length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.seasonStats !== undefined).length).toBe(board.entries.filter((e) => e.seasonStats !== undefined).length);
    expect(entries.filter((e) => (e.seasonStats?.recentGames?.length ?? 0) > 0).length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.line !== null).length).toBe(Math.ceil(ENTRY_COUNT / 3));
    expect(entries.filter((e) => e.lineDetail !== undefined).length).toBe(Math.ceil(ENTRY_COUNT / 3));
    expect(entries.find((e) => e.lineDetail)?.lineDetail?.books.map((b) => [b.sportsbook, b.sourceLastUpdateUtc])).toEqual([["fanduel", "2026-10-29T17:20:00Z"], ["betmgm", null]]);
    expect(entries.every((e) => e.positionLabel === board.entries.find((b) => b.entryKey === e.entryKey)?.positionLabel)).toBe(true);
  });

  it("refuses everyone without a valid session and leaks no board content in the refusal", async () => {
    const { handlers } = hosted(plan.envelope);
    const anonymous = await handlers.GET(new Request("https://www.joeknowsball.com/api/nba/props-board"));
    const forged = await handlers.GET(new Request("https://www.joeknowsball.com/api/nba/props-board", { headers: { cookie: `${SESSION_COOKIE}=${issueSessionToken("z".repeat(48), NOW)}` } }));
    for (const response of [anonymous, forged]) {
      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toBe(JSON.stringify({ error: "unauthorized" }));
      expect(text).not.toContain(board.entries[0].playerName);
    }
  });

  it("serves it with no caching so a shared cache can never hold the board", async () => {
    const { handlers, cookie } = hosted(plan.envelope);
    const response = await handlers.GET(new Request("https://www.joeknowsball.com/api/nba/props-board", { headers: { cookie } }));
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });
});
