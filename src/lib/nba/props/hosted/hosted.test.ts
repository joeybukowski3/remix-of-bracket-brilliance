import { describe, expect, it } from "vitest";
import { buildDemoBoard } from "../__fixtures__/boardDemo";
import { ODDS_SOURCE_LICENSES } from "../pipeline/oddsSources";
import { BOARD_SCHEMA_VERSION, type BoardEntry, type PropsBoardArtifact } from "../propsBoard";
import { SOURCE_LICENSES } from "../sources/licenses";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { decideHosting } from "./hostingGate";
import { planPublish } from "./publishPlan";
import { HOSTED_BOARD_SCHEMA, HOSTED_SNAPSHOT_SCHEMA, LINES_ONLY_ATTRIBUTION, LINES_ONLY_NOTICE, buildEnvelope, projectBoardForTier, serveableEnvelope } from "./redact";

const NOW = "2026-10-29T15:00:00Z";
const lineDetail = { selection: "test", books: [], excluded: [] };

/** A private board shaped like the real one: Odds API lines plus hoopR-derived statistics, with extra unknown fields to prove allowlisting. */
function privateBoard(): PropsBoardArtifact {
  const demo = buildDemoBoard();
  const entries: BoardEntry[] = demo.entries.map((entry, index) => ({
    ...entry,
    positionLabel: "G",
    line: index % 2 === 0 ? { sportsbook: "book", line: 20.5, overPrice: -110, underPrice: -110, capturedAtUtc: NOW, freshness: "fresh", ageMinutes: 5 } : null,
    ...(index % 2 === 0 ? { lineDetail } : {}),
    ...({ leakedExtra: "hoopr-only" } as object),
  }));
  return {
    ...demo,
    isSynthetic: false,
    sources: { lines: ["the-odds-api"], dvp: "hoopr-espn", dvpUpdatedUtc: "2026-10-27T12:00:00Z" },
    entries,
    privatePreview: { notice: "Private.", attribution: "Stats: hoopR/ESPN; lines: The Odds API" },
    ...({ unknownTopLevel: { secret: true } } as object),
  };
}

const grant = (uses: SourceLicense["permittedUses"]): SourceLicense => ({ status: "unlicensed", permittedUses: uses, basis: "test", reviewedOn: "2026-10-29" });
const statsWith = (uses: SourceLicense["permittedUses"]): Record<NbaSourceId, SourceLicense> => ({ ...SOURCE_LICENSES, espn: grant(uses), "hoopr-espn": grant(uses) });

describe("schema constants", () => {
  it("keeps the dependency-free copy of the board schema equal to the real one", () => {
    expect(HOSTED_BOARD_SCHEMA).toBe(BOARD_SCHEMA_VERSION);
  });
});

describe("projectBoardForTier", () => {
  it("lines-only keeps lines and drops every hoopR/ESPN-derived field, including unknown ones", () => {
    const out = projectBoardForTier(privateBoard(), "lines-only");
    const text = JSON.stringify(out);
    expect(out.entries.length).toBeGreaterThan(0);
    expect(out.entries.every((entry) => entry.line !== null)).toBe(true);
    for (const entry of out.entries) {
      expect(entry.projection).toBeNull();
      expect(entry.positionLabel).toBeNull();
      expect(entry).not.toHaveProperty("seasonStats");
      expect(entry).not.toHaveProperty("leakedExtra");
    }
    expect(out.dvpRows).toEqual([]);
    expect(out.opponentRecent).toBeUndefined();
    expect(out.opponentBoxScores).toBeUndefined();
    expect(out.sources).toEqual({ lines: ["the-odds-api"], dvp: null, dvpUpdatedUtc: null });
    expect(text).not.toContain("unknownTopLevel");
    expect(text).not.toContain("hoopr-espn");
    expect(out.privatePreview).toEqual({ notice: LINES_ONLY_NOTICE, attribution: LINES_ONLY_ATTRIBUTION });
    expect(JSON.stringify(out.privatePreview).toLowerCase()).not.toMatch(/hoopr|espn/);
  });

  it("is idempotent and does not mutate its input", () => {
    const board = privateBoard();
    const before = JSON.stringify(board);
    const once = projectBoardForTier(board, "lines-only");
    expect(projectBoardForTier(once, "lines-only")).toEqual(once);
    expect(JSON.stringify(board)).toBe(before);
  });

  it("full keeps the statistics and tables but still drops unknown top-level fields and always carries the private notice", () => {
    const board = { ...privateBoard(), privatePreview: undefined } as unknown as PropsBoardArtifact;
    const out = projectBoardForTier(board, "full");
    expect(out.dvpRows.length).toBeGreaterThan(0);
    expect(out.opponentRecent).toBeDefined();
    expect(JSON.stringify(out)).not.toContain("unknownTopLevel");
    expect(out.privatePreview?.notice).toMatch(/owner/i);
  });
});

