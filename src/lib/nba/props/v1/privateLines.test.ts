/**
 * Captured sportsbook lines joined to the private preview board. Invented players, books, prices and event; the provider
 * payload goes through the real Odds API normalizer and the real capture ledger, with no network and no credential.
 *
 * Fixture game: BOS at NYK, tipoff 2026-10-24T23:30Z. A capture at 20:30Z is 180 minutes before tipoff, inside the pipeline's
 * 45-240 minute window; the board is built at 21:00Z, after the capture and before tipoff.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUILD_AT, CAPTURED_AT, boardWith, book, captureOf, marketBlock, FRESH, type Prop } from "../__fixtures__/capturedLines";
import { FIXTURE_GAME_KEY, fixtureImportFile, fixtureName, fixturePositionsFile, fixtureSlateFile } from "../__fixtures__/v1Fixtures";
import { MARKETS, type Market } from "../pipeline/contracts";
import { fileLineCaptureSink } from "../pipeline/lineCapture";
import { ODDS_SOURCE_LICENSES } from "../pipeline/oddsSources";
import { overrideView } from "../minutesOverride";
import { buildBoardRows, containsPrivateData, type PropsBoardArtifact } from "../propsBoard";
import { attachPrivateLines, NO_CAPTURED_LINE_REASON, UNKNOWN_AGE_REASON } from "./privateLines";
import { runV1PrivatePreview } from "./run";

const entryOf = (artifact: PropsBoardArtifact, team: string, slot: number, market: Market = "pts") => artifact.entries.find((e) => e.playerName === fixtureName(team, slot) && e.market === market);

describe("a captured line joins the right game, player and market", () => {
  const capture = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5, over: -118, under: -102 }, { player: fixtureName("NYK", 1), point: 22.5 }])]);
  const { artifact, report } = boardWith([capture]);

  it("shows the Vegas line with its book, prices, capture time and freshness on that player's points entry only", () => {
    const entry = entryOf(artifact, "BOS", 3);
    expect(entry?.gameKey).toBe(FIXTURE_GAME_KEY);
    expect(entry?.line).toEqual({ sportsbook: "demobook", line: 14.5, overPrice: -118, underPrice: -102, capturedAtUtc: CAPTURED_AT, freshness: "fresh", ageMinutes: 10 });
    expect(entry?.lineWithheldReason).toBeNull();
    expect(entryOf(artifact, "NYK", 1)?.line?.line).toBe(22.5);
    // The same player's other markets and every other player stay without a line, with the reason that a capture exists but has none.
    expect(entryOf(artifact, "BOS", 3, "reb")).toMatchObject({ line: null, lineWithheldReason: NO_CAPTURED_LINE_REASON });
    expect(entryOf(artifact, "BOS", 4)).toMatchObject({ line: null, lineWithheldReason: NO_CAPTURED_LINE_REASON });
    expect(artifact.entries.filter((e) => e.line !== null)).toHaveLength(2);
  });

  it("reads JKB minus line as the projection minus that line, and the minutes-adjusted difference from the same line", () => {
    const rows = buildBoardRows(artifact, "pts");
    const row = rows.find((r) => r.entry.playerName === fixtureName("BOS", 3));
    const projection = row?.entry.projection;
    expect(projection).toBeTruthy();
    expect(row?.difference).toBeCloseTo((projection?.value as number) - 14.5, 10);
    const view = overrideView({ jkbProjection: projection!.value, jkbMinutes: projection!.minutes, line: row!.entry.line!.line, seasonPerMinute: null, userMinutes: 36 });
    expect(view.adjustedProjection).toBeCloseTo((projection!.value * 36) / (projection!.minutes as number), 10);
    expect(view.adjustedDifference).toBeCloseTo((view.adjustedProjection as number) - 14.5, 10);
    // A player with no line has no difference, never zero.
    expect(rows.find((r) => r.entry.playerName === fixtureName("BOS", 4))?.difference).toBeNull();
  });

  it("credits the provider, keeps the private notice, and counts retrieved, matched, unmatched and displayed lines", () => {
    expect(artifact.sources.lines).toEqual(["the-odds-api"]);
    expect(artifact.privatePreview?.notice).toMatch(/PRIVATE PREVIEW/);
    expect(artifact.privatePreview?.attribution).toMatch(/The Odds API/);
    expect(report.lines).toMatchObject({ captures: 1, linesRetrieved: 2, matched: 2, unmatched: [], withheld: 0, displayed: 2 });
  });
});

describe("matching is by normalized name within the game, not by guesswork", () => {
  it("ignores accents, punctuation and a Jr. suffix in the provider's spelling", () => {
    const named = captureOf([book("demobook", [{ player: "Démo Pláyer BOS 3 Jr.", point: 14.5 }])]);
    expect(entryOf(boardWith([named]).artifact, "BOS", 3)?.line?.line).toBe(14.5);
  });

  it("reports a provider player the board does not project, and a different spelling, as unmatched with the reason", () => {
    const capture = captureOf([book("demobook", [{ player: "Nobody Real", point: 9.5 }, { player: "Demo Pl BOS 3", point: 14.5 }, { player: fixtureName("BOS", 3), point: 14.5 }])]);
    const { report, artifact } = boardWith([capture]);
    expect(report.lines).toMatchObject({ linesRetrieved: 3, matched: 1, displayed: 1 });
    expect(report.lines?.unmatched.map((u) => [u.player, u.reason])).toEqual([
      ["Nobody Real", "no projection for this player and market in this game"],
      ["Demo Pl BOS 3", "no projection for this player and market in this game"],
    ]);
    expect(artifact.entries.filter((e) => e.line !== null)).toHaveLength(1);
  });

  it("reports a line for a game that is not on the board, and never moves it to another game", () => {
    const otherNight = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }])], { commence: "2026-10-25T23:30:00Z", capturedAtUtc: "2026-10-25T20:30:00Z", eventId: "evt-other-night" });
    const { report, artifact } = boardWith([otherNight]);
    expect(report.lines?.unmatched).toEqual([expect.objectContaining({ player: fixtureName("BOS", 3), reason: "game 2026-10-25|BOS@NYK is not on this board" })]);
    expect(artifact.entries.every((e) => e.line === null)).toBe(true);
    expect(artifact.sources.lines).toEqual([]);
  });

  it("does not attach a line when the provider's tipoff disagrees with the schedule by more than an hour", () => {
    // 01:30Z is still the 24th in Eastern time, so the game key matches; captured at 22:00Z it is 210 minutes out, inside the window.
    const shifted = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }], "2026-10-24T21:50:00Z")], { commence: "2026-10-25T01:30:00Z", capturedAtUtc: "2026-10-24T22:00:00Z" });
    const { report, artifact } = boardWith([shifted]);
    expect(report.lines?.unmatched[0].reason).toMatch(/tipoff differs/);
    expect(entryOf(artifact, "BOS", 3)?.line).toBeNull();
  });

  it("keeps one market's line off another market's entry", () => {
    const both = captureOf([{ key: "demobook", title: "demobook", markets: [marketBlock("player_points", [{ player: fixtureName("BOS", 3), point: 14.5 }], FRESH), marketBlock("player_rebounds", [{ player: fixtureName("BOS", 3), point: 5.5 }], FRESH)] }], { markets: MARKETS });
    const { artifact } = boardWith([both]);
    expect(entryOf(artifact, "BOS", 3, "pts")?.line?.line).toBe(14.5);
    expect(entryOf(artifact, "BOS", 3, "reb")?.line?.line).toBe(5.5);
    expect(entryOf(artifact, "BOS", 3, "ast")?.line).toBeNull();
  });
});

describe("one line per player and market from several books and captures", () => {
  const props = (point: number): Prop[] => [{ player: fixtureName("BOS", 3), point }];

  it("shows the line most books agree on, and the book that posted it most recently", () => {
    const capture = captureOf([book("bookc", props(15.5)), book("bookb", props(14.5), "2026-10-24T20:25:00Z"), book("booka", props(14.5), "2026-10-24T20:10:00Z")]);
    const { artifact, report } = boardWith([capture]);
    expect(entryOf(artifact, "BOS", 3)?.line).toMatchObject({ line: 14.5, sportsbook: "bookb" });
    expect(report.lines).toMatchObject({ linesRetrieved: 3, matched: 3, displayed: 1 });
  });

  it("breaks a tie toward the middle of the posted lines, then toward the lower line", () => {
    const three = captureOf([book("booka", props(14.5)), book("bookb", props(15.5)), book("bookc", props(16.5))]);
    expect(entryOf(boardWith([three]).artifact, "BOS", 3)?.line?.line).toBe(15.5);
    const two = captureOf([book("booka", props(14.5)), book("bookb", props(15.5))]);
    expect(entryOf(boardWith([two]).artifact, "BOS", 3)?.line?.line).toBe(14.5);
  });

  it("uses a book's newest capture and ignores its older one", () => {
    const older = captureOf([book("booka", props(14.5), "2026-10-24T19:20:00Z")], { capturedAtUtc: "2026-10-24T19:30:00Z" });
    const newer = captureOf([book("booka", props(15.5), "2026-10-24T20:45:00Z")], { capturedAtUtc: "2026-10-24T20:50:00Z" });
    const { artifact } = boardWith([newer, older]);
    expect(entryOf(artifact, "BOS", 3)?.line).toMatchObject({ line: 15.5, capturedAtUtc: "2026-10-24T20:50:00Z" });
  });
});

describe("report counts and the age rule across captures", () => {
  const props = (point: number): Prop[] => [{ player: fixtureName("BOS", 3), point }];

  it("counts only a book's replaced lines as superseded, and keeps retrieved = matched + unmatched", () => {
    const older = captureOf([book("booka", props(14.5), "2026-10-24T19:20:00Z")], { capturedAtUtc: "2026-10-24T19:30:00Z" });
    const newer = captureOf([book("booka", props(15.5), "2026-10-24T20:45:00Z"), book("bookb", [{ player: "Nobody Real", point: 9.5 }])], { capturedAtUtc: "2026-10-24T20:50:00Z" });
    const lines = boardWith([older, newer]).report.lines!;
    expect(lines).toMatchObject({ linesRetrieved: 3, matched: 2, superseded: 1, displayed: 1, withheld: 0 });
    expect(lines.linesRetrieved).toBe(lines.matched + lines.unmatched.length);
  });

  it("does not count an unknown-age line as superseded", () => {
    const lines = boardWith([captureOf([book("demobook", props(14.5), null)])]).report.lines!;
    expect(lines).toMatchObject({ matched: 1, superseded: 0, withheld: 1 });
  });

  it("never lets a newer line of unknown age displace the same book's dated line", () => {
    const dated = captureOf([book("booka", props(14.5), "2026-10-24T19:20:00Z")], { capturedAtUtc: "2026-10-24T19:30:00Z" });
    const undated = captureOf([book("booka", props(15.5), null)], { capturedAtUtc: "2026-10-24T20:50:00Z" });
    const { artifact, report } = boardWith([dated, undated]);
    expect(entryOf(artifact, "BOS", 3)?.line).toMatchObject({ line: 14.5, capturedAtUtc: "2026-10-24T19:30:00Z" });
    expect(report.lines).toMatchObject({ withheld: 0, displayed: 1, superseded: 1 });
  });
});

describe("a line is withheld, never repaired, when it cannot be trusted", () => {
  it("withholds a line whose age cannot be established and says why", () => {
    const capture = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }], null)]);
    const { artifact, report } = boardWith([capture]);
    expect(entryOf(artifact, "BOS", 3)).toMatchObject({ line: null, lineWithheldReason: UNKNOWN_AGE_REASON });
    expect(report.lines).toMatchObject({ linesRetrieved: 1, matched: 1, withheld: 1, displayed: 0 });
  });

  it("shows a stale line flagged as stale", () => {
    const capture = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }], "2026-10-24T18:00:00Z")]);
    expect(entryOf(boardWith([capture]).artifact, "BOS", 3)?.line).toMatchObject({ line: 14.5, freshness: "stale" });
  });

  it("rejects a capture outside the 45-240 minute pregame window with the pipeline's own reason", () => {
    const early = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }], "2026-10-24T14:50:00Z")], { capturedAtUtc: "2026-10-24T15:00:00Z" });
    const { report, artifact } = boardWith([early]);
    expect(report.lines).toMatchObject({ linesRetrieved: 1, matched: 0, displayed: 0 });
    expect(report.lines?.unmatched[0].reason).toMatch(/240 minutes/);
    expect(entryOf(artifact, "BOS", 3)?.line).toBeNull();
  });

  it("leaves a capture whose teams are unknown unmatched", () => {
    const capture = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }])], { home: "Seattle SuperSonics" });
    expect(boardWith([capture]).report.lines?.unmatched[0].reason).toMatch(/could not be mapped/);
  });

  it("never shows an invented line, even from a capture marked synthetic", () => {
    const invented = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }])], { sourceId: "synthetic-odds" });
    const { artifact, report } = boardWith([invented]);
    expect(report.lines?.unmatched[0].reason).toMatch(/invented data never appears/);
    expect(artifact.entries.every((e) => e.line === null)).toBe(true);
  });

  it("applies the narrower of the capture's rights and today's: no private-research right, no line", () => {
    const capture = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }])]);
    const closed = { ...ODDS_SOURCE_LICENSES, "the-odds-api": { ...ODDS_SOURCE_LICENSES["the-odds-api"], permittedUses: ["public-display" as const] } };
    const result = attachPrivateLines(boardWith([]).artifact.entries, [capture], { currentLicenses: closed });
    expect(result.entries.every((e) => e.line === null)).toBe(true);
    expect(result.report).toMatchObject({ matched: 0, displayed: 0 });
    expect(result.report.unmatched[0].reason).toMatch(/private research/);
  });
});

describe("attaching lines does not change what it is given", () => {
  it("returns new entries and leaves the inputs untouched; with no captures the board is as it was", () => {
    const base = boardWith([]);
    const frozen = JSON.stringify(base.artifact.entries);
    const capture = captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }])]);
    const attached = attachPrivateLines(base.artifact.entries, [capture]);
    expect(JSON.stringify(base.artifact.entries)).toBe(frozen);
    expect(attached.entries).not.toBe(base.artifact.entries);
    expect(base.report.lines).toBeNull();
    expect(base.artifact.sources.lines).toEqual([]);
    expect(base.artifact.entries.every((e) => e.line === null && e.lineWithheldReason === "no sportsbook line in a private preview")).toBe(true);
  });
});

describe("the private board file written by the runner", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const project = (): string => {
    const root = mkdtempSync(path.join(tmpdir(), "nba-vegas-"));
    dirs.push(root);
    const dir = path.join(root, "data", "nba", "props-v1");
    mkdirSync(dir, { recursive: true });
    const put = (name: string, body: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(body));
    put("player-games.json", fixtureImportFile({ sourceId: "hoopr-espn" }));
    put("positions-2025-26.json", fixturePositionsFile("2025-26"));
    put("positions-2026-27.json", fixturePositionsFile("2026-27"));
    put("slate.json", fixtureSlateFile());
    return root;
  };

  it("reads the capture ledger under data/nba/odds-captures, writes lines only into the private file, and still refuses the public page", async () => {
    const root = project();
    await fileLineCaptureSink(path.join(root, "data", "nba", "odds-captures"))(captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }, { player: "Nobody Real", point: 9.5 }])]));
    const result = runV1PrivatePreview({ root, generatedAtUtc: BUILD_AT });
    expect(result.outFile.split(path.sep).join("/")).toBe("data/nba/props-v1/private-preview-board.json");
    expect(result.preview.lines).toMatchObject({ captures: 1, linesRetrieved: 2, matched: 1, displayed: 1 });
    expect(result.preview.lines?.unmatched).toHaveLength(1);
    const written = JSON.parse(readFileSync(path.join(root, result.outFile), "utf8")) as PropsBoardArtifact;
    expect(entryOf(written, "BOS", 3)?.line?.line).toBe(14.5);
    expect(written.privatePreview).toBeTruthy();
    expect(containsPrivateData(written)).toBe(true); // the published page refuses a board like this
  });

  it("builds as before, with no lines, when no capture exists", () => {
    const root = project();
    const result = runV1PrivatePreview({ root, generatedAtUtc: BUILD_AT });
    expect(result.preview.lines).toBeNull();
    const written = JSON.parse(readFileSync(path.join(root, result.outFile), "utf8")) as PropsBoardArtifact;
    expect(written.entries.every((e) => e.line === null)).toBe(true);
  });

  it("fails the whole build, rather than skipping, when a capture file has been altered", async () => {
    const root = project();
    const { file } = await fileLineCaptureSink(path.join(root, "data", "nba", "odds-captures"))(captureOf([book("demobook", [{ player: fixtureName("BOS", 3), point: 14.5 }])]));
    const { chmodSync } = await import("node:fs");
    chmodSync(file, 0o666);
    writeFileSync(file, readFileSync(file, "utf8").replace("14.5", "99.5"));
    expect(() => runV1PrivatePreview({ root, generatedAtUtc: BUILD_AT })).toThrow(/content hash mismatch/);
  });
});
