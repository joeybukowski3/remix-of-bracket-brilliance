import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDemoBoard } from "../__fixtures__/boardDemo";
import { ODDS_SOURCE_LICENSES } from "../pipeline/oddsSources";
import { BOARD_SCHEMA_VERSION, type BoardEntry, type PropsBoardArtifact } from "../propsBoard";
import { SOURCE_LICENSES } from "../sources/licenses";
import { DATA_USES, type DataUse, type NbaSourceId, type SourceLicense } from "../sources/types";
import { PUBLIC_LINES_USES, PUBLIC_STATISTICS_USES, decideHosting } from "./hostingGate";
import { planPublish } from "./publishPlan";
import { HOSTED_BOARD_SCHEMA, HOSTED_SNAPSHOT_SCHEMA, PUBLIC_TEXT, buildEnvelope, projectBoardForTier, serveableEnvelope } from "./redact";

const NOW = "2026-10-29T15:00:00Z";
const lineDetail = { selection: "test", books: [], excluded: [] };

/** A board shaped like the real private-builder one: Odds API lines plus hoopR-derived statistics, with extra unknown fields to prove allowlisting. */
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
const ALL_STATISTICS_USES = [...PUBLIC_STATISTICS_USES, "private-research"] as SourceLicense["permittedUses"];
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
    expect(out).not.toHaveProperty("privatePreview");
    expect(PUBLIC_TEXT["lines-only"].attribution.toLowerCase()).not.toMatch(/hoopr|espn/);
    expect(PUBLIC_TEXT["lines-only"].notice).toMatch(/lines only/i);
  });

  it("is idempotent and does not mutate its input", () => {
    const board = privateBoard();
    const before = JSON.stringify(board);
    const once = projectBoardForTier(board, "lines-only");
    expect(projectBoardForTier(once, "lines-only")).toEqual(once);
    expect(JSON.stringify(board)).toBe(before);
  });

  it("full keeps every statistic, table and line and drops only unknown top-level fields and the builder's private notice", () => {
    const board = privateBoard();
    const out = projectBoardForTier(board, "full");
    expect(out.entries).toEqual(board.entries);
    expect(out.dvpRows).toEqual(board.dvpRows);
    expect(out.opponentRecent).toEqual(board.opponentRecent);
    expect(out.opponentBoxScores).toEqual(board.opponentBoxScores);
    expect(out.sources).toEqual(board.sources);
    expect(JSON.stringify(out)).not.toContain("unknownTopLevel");
    expect(out).not.toHaveProperty("privatePreview");
    expect(JSON.stringify(out)).not.toMatch(/do not publish|private preview/i);
    expect(PUBLIC_TEXT.full.attribution).toMatch(/hoopR/);
    expect(PUBLIC_TEXT.full.attribution).toMatch(/ESPN/);
    expect(PUBLIC_TEXT.full.attribution).toMatch(/The Odds API/);
    expect(PUBLIC_TEXT.full.notice).toBeNull();
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
  it("today: Odds API lines and the owner-stated hoopR/ESPN rights are both cleared for public display, so the complete board is public", () => {
    const decision = decideHosting(privateBoard());
    expect(decision.tier).toBe("full");
    expect(decision.verdicts.find((v) => v.role === "lines")).toMatchObject({ sourceId: "the-odds-api", hostable: true });
    expect(decision.verdicts.find((v) => v.role === "statistics")).toMatchObject({ sourceId: "hoopr-espn", hostable: true });
  });

  it("narrowing either hoopR/ESPN record, or removing any one use, drops the public board back to lines only", () => {
    const narrowOrigin = { ...SOURCE_LICENSES, espn: { ...SOURCE_LICENSES.espn, permittedUses: ["private-research", "private-hosted"] as SourceLicense["permittedUses"] } };
    const narrowSource = { ...SOURCE_LICENSES, "hoopr-espn": { ...SOURCE_LICENSES["hoopr-espn"], permittedUses: ["private-research", "private-hosted", "model-development"] as SourceLicense["permittedUses"] } };
    expect(decideHosting(privateBoard(), { stats: narrowOrigin }).tier).toBe("lines-only");
    expect(decideHosting(privateBoard(), { stats: narrowSource }).tier).toBe("lines-only");
    for (const dropped of ["public-display", "model-development", "raw-redistribution", "private-hosted"] as const) {
      const uses = SOURCE_LICENSES.espn.permittedUses.filter((use) => use !== dropped);
      expect(decideHosting(privateBoard(), { stats: statsWith(uses) }).tier, `without ${dropped}`).toBe("lines-only");
    }
  });

  it("the recorded hoopR/ESPN rights are the owner's own statements: provenance is stated and no third-party license is claimed", () => {
    for (const id of ["espn", "hoopr-espn"] as const) {
      expect(SOURCE_LICENSES[id].permittedUses).toEqual(["private-research", "private-hosted", "model-development", "public-display", "raw-redistribution"]);
      expect(SOURCE_LICENSES[id].basis).toMatch(/PUBLIC DISPLAY CHECK 2026-10-29/);
      expect(SOURCE_LICENSES[id].basis).toMatch(/OWNER STATEMENT 2026-10-29 \(owner-provided, final\)/);
      expect(SOURCE_LICENSES[id].basis).toMatch(/no ESPN or SportsDataverse license, written permission or other document is on file and none is claimed/);
      expect(SOURCE_LICENSES[id].basis).toMatch(/does not cover offering the data as a feed, an API or a bulk download/);
    }
  });

  it("only the hoopR/ESPN pair records private-hosted or public-display among the real NBA statistics sources", () => {
    for (const [id, license] of Object.entries(SOURCE_LICENSES)) {
      if (license.status === "synthetic") continue;
      const pair = id === "espn" || id === "hoopr-espn";
      expect(license.permittedUses.includes("private-hosted"), id).toBe(pair);
      expect(license.permittedUses.includes("public-display"), id).toBe(pair);
    }
  });
});

