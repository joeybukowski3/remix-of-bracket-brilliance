import { describe, expect, it } from "vitest";
import { FIXTURE_BUILD_AT, FIXTURE_GAME_KEY, FIXTURE_TIPOFF, fixtureImportFile, fixturePositionsFile, fixtureSlateFile } from "../__fixtures__/v1Fixtures";
import { assembleBoard } from "../pipeline/boardBuild";
import { SOURCE_LICENSES } from "../sources/licenses";
import type { NbaSourceId, SourceLicense } from "../sources/types";
import { parsePlayerGameImport } from "./playerGameImport";
import { buildEstimateSet } from "./positionEstimates";
import { assertPrivatePreviewSource, buildPrivatePreviewBoard, NO_LINE_REASON } from "./privatePreview";
import { buildV1Inputs, parseSlate } from "./slateBuild";

/** The fixture league, labelled as hoopR/ESPN data, which the registry allows for private research only. */
function inputsFor(sourceId: string) {
  return buildV1Inputs({
    generatedAtUtc: FIXTURE_BUILD_AT,
    imported: parsePlayerGameImport(fixtureImportFile({ sourceId })),
    positions: buildEstimateSet([fixturePositionsFile("2025-26"), fixturePositionsFile("2026-27")]),
    slate: parseSlate(fixtureSlateFile()),
  });
}
const hoopr = inputsFor("hoopr-espn");
const build = (over: Partial<Parameters<typeof buildPrivatePreviewBoard>[0]> = {}) =>
  buildPrivatePreviewBoard({ generatedAtUtc: FIXTURE_BUILD_AT, projections: hoopr.projections, roster: hoopr.roster, dvp: hoopr.dvp, ...over });

