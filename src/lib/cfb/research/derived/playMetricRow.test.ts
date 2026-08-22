import { describe, expect, it } from "vitest";
import type { CfbResearchPlay } from "../types";
import { buildPlayMetricRow } from "./playMetricRow";

function makePlay(overrides: Partial<CfbResearchPlay> = {}): CfbResearchPlay {
  return {
    playId: "p1",
    gameId: "g1",
    driveId: "d1",
    season: 2019,
    week: 5,
    offenseExternalId: "1",
    defenseExternalId: "2",
    offenseTeamId: "ala",
    defenseTeamId: "miss",
    offenseName: "Alabama",
    defenseName: "Ole Miss",
    period: 1,
    clockMinutes: 10,
    clockSeconds: 0,
    down: 1,
    distance: 10,
    yardLine: 50,
    yardsToGoal: 50,
    yardsGained: 5,
    offenseScore: 0,
    defenseScore: 0,
    rawPlayType: "Rush",
    providerPpa: 0.3,
    providerSuccess: null,
    providerGarbageTime: null,
    providerScoringFlag: false,
    ...overrides,
  };
}

describe("buildPlayMetricRow — PPA success (definition A)", () => {
  it("is true when providerPpa > 0", () => {
    expect(buildPlayMetricRow({ play: makePlay({ providerPpa: 0.01 }), playText: null }).ppaSuccess).toBe(true);
  });

  it("is false when providerPpa <= 0", () => {
    expect(buildPlayMetricRow({ play: makePlay({ providerPpa: 0 }), playText: null }).ppaSuccess).toBe(false);
    expect(buildPlayMetricRow({ play: makePlay({ providerPpa: -0.1 }), playText: null }).ppaSuccess).toBe(false);
  });

  it("is null (not false) when providerPpa is missing — never imputed", () => {
    expect(buildPlayMetricRow({ play: makePlay({ providerPpa: null }), playText: null }).ppaSuccess).toBeNull();
  });
});

describe("buildPlayMetricRow — down/distance success (definition B)", () => {
  it("1st down requires >= 50% of distance", () => {
    const row = buildPlayMetricRow({ play: makePlay({ down: 1, distance: 10, yardsGained: 5 }), playText: null });
    expect(row.downDistanceSuccess).toBe(true);
    const rowFail = buildPlayMetricRow({
      play: makePlay({ down: 1, distance: 10, yardsGained: 4 }),
      playText: null,
    });
    expect(rowFail.downDistanceSuccess).toBe(false);
  });

  it("2nd down requires >= 70% of distance", () => {
    const row = buildPlayMetricRow({ play: makePlay({ down: 2, distance: 10, yardsGained: 7 }), playText: null });
    expect(row.downDistanceSuccess).toBe(true);
    const rowFail = buildPlayMetricRow({
      play: makePlay({ down: 2, distance: 10, yardsGained: 6 }),
      playText: null,
    });
    expect(rowFail.downDistanceSuccess).toBe(false);
  });

  it("3rd/4th down requires the full distance", () => {
    expect(
      buildPlayMetricRow({ play: makePlay({ down: 3, distance: 5, yardsGained: 5 }), playText: null })
        .downDistanceSuccess,
    ).toBe(true);
    expect(
      buildPlayMetricRow({ play: makePlay({ down: 4, distance: 5, yardsGained: 4 }), playText: null })
        .downDistanceSuccess,
    ).toBe(false);
  });

  it("is null when down, distance, or yardsGained is missing", () => {
    expect(
      buildPlayMetricRow({ play: makePlay({ down: null }), playText: null }).downDistanceSuccess,
    ).toBeNull();
    expect(
      buildPlayMetricRow({ play: makePlay({ yardsGained: null }), playText: null }).downDistanceSuccess,
    ).toBeNull();
  });
});

describe("buildPlayMetricRow — passing-down classification", () => {
  it("2nd & 8+ is a passing down; 2nd & 7 is not", () => {
    expect(buildPlayMetricRow({ play: makePlay({ down: 2, distance: 8 }), playText: null }).isPassingDown).toBe(
      true,
    );
    expect(buildPlayMetricRow({ play: makePlay({ down: 2, distance: 7 }), playText: null }).isPassingDown).toBe(
      false,
    );
  });

  it("3rd/4th & 5+ is a passing down; 3rd & 4 is not", () => {
    expect(buildPlayMetricRow({ play: makePlay({ down: 3, distance: 5 }), playText: null }).isPassingDown).toBe(
      true,
    );
    expect(buildPlayMetricRow({ play: makePlay({ down: 4, distance: 5 }), playText: null }).isPassingDown).toBe(
      true,
    );
    expect(buildPlayMetricRow({ play: makePlay({ down: 3, distance: 4 }), playText: null }).isPassingDown).toBe(
      false,
    );
  });

  it("1st down is never a passing down", () => {
    expect(buildPlayMetricRow({ play: makePlay({ down: 1, distance: 20 }), playText: null }).isPassingDown).toBe(
      false,
    );
  });
});

describe("buildPlayMetricRow — explosiveness", () => {
  it("flags an explosive pass at >= 20 yards", () => {
    const row = buildPlayMetricRow({
      play: makePlay({ rawPlayType: "Pass Reception", yardsGained: 20 }),
      playText: null,
    });
    expect(row.explosiveType).toBe("pass");
    expect(row.isExplosive).toBe(true);
  });

  it("flags an explosive rush at >= 12 yards, not 11", () => {
    expect(
      buildPlayMetricRow({ play: makePlay({ rawPlayType: "Rush", yardsGained: 12 }), playText: null })
        .isExplosive,
    ).toBe(true);
    expect(
      buildPlayMetricRow({ play: makePlay({ rawPlayType: "Rush", yardsGained: 11 }), playText: null })
        .isExplosive,
    ).toBe(false);
  });

  it("does not classify sacks or turnovers as explosive-eligible", () => {
    const row = buildPlayMetricRow({
      play: makePlay({ rawPlayType: "Sack", yardsGained: -8 }),
      playText: null,
    });
    expect(row.explosiveType).toBeNull();
    expect(row.isExplosive).toBeNull();
  });
});

describe("buildPlayMetricRow — eligibility and flags", () => {
  it("rush/pass/sack/turnover are eligible; punt/kickoff/penalty/admin are not", () => {
    expect(buildPlayMetricRow({ play: makePlay({ rawPlayType: "Rush" }), playText: null }).eligible).toBe(true);
    expect(buildPlayMetricRow({ play: makePlay({ rawPlayType: "Punt" }), playText: null }).eligible).toBe(false);
    expect(buildPlayMetricRow({ play: makePlay({ rawPlayType: "Penalty" }), playText: null }).eligible).toBe(
      false,
    );
  });

  it("flags two-point tries and overtime without changing eligibility", () => {
    const row = buildPlayMetricRow({
      play: makePlay({ rawPlayType: "Two Point Rush", period: 5 }),
      playText: null,
    });
    expect(row.isTwoPointTry).toBe(true);
    expect(row.isOvertime).toBe(true);
  });
});