describe("the public gate is never looser than the existing public board builder", () => {
  // pipeline/boardBuild.ts withholds statistics-derived output unless the source's effective uses include both of these.
  const builderRequires: DataUse[] = ["model-development", "public-display"];
  const subsets = (uses: readonly DataUse[]): DataUse[][] => uses.reduce<DataUse[][]>((acc, use) => [...acc, ...acc.map((set) => [...set, use])], [[]]);

  it("never returns the full tier for a statistics grant that the builder would refuse, across every combination of uses", () => {
    for (const uses of subsets(DATA_USES)) {
      const tier = decideHosting(privateBoard(), { stats: statsWith(uses) }).tier;
      if (tier === "full") for (const required of builderRequires) expect(uses, `full tier with ${uses.join(",")}`).toContain(required);
    }
  });

  it("needs every use in the public statistics set, so dropping any one falls back to lines-only", () => {
    for (const dropped of PUBLIC_STATISTICS_USES) {
      const uses = PUBLIC_STATISTICS_USES.filter((use) => use !== dropped);
      expect(decideHosting(privateBoard(), { stats: statsWith(uses) }).tier, `without ${dropped}`).toBe("lines-only");
    }
  });

  it("requires public-display on the line source and publishes nothing without it", () => {
    expect(PUBLIC_LINES_USES).toEqual(["public-display"]);
    for (const uses of subsets(DATA_USES).filter((set) => !set.includes("public-display"))) {
      expect(decideHosting(privateBoard(), { odds: { "the-odds-api": grant(uses) }, stats: statsWith(ALL_STATISTICS_USES) }).tier, uses.join(",")).toBeNull();
    }
  });
});

describe("decideHosting with hypothetical records", () => {
  it("does not let the private-hosting grant, or a public-display grant alone, stand in for the full set on statistics", () => {
    expect(decideHosting(privateBoard(), { stats: statsWith(["private-research", "private-hosted"]) }).tier).toBe("lines-only");
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
    expect(decideHosting({ ...privateBoard(), sources: { lines: ["the-odds-api"], dvp: null, dvpUpdatedUtc: null } }, { stats: statsWith(ALL_STATISTICS_USES) }).tier).toBe("lines-only");
    expect(decideHosting({ ...privateBoard(), sources: { lines: ["the-odds-api"], dvp: "constructor", dvpUpdatedUtc: null } }, { stats: statsWith(ALL_STATISTICS_USES) }).tier).toBe("lines-only");
  });

  it("the Odds API record carries the owner's 2026-10-29 decisions, including the public-dashboard confirmation, and still refuses raw redistribution", () => {
    const record = ODDS_SOURCE_LICENSES["the-odds-api"];
    expect(record.permittedUses).toEqual(["private-research", "private-hosted", "model-development", "public-display"]);
    expect(record.permittedUses).not.toContain("raw-redistribution");
    expect(record.basis).toContain("2026-10-29");
    expect(record.basis).toContain("standalone data product");
    expect(record.basis).toContain("publicly accessible");
    expect(record.basis).toContain("not offered as a data feed");
  });

  it("needs public-display on the line source: private hosting alone publishes nothing", () => {
    expect(decideHosting(privateBoard(), { odds: { "the-odds-api": grant(["private-research", "private-hosted", "model-development"]) } }).tier).toBeNull();
    expect(decideHosting(privateBoard(), { odds: { "the-odds-api": grant(["public-display"]) } }).tier).toBe("full");
  });
});

