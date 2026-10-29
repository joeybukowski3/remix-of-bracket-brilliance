import { describe, expect, it } from "vitest";
import { PRIVATE_AUDIT_MARKER, type AuditReport, type PlayerAudit } from "./postgameAudit";
import { renderAuditMarkdown } from "./postgameAuditReport";

const player = (over: Partial<PlayerAudit>): PlayerAudit => ({
  name: "Player A", team: "AAA", position: null, modelVersion: "nba-props-baseline-v0", projPts: 20, projMin: 30,
  line: { line: 18.5, sportsbook: "bookx", overPrice: -110, underPrice: -110, capturedAtUtc: "2026-10-28T20:43:31Z" }, bookLines: [], excludedBooks: [],
  status: "played", actPts: 10, actMin: 25, started: true, ptsErr: 10, minErr: 5, lineErr: 8.5, projPPM: 0.667, actPPM: 0.4, minutesEffect: 3.3, rateEffect: 6.7,
  gap: 1.5, jkbSide: "Over", result: "Under", dirHit: false, jkbCloser: false, identity: { boxId: "1", idMatches: true, teamMatches: true }, ...over,
});
const summary = { n: 1, jkbMAE: 10, jkbME: 10, lineMAE: 8.5, lineME: 8.5, minMAE: 5, minME: 5, dirHits: 0, dirN: 1, closer: 0, minutesEffect: 3.3, rateEffect: 6.7 };
const report: AuditReport = {
  privateMarker: PRIVATE_AUDIT_MARKER,
  gameKey: "2026-10-28|AAA@BBB", tipoffUtc: "2026-10-29T00:10:00Z", boardBuiltUtc: "2026-10-28T20:44:19Z", boxRetrievedAtUtc: "2026-10-29T12:28:27Z", captureIds: ["cap_x"], modelVersions: ["nba-props-baseline-v0"],
  finalScore: { AAA: 104, BBB: 91 }, players: [player({}), player({ name: "Player E", status: "no-box-row", line: null, actPts: null, ptsErr: null })], matched: summary, groups: { "<1": null, "1-3": summary, ">=3": null },
  allPlayed: { n: 1, jkbMAE: 10, jkbME: 10, minMAE: 5, minME: 5, projTotalPts: 20, actTotalPts: 10, projTotalMin: 30, actTotalMin: 25 },
  missing: [{ name: "Player E", team: "AAA", status: "no-box-row", projPts: 5, projMin: 15 }], warnings: ["a sample of 1 scored players with lines is too small"],
};

describe("the audit renders as a private markdown report", () => {
  const text = renderAuditMarkdown(report);
  it("carries the private marker the containment check looks for, in the report data and the markdown", () => {
    expect(text).toContain(PRIVATE_AUDIT_MARKER);
    expect(report.privateMarker).toBe(PRIVATE_AUDIT_MARKER);
  });
  it("opens with the private-use notice and the provenance of the pregame and final data", () => {
    expect(text).toMatch(/^# .*2026-10-28\|AAA@BBB/);
    expect(text).toMatch(/PRIVATE/);
    expect(text).toMatch(/board built 2026-10-28T20:44:19Z/);
    expect(text).toMatch(/cap_x/);
    expect(text).toMatch(/nba-props-baseline-v0/);
  });
  it("states the sign convention, the summary figures, the gap groups, the missing players and the warnings", () => {
    expect(text).toMatch(/positive = over-prediction/);
    expect(text).toMatch(/JKB MAE 10\.00/);
    expect(text).toMatch(/\| 1-3 \| 1 \|/);
    expect(text).toMatch(/Player E.*no-box-row/);
    expect(text).toMatch(/too small/);
  });
});

describe("report cells cannot break the table or inject markup", () => {
  it("escapes pipes, line breaks, angle brackets, brackets and backticks in names, books and warnings", () => {
    const hostile = "Eve|l\nName <b>[x](javascript:1) `c`";
    const text = renderAuditMarkdown({ ...report, players: [player({ name: hostile, line: { line: 1.5, sportsbook: "a|b", overPrice: -110, underPrice: -110, capturedAtUtc: "2026-10-28T20:43:31Z" } })], missing: [{ name: hostile, team: "AAA", status: "dnp", projPts: 1, projMin: 1 }], warnings: [hostile] });
    const row = text.split("\n").find((l) => l.startsWith("| Eve"));
    expect(row?.split(/(?<!\\)\|/).length).toBe(15);
    expect(text).not.toMatch(/<b>/);
    expect(text).not.toMatch(/\[x\]\(javascript/);
    expect(text).not.toMatch(/Eve\|l\nName/);
  });
});