describe("private preview from hoopR/ESPN (private-research only)", () => {
  const { artifact, report } = build();

  it("shows every projection with the estimated position and the opponent, and no sportsbook line", () => {
    expect(report.projections).toMatchObject({ supplied: 48, shown: 48, rejected: [] });
    expect(artifact.entries).toHaveLength(48);
    const bos1 = artifact.entries.find((e) => e.playerName === "Demo Player BOS 1" && e.market === "pts");
    expect(bos1).toMatchObject({ team: "BOS", opponent: "NYK", positionLabel: "PG", line: null, lineWithheldReason: NO_LINE_REASON, gameKey: FIXTURE_GAME_KEY, tipoffUtc: FIXTURE_TIPOFF });
    expect(bos1?.projection?.modelVersion).toBe("nba-props-baseline-v0");
    expect(artifact.entries.every((e) => e.line === null)).toBe(true);
    expect(artifact.sources.lines).toEqual([]);
  });

  it("carries DvP for both seasons for all 30 teams, ranked", () => {
    expect(report.dvp.rows).toBe(900);
    expect(artifact.sources.dvp).toBe("hoopr-espn");
    expect(artifact.dvpRows.filter((r) => r.season === "2025-26" && r.position === "SF" && r.statistic === "REB").map((r) => r.rank).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("always carries a notice and an attribution: not ESPN's permission, not licensed for publication, hoopR credited", () => {
    expect(artifact.isSynthetic).toBe(false);
    expect(artifact.privatePreview?.notice).toMatch(/PRIVATE PREVIEW/);
    expect(artifact.privatePreview?.notice).toMatch(/not their permission/);
    expect(artifact.privatePreview?.notice).toMatch(/Not licensed for publication/);
    expect(artifact.privatePreview?.attribution).toMatch(/hoopR \(sportsdataverse, CC BY 4\.0\), derived from ESPN/);
  });
});

describe("the public builder is unchanged and still withholds this source", () => {
  it("rejects every hoopR/ESPN projection and all DvP when assembling the public board with the real registry", () => {
    const { artifact, report } = assembleBoard({ generatedAtUtc: FIXTURE_BUILD_AT, snapshots: [], projections: hoopr.projections, roster: hoopr.roster, dvp: hoopr.dvp });
    expect(artifact.entries).toEqual([]);
    expect(artifact.dvpRows).toEqual([]);
    expect(artifact.privatePreview).toBeUndefined();
    expect(new Set(report.projections.rejected.map((r) => r.reason))).toEqual(new Set(["built from hoopr-espn, whose rights do not permit model development and public display"]));
    expect(report.dvp).toMatchObject({ status: "withheld" });
    expect(report.dvp.reason).toMatch(/do not permit public display/);
  });
});

describe("which sources may feed a private preview", () => {
  it.each(["balldontlie", "api-sports-nba", "stats.nba.com", "llimllib-nba-data", "thesportsdb", "sportsdataio"] as const)("refuses %s: no private-research right is recorded", (id) => {
    expect(() => assertPrivatePreviewSource(id, SOURCE_LICENSES)).toThrow(/no effective private-research right/);
    expect(() => build({ projections: inputsFor(id).projections, dvp: inputsFor(id).dvp })).toThrow(/no effective private-research right/);
  });

  it("refuses synthetic data: invented data never appears on the board", () => {
    expect(() => assertPrivatePreviewSource("synthetic", SOURCE_LICENSES)).toThrow(/is synthetic; invented data never appears on the board/);
  });

  it("accepts hoopr-espn, and its origin espn, for private research", () => {
    expect(() => assertPrivatePreviewSource("hoopr-espn", SOURCE_LICENSES)).not.toThrow();
  });

  it("refuses a source that may be published: that goes through the public builder, not a private preview", () => {
    const licensed: Record<NbaSourceId, SourceLicense> = { ...SOURCE_LICENSES, balldontlie: { status: "commercial-licensed", permittedUses: ["private-research", "model-development", "public-display"], basis: "test agreement", reviewedOn: "2026-10-23" } };
    expect(() => assertPrivatePreviewSource("balldontlie", licensed)).toThrow(/build the public board/);
  });

  it("is capped by the origin: a hoopR record that grants more than ESPN's cannot widen it", () => {
    const widened: Record<NbaSourceId, SourceLicense> = { ...SOURCE_LICENSES, "hoopr-espn": { ...SOURCE_LICENSES["hoopr-espn"], permittedUses: ["private-research", "model-development", "public-display"] } };
    expect(() => assertPrivatePreviewSource("hoopr-espn", widened)).not.toThrow();
    const noOrigin: Record<NbaSourceId, SourceLicense> = { ...SOURCE_LICENSES, espn: { ...SOURCE_LICENSES.espn, permittedUses: [] } };
    expect(() => assertPrivatePreviewSource("hoopr-espn", noOrigin)).toThrow(/no effective private-research right/);
  });
});

describe("private preview input checks", () => {
  it("rejects a game that has already started, inputs that postdate the build, and bad values, with the reason", () => {
    const p = hoopr.projections[0];
    const board = build({
      projections: [
        { ...p, tipoffUtc: "2026-10-24T14:00:00Z" },
        { ...p, playerName: "Late Inputs", inputCutoffUtc: "2026-10-25T00:00:00Z" },
        { ...p, playerName: "Negative", value: -1 },
        { ...p, playerName: "Long Minutes", minutes: 61 },
        { ...p, playerName: "Fine" },
      ],
    });
    expect(board.report.projections.rejected.map((r) => r.reason)).toEqual(["game has already started", "inputs postdate the build", "projection value is not a non-negative number", "minutes outside 0-60"]);
    expect(board.report.projections.shown).toBe(1);
  });

  it("keeps the latest projection when two cover the same player, game and market", () => {
    const p = hoopr.projections[0];
    const board = build({ projections: [{ ...p, value: 10, inputCutoffUtc: "2026-10-22T00:00:00Z" }, { ...p, value: 12, inputCutoffUtc: "2026-10-23T00:00:00Z" }] });
    expect(board.artifact.entries.map((e) => e.projection?.value)).toEqual([12]);
  });

  it("shows a projection without DvP or a position when those inputs are missing", () => {
    const board = build({ dvp: null, roster: {} });
    expect(board.artifact.entries).toHaveLength(48);
    expect(board.artifact.dvpRows).toEqual([]);
    expect(board.artifact.sources.dvp).toBeNull();
    expect(board.artifact.entries.every((e) => e.positionLabel === null && e.team !== null)).toBe(true);
  });

  it("refuses a box-score line that names a different source than the input does, and a build time that is not an instant", () => {
    const stray = { ...hoopr.dvp!, lines: [{ ...hoopr.dvp!.lines[0], sourceId: "hoopr-espn-other" }, ...hoopr.dvp!.lines.slice(1)] };
    expect(() => build({ dvp: stray })).toThrow(/names source hoopr-espn-other/);
    expect(() => build({ generatedAtUtc: "yesterday" })).toThrow(/ISO UTC/);
    expect(() => build({ projections: [], dvp: null })).toThrow(/nothing to preview/);
  });
});