describe("planPublish", () => {
  it("today the real records yield the full envelope: every entry and table row is published", () => {
    const plan = planPublish(privateBoard(), NOW);
    expect(plan.ok).toBe(true);
    expect(plan.envelope?.tier).toBe("full");
    expect(plan.counts.entriesOut).toBe(plan.counts.entriesIn);
    expect(plan.counts.dvpRowsOut).toBeGreaterThan(0);
    expect(plan.envelope).toEqual(buildEnvelope(privateBoard(), "full", NOW));
  });

  it("falls back to a lines-only envelope, with no statistic, projection or table, when a statistics record is narrowed", () => {
    const plan = planPublish(privateBoard(), NOW, { stats: { ...SOURCE_LICENSES, espn: { ...SOURCE_LICENSES.espn, permittedUses: ["private-research", "private-hosted"] } } });
    expect(plan.ok).toBe(true);
    expect(plan.envelope?.tier).toBe("lines-only");
    expect(plan.counts.entriesOut).toBeLessThan(plan.counts.entriesIn);
    expect(plan.counts.dvpRowsOut).toBe(0);
    const text = JSON.stringify(plan.envelope);
    expect(text).not.toContain("seasonStats");
    expect(text).not.toContain("opponentRecent");
    expect(text).not.toContain("hoopr-espn");
  });

  it("refuses files that are not private boards and boards whose lines are not cleared", () => {
    expect(planPublish({ nope: true }, NOW).ok).toBe(false);
    expect(planPublish({ ...privateBoard(), privatePreview: undefined }, NOW).problem).toMatch(/private-preview builder/);
    const blocked = planPublish(privateBoard(), NOW, { odds: { "the-odds-api": grant([]) } });
    expect(blocked.ok).toBe(false);
    expect(blocked.envelope).toBeNull();
  });
});

describe("Odds API conditions kept in the hosted board", () => {
  const detail = {
    selection: "consensus of fresh books",
    books: [
      { sportsbook: "fanduel", line: 20.5, overPrice: -112, underPrice: -108, sourceLastUpdateUtc: "2026-10-29T14:58:03Z", capturedAtUtc: "2026-10-29T14:59:00Z", freshness: "fresh" as const, ageMinutes: 1, role: "shown" as const },
      { sportsbook: "draftkings", line: 20.5, overPrice: -110, underPrice: -110, sourceLastUpdateUtc: null, capturedAtUtc: "2026-10-29T14:59:00Z", freshness: "unknown" as const, ageMinutes: null, role: "unknown-age" as const },
    ],
    excluded: [{ sportsbook: "bovada", lines: [14.5, 20.5, 25.5], reason: "alternate-line ladder" }],
  };

  it("keeps the displayed line's bookmaker, prices and capture time, and every book's provider timestamp, byte for byte", () => {
    const board = privateBoard();
    const line = { sportsbook: "fanduel", line: 20.5, overPrice: -112, underPrice: -108, capturedAtUtc: "2026-10-29T14:59:00Z", freshness: "fresh" as const, ageMinutes: 1 };
    const withDetail: PropsBoardArtifact = { ...board, entries: board.entries.map((entry, index) => (index === 0 ? { ...entry, line, lineDetail: detail } : entry)) };
    const original = withDetail.entries[0];
    const out = projectBoardForTier(withDetail, "lines-only").entries.find((entry) => entry.entryKey === original.entryKey);
    expect(out?.line).toEqual(line);
    expect(out?.lineDetail).toEqual(detail);
    expect(out?.lineDetail?.books.map((book) => [book.sportsbook, book.sourceLastUpdateUtc, book.capturedAtUtc])).toEqual([
      ["fanduel", "2026-10-29T14:58:03Z", "2026-10-29T14:59:00Z"],
      ["draftkings", null, "2026-10-29T14:59:00Z"],
    ]);
    expect(out?.lineDetail?.excluded).toEqual(detail.excluded);
  });

  it("keeps the line freshness that the page uses to flag stale prices", () => {
    const board = privateBoard();
    const stale = { sportsbook: "caesars", line: 9.5, overPrice: -105, underPrice: -115, capturedAtUtc: "2026-10-29T10:00:00Z", freshness: "stale" as const, ageMinutes: 300 };
    const out = projectBoardForTier({ ...board, entries: board.entries.map((entry, index) => (index === 0 ? { ...entry, line: stale } : entry)) }, "lines-only");
    expect(out.entries.find((entry) => entry.line?.sportsbook === "caesars")?.line).toEqual(stale);
  });

  it("makes no provider request and touches no quota or credential: the hosted modules mention neither", () => {
    const dir = path.resolve(__dirname);
    const apiDir = path.resolve(__dirname, "../../../../../api");
    const sources = [
      ...readdirSync(dir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => path.join(dir, name)),
      path.join(apiDir, "nba", "props-board.ts"),
      ...readdirSync(path.join(apiDir, "_lib", "nbaBoard")).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => path.join(apiDir, "_lib", "nbaBoard", name)),
      path.resolve(__dirname, "../../../../../scripts/nba-snapshot-publish.ts"),
    ];
    expect(sources.length).toBeGreaterThan(6);
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/the-odds-api\.com|THE_ODDS_API_KEY|ODDS_API_KEY|api-quota|quotaAccount|liveApproval|probe/i);
    }
  });
});
