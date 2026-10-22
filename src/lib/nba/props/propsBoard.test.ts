/** Props board tests: artifact gates, join states, sorting and filtering. Invented data only. */
import { describe, expect, it } from "vitest";
import { at, makeGame, TIPOFF } from "./__fixtures__/pipelineFixtures";
import { CANONICAL_TEAM_CODES } from "./canonical";
import { buildDvpRows, type DvpPlayerGameLine } from "./dvp";
import { buildSnapshot, type NbaPregameSnapshot, type SnapshotInput } from "./pipeline/contracts";
import { buildPropsBoardArtifact } from "./pipeline/propsBoardArtifact";
import { buildBoardRows, DEFAULT_FILTERS, filterBoardRows, formatAmerican, sortBoardRows, type PropsBoardArtifact } from "./propsBoard";
import { DATA_USES } from "./sources/types";

const GAME = makeGame();
const iso = (minutesBefore: number) => at(TIPOFF, minutesBefore).toISOString().replace(".000Z", "Z");
const PERMS = { permittedUses: [...DATA_USES].filter((u) => u !== "raw-redistribution") as NbaPregameSnapshot["permissions"]["permittedUses"], licenseBasis: "synthetic test lines", licenseReviewedOn: "2026-10-19", attestation: null };

function snap(over: Partial<SnapshotInput> & { name?: string; team?: "NYK" | "BOS" } = {}): NbaPregameSnapshot {
  const { name = "Sam Rivera", team = "NYK", ...rest } = over;
  return buildSnapshot({
    game: { canonicalGameKey: GAME.canonicalGameKey, sourceEventId: "evt-1", tipoffUtc: GAME.tipoffUtc, awayTeam: "NYK", homeTeam: "BOS", neutralSite: false },
    player: { canonicalPlayerId: null, sourcePlayerName: name, sourcePlayerId: null, team },
    market: "pts",
    source: { sourceId: "synthetic-odds", method: "synthetic", sportsbook: "bookone", sourceMarketKey: "player_points" },
    line: 24.5,
    overPrice: -115,
    underPrice: -105,
    sourceLastUpdateUtc: iso(160),
    capturedAtUtc: iso(150),
    maxAgeMinutes: 120,
    projection: { value: 26.1, minutes: 33.5, modelVersion: "nba-props-baseline-v0", inputCutoffUtc: iso(200), unavailableReason: null },
    permissions: PERMS,
    provenance: { runId: "run-1", importBatchId: null, creditsCharged: 3 },
    ...rest,
  });
}

const dvpLines = (): DvpPlayerGameLine[] =>
  CANONICAL_TEAM_CODES.map((team, i) => ({
    season: "2025-26", gameId: `g-${team}`, opponentTeam: team, playerId: `${team}-sg`, minutes: 30, pts: i + 1, reb: 3, ast: 3, positionLabel: "SG", sourceId: "synthetic-box", sourceUpdatedAtUtc: "2026-11-01T12:00:00Z",
  }));

const build = (snapshots: NbaPregameSnapshot[], labels: Record<string, string> = {}, allowSynthetic = true): PropsBoardArtifact =>
  buildPropsBoardArtifact({ snapshots, dvpRows: buildDvpRows(dvpLines()).rows, positionLabels: labels, generatedAtUtc: "2026-11-09T22:00:00Z", allowSynthetic, dvpIsSynthetic: true });

describe("buildPropsBoardArtifact", () => {
  it("keeps only the latest capture per market and marks synthetic data", () => {
    const early = snap({ capturedAtUtc: iso(200), sourceLastUpdateUtc: iso(210), line: 23.5 });
    const late = snap({ capturedAtUtc: iso(100), sourceLastUpdateUtc: iso(110), line: 25.5 });
    const artifact = build([late, early]);
    expect(artifact.entries).toHaveLength(1);
    expect(artifact.entries[0].line?.line).toBe(25.5);
    expect(artifact.isSynthetic).toBe(true);
    expect(artifact.sources.dvp).toBe("synthetic-box");
  });

  it("drops synthetic lines unless explicitly allowed", () => {
    expect(build([snap()], {}, false).entries).toEqual([]);
  });

  it("withholds a line the license does not allow to be displayed, but keeps the projection", () => {
    const restricted = snap({ permissions: { ...PERMS, permittedUses: ["private-research"] } });
    const [entry] = build([restricted]).entries;
    expect(entry.line).toBeNull();
    expect(entry.lineWithheldReason).toMatch(/license/);
    expect(entry.projection?.value).toBe(26.1);
  });

  it("withholds a line of unknown age and flags a stale one", () => {
    const unknown = snap({ sourceLastUpdateUtc: null });
    expect(build([unknown]).entries[0].lineWithheldReason).toMatch(/age/);
    const stale = snap({ sourceLastUpdateUtc: iso(400), capturedAtUtc: iso(150) });
    expect(build([stale]).entries[0].line?.freshness).toBe("stale");
  });

  it("records why a projection is missing and derives the opponent", () => {
    const noProjection = snap({ projection: { value: null, minutes: null, modelVersion: null, inputCutoffUtc: null, unavailableReason: "no history" }, team: "BOS", name: "Dev Home" });
    const [entry] = build([noProjection]).entries;
    expect(entry.projection).toBeNull();
    expect(entry.projectionUnavailableReason).toBe("no history");
    expect(entry.opponent).toBe("NYK");
  });
});