describe("serveableEnvelope", () => {
  it("re-applies the stored tier, so a tampered lines-only row cannot serve statistics", () => {
    const tampered = { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "lines-only", publishedAtUtc: NOW, board: privateBoard() };
    const served = serveableEnvelope(tampered);
    expect(served.ok).toBe(true);
    if (served.ok) {
      expect(served.envelope.board.dvpRows).toEqual([]);
      expect(served.envelope.board.entries.every((entry) => entry.projection === null)).toBe(true);
    }
  });

  it.each([
    ["not an object", "x"],
    ["wrong schema", { schemaVersion: "other", tier: "full", publishedAtUtc: NOW, board: privateBoard() }],
    ["unknown tier", { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "everything", publishedAtUtc: NOW, board: privateBoard() }],
    ["bad timestamp", { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "full", publishedAtUtc: "yesterday-ish", board: privateBoard() }],
    ["board of the wrong shape", { schemaVersion: HOSTED_SNAPSHOT_SCHEMA, tier: "full", publishedAtUtc: NOW, board: { schemaVersion: HOSTED_BOARD_SCHEMA } }],
  ])("refuses %s", (_name, raw) => {
    expect(serveableEnvelope(raw)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("decideHosting against the real license records", () => {
  it("today: hoopR/ESPN statistics are blocked, so only the Odds API lines are cleared", () => {
    const decision = decideHosting(privateBoard());
    expect(decision.tier).toBe("lines-only");
    const stats = decision.verdicts.find((v) => v.role === "statistics");
    expect(stats).toMatchObject({ sourceId: "hoopr-espn", hostable: false });
    expect(stats?.permittedUses).toEqual(["private-research"]);
    expect(decision.verdicts.find((v) => v.role === "lines")).toMatchObject({ sourceId: "the-odds-api", hostable: true });
  });

  it("records no private-hosted right for any real NBA statistics source", () => {
    for (const license of Object.values(SOURCE_LICENSES)) {
      if (license.status === "synthetic") continue;
      expect(license.permittedUses).not.toContain("private-hosted");
    }
  });
});

describe("decideHosting with hypothetical records", () => {
  it("opens the full tier only when both the box-score source and its ESPN origin record private-hosted", () => {
    expect(decideHosting(privateBoard(), { stats: statsWith(["private-research", "private-hosted"]) }).tier).toBe("full");
    const originClosed = { ...SOURCE_LICENSES, "hoopr-espn": grant(["private-research", "private-hosted"]) };
    expect(decideHosting(privateBoard(), { stats: originClosed }).tier).toBe("lines-only");
  });

  it("does not treat a public-display grant as hosting for statistics", () => {
    expect(decideHosting(privateBoard(), { stats: statsWith(["private-research", "public-display"]) }).tier).toBe("lines-only");
  });

  it("clears nothing when the line source is not cleared, unknown, or absent", () => {
    expect(decideHosting(privateBoard(), { odds: { "the-odds-api": grant(["private-research"]) } }).tier).toBeNull();
    const unknown = { ...privateBoard(), sources: { lines: ["mystery-feed"], dvp: "hoopr-espn", dvpUpdatedUtc: null } };
    expect(decideHosting(unknown).tier).toBeNull();
    const none = { ...privateBoard(), sources: { lines: [], dvp: "hoopr-espn", dvpUpdatedUtc: null } };
    expect(decideHosting(none).tier).toBeNull();
  });

  it("keeps statistics local when the board names no statistics source or an unknown one", () => {
    expect(decideHosting({ ...privateBoard(), sources: { lines: ["the-odds-api"], dvp: null, dvpUpdatedUtc: null } }, { stats: statsWith(["private-hosted"]) }).tier).toBe("lines-only");
    expect(decideHosting({ ...privateBoard(), sources: { lines: ["the-odds-api"], dvp: "constructor", dvpUpdatedUtc: null } }, { stats: statsWith(["private-hosted"]) }).tier).toBe("lines-only");
  });

  it("the Odds API record is unchanged by this feature", () => {
    expect(ODDS_SOURCE_LICENSES["the-odds-api"].permittedUses).toEqual(["private-research", "model-development", "public-display"]);
  });
});

describe("planPublish", () => {
  it("builds a lines-only envelope from the real records and reports counts", () => {
    const plan = planPublish(privateBoard(), NOW);
    expect(plan.ok).toBe(true);
    expect(plan.envelope?.tier).toBe("lines-only");
    expect(plan.counts.entriesOut).toBeLessThan(plan.counts.entriesIn);
    expect(plan.counts.dvpRowsOut).toBe(0);
    expect(plan.envelope).toEqual(buildEnvelope(privateBoard(), "lines-only", NOW));
  });

  it("refuses files that are not private boards and boards whose lines are not cleared", () => {
    expect(planPublish({ nope: true }, NOW).ok).toBe(false);
    expect(planPublish({ ...privateBoard(), privatePreview: undefined }, NOW).problem).toMatch(/private preview/);
    const blocked = planPublish(privateBoard(), NOW, { odds: { "the-odds-api": grant([]) } });
    expect(blocked.ok).toBe(false);
    expect(blocked.envelope).toBeNull();
  });
});
