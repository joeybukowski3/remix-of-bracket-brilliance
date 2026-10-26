import { describe, expect, it } from "vitest";
import { parseCsv } from "../pipeline/csv";
import type { PlayerSeasonSummary } from "./hooprAdapter";
import type { Proposal } from "./positionProposals";
import { coverageIfAccepted, proposalsCsv, withinEspnListing, type MinutesRow, type ProposalRow } from "./positionProposalReport";
import { overridesFromCsv, type ReviewEntry } from "./positionReview";

const entry = (playerId: string, over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  priority: 1, playerId, name: `Demo ${playerId}`, team: "BOS", onSlate: true, minutes: { "2025-26": 1500, "2026-27": 40 }, games: { "2025-26": 60, "2026-27": 2 },
  espnListing: "G", allowedByEspn: ["PG", "SG"], evidence: { kind: "item-without-position", qid: "Q1", scopedCandidates: [], hybridLabels: [] }, ...over,
});
const proposal = (playerId: string, over: Partial<Proposal> = {}): Proposal => ({
  playerId, name: `Demo ${playerId}`, team: "BOS", minutes: 1540, espnGroup: "G", best: "PG", probability: 0.91, status: "proposed", confidence: "high", evidence: "PG (0.91); high confidence", ...over,
});
const row = (rank: number, e: ReviewEntry, p: Proposal): ProposalRow => ({ rank, entry: e, proposal: p });

describe("proposalsCsv", () => {
  it("lists the proposal, its status and evidence, and ends with blank reviewer columns", () => {
    const [head, line] = parseCsv(proposalsCsv([row(1, entry("1"), proposal("1"))]));
    expect(head.slice(-3)).toEqual(["primary", "secondary", "reason"]);
    expect(line.slice(-3)).toEqual(["", "", ""]);
    const cells = Object.fromEntries(head.map((h, i) => [h, line[i]]));
    expect(cells).toMatchObject({ rank: "1", playerId: "1", proposedPrimary: "PG", probability: "0.91", status: "proposed", confidence: "high", onSlate: "yes", "minutes2025-26": "1500" });
  });

  it("shows no proposed position for an unassigned player, so a best guess cannot be mistaken for a proposal", () => {
    const [head, line] = parseCsv(proposalsCsv([row(1, entry("1"), proposal("1", { status: "unassigned", confidence: null, best: "SG", probability: 0.6, evidence: "best guess SG (0.60) is below the threshold" }))]));
    const cells = Object.fromEntries(head.map((h, i) => [h, line[i]]));
    expect(cells).toMatchObject({ proposedPrimary: "", status: "unassigned", confidence: "", probability: "0.60" });
    expect(cells.evidence).toMatch(/best guess SG/);
  });

  it("neutralizes spreadsheet formulas in names and evidence", () => {
    const [head, line] = parseCsv(proposalsCsv([row(1, entry("1", { name: "=cmd()" }), proposal("1", { evidence: "+SUM(1)" }))]));
    const cells = Object.fromEntries(head.map((h, i) => [h, line[i]]));
    expect(cells.name).toBe("'=cmd()");
    expect(cells.evidence).toBe("'+SUM(1)");
  });

  it("applies nothing by itself: read back as overrides, an unreviewed file changes no position", () => {
    const players: PlayerSeasonSummary[] = [{ season: "2025-26", playerId: "1", name: "Demo 1", team: "BOS", games: 60, starts: 40, minutes: 1500, espnPositions: { G: 60 } }];
    expect(overridesFromCsv(proposalsCsv([row(1, entry("1"), proposal("1"))]), players)).toEqual([]);
  });

  it("becomes an override only when a reviewer fills primary and a reason", () => {
    const players: PlayerSeasonSummary[] = [{ season: "2025-26", playerId: "1", name: "Demo 1", team: "BOS", games: 60, starts: 40, minutes: 1500, espnPositions: { G: 60 } }];
    const reviewed = proposalsCsv([row(1, entry("1"), proposal("1"))]).trimEnd().replace(/,,,$/, ",PG,,confirmed against the team site");
    expect(overridesFromCsv(`${reviewed}\n`, players)).toEqual([{ season: "2025-26", playerId: "1", primary: "PG", secondary: [], reason: "confirmed against the team site" }]);
  });
});

describe("coverageIfAccepted", () => {
  const minutes = (season: string, playerId: string, m: number, seasonType = "regular"): MinutesRow => ({ season, seasonType, playerId, minutes: m });
  const rows = [minutes("2025-26", "a", 500), minutes("2025-26", "b", 300), minutes("2025-26", "c", 200), minutes("2025-26", "c", 100, "preseason"), minutes("2026-27", "a", 50), minutes("2026-27", "b", 50)];
  const known = new Map([["2025-26", new Set(["a"])], ["2026-27", new Set<string>()]]);
  const nonPreseason = (r: MinutesRow) => r.seasonType !== "preseason";

  it("reports the share of minutes with a position now, with the high-confidence proposals, with all proposals, and with every best guess", () => {
    const result = coverageIfAccepted(rows, known, new Set(["b"]), new Set(["b", "c"]), new Set(["b", "c", "d"]), nonPreseason);
    expect(result["2025-26"].totalMinutes).toBe(1000);
    expect(result["2025-26"].current.coverage).toBe(0.5);
    expect(result["2025-26"].withHighConfidence.coverage).toBe(0.8);
    expect(result["2025-26"].withProposed.coverage).toBe(1);
    expect(result["2025-26"].withEveryBestGuess.coverage).toBe(1);
  });

  it("keeps seasons apart and applies a proposed player to every season he played", () => {
    const result = coverageIfAccepted(rows, known, new Set(["b"]), new Set(["b"]), new Set(["b"]), nonPreseason);
    expect(result["2026-27"].current.coverage).toBe(0);
    expect(result["2026-27"].withProposed.coverage).toBe(0.5);
  });

  it("counts only the rows the caller includes, so DvP can use regular-season games alone", () => {
    const all = coverageIfAccepted(rows, known, new Set(), new Set(), new Set(), () => true);
    expect(all["2025-26"].totalMinutes).toBe(1100);
    expect(all["2025-26"].current.coverage).toBeCloseTo(500 / 1100, 12);
    expect(coverageIfAccepted(rows, known, new Set(), new Set(), new Set(), (r) => r.seasonType === "regular")["2025-26"].totalMinutes).toBe(1000);
  });

  it("is zero, not NaN, for an empty selection", () => {
    expect(coverageIfAccepted([], known, new Set(), new Set(), new Set(), nonPreseason)).toEqual({});
  });
});

describe("withinEspnListing", () => {
  it("keeps a proposal the review list's ESPN listing allows", () => {
    const p = proposal("1", { best: "PG" });
    expect(withinEspnListing(p, ["PG", "SG"])).toBe(p);
  });

  it("withdraws a proposal outside what the latest listing allows, and says why", () => {
    const result = withinEspnListing(proposal("1", { best: "PG" }), ["SF", "PF"]);
    expect(result).toMatchObject({ status: "unassigned", confidence: null, best: "PG" });
    expect(result.evidence).toMatch(/outside what ESPN's latest listing allows.*SF\/PF/);
  });

  it("leaves an unassigned proposal alone", () => {
    const p = proposal("1", { status: "unassigned", confidence: null, best: "PG" });
    expect(withinEspnListing(p, ["SF"])).toBe(p);
  });
});