describe("board rows", () => {
  const artifact = build(
    [
      snap({ name: "Alpha Guard" }),
      snap({ name: "Bravo Wing", line: 20.5, projection: { value: 18.0, minutes: 30, modelVersion: "nba-props-baseline-v0", inputCutoffUtc: iso(200), unavailableReason: null } }),
      snap({ name: "Charlie NoPos", line: 30.5 }),
      snap({ name: "Delta NoProj", projection: { value: null, minutes: null, modelVersion: null, inputCutoffUtc: null, unavailableReason: "no history" } }),
      snap({ name: "Echo NoLine", permissions: { ...PERMS, permittedUses: ["private-research"] } }),
    ],
    { "name:alpha guard|NYK": "SG", "name:bravo wing|NYK": "G-F", "name:delta noproj|NYK": "SG", "name:echo noline|NYK": "SG" },
  );
  const rows = buildBoardRows(artifact, "pts");
  const byName = (name: string) => rows.find((r) => r.entry.playerName === name)!;

  it("computes projection minus line only when both exist", () => {
    expect(byName("Alpha Guard").difference).toBeCloseTo(1.6);
    expect(byName("Bravo Wing").difference).toBeCloseTo(-2.5);
    expect(byName("Charlie NoPos").difference).toBeCloseTo(-4.4);
    expect(byName("Delta NoProj").difference).toBeNull();
    expect(byName("Echo NoLine").difference).toBeNull();
  });

  it("reports explicit DvP states", () => {
    const alpha = byName("Alpha Guard").dvp;
    expect(alpha.kind === "ok" && alpha.position).toBe("SG");
    expect(alpha.kind === "ok" && alpha.comparison.prior?.rank).toBe(29);
    const bravo = byName("Bravo Wing").dvp;
    expect(bravo.kind === "ok" && bravo.isMultiPosition).toBe(true);
    expect(byName("Charlie NoPos").dvp).toEqual({ kind: "no-position", reason: "empty position label" });
    const empty = buildBoardRows({ ...artifact, dvpRows: [] }, "pts");
    expect(empty.find((r) => r.entry.playerName === "Alpha Guard")!.dvp).toEqual({ kind: "no-dvp-data", position: "SG" });
  });

  it("separates markets", () => {
    expect(buildBoardRows(artifact, "reb")).toEqual([]);
  });

  it("sorts with missing values last in both directions and does not mutate", () => {
    const names = (sorted: typeof rows) => sorted.map((r) => r.entry.playerName);
    const before = names(rows);
    expect(names(sortBoardRows(rows, "difference", "desc")).slice(0, 2)).toEqual(["Alpha Guard", "Bravo Wing"]);
    expect(names(sortBoardRows(rows, "difference", "asc")).slice(0, 2)).toEqual(["Charlie NoPos", "Bravo Wing"]);
    expect(names(sortBoardRows(rows, "difference", "asc")).slice(-2).sort()).toEqual(["Delta NoProj", "Echo NoLine"]);
    expect(names(sortBoardRows(rows, "player", "asc"))[0]).toBe("Alpha Guard");
    expect(names(rows)).toEqual(before);
  });

  it("sorts by blended DvP rank with unranked rows last", () => {
    const sorted = sortBoardRows(rows, "dvpRank", "asc");
    const kinds = sorted.map((r) => r.dvp.kind === "ok");
    expect(kinds).toEqual([true, true, true, true, false]);
    expect(sorted.at(-1)!.entry.playerName).toBe("Charlie NoPos");
  });

  it("filters by search, team, position and data availability", () => {
    expect(filterBoardRows(rows, { ...DEFAULT_FILTERS, search: "bravo" })).toHaveLength(1);
    expect(filterBoardRows(rows, { ...DEFAULT_FILTERS, team: "BOS" })).toHaveLength(5);
    expect(filterBoardRows(rows, { ...DEFAULT_FILTERS, team: "LAL" })).toHaveLength(0);
    expect(filterBoardRows(rows, { ...DEFAULT_FILTERS, position: "SF" }).map((r) => r.entry.playerName)).toEqual(["Bravo Wing"]);
    expect(filterBoardRows(rows, { ...DEFAULT_FILTERS, onlyWithLine: true })).toHaveLength(4);
    expect(filterBoardRows(rows, { ...DEFAULT_FILTERS, onlyWithProjection: true })).toHaveLength(4);
  });

  it("formats American prices", () => {
    expect([formatAmerican(-115), formatAmerican(105)]).toEqual(["-115", "+105"]);
  });
});
