import { describe, expect, it } from "vitest";
import type { CfbdResearchReturningProductionRaw, CfbdResearchTalentRaw, CfbdResearchTeamRaw } from "../types";
import { normalizeResearchTeamSeason } from "./normalizeTeamSeason";

const TEAMS: CfbdResearchTeamRaw[] = [
  { id: 333, school: "Alabama", conference: "SEC", classification: "fbs" },
  { id: 9999, school: "Defunct Program", conference: "Independent", classification: "fbs" },
];

const RETURNING: CfbdResearchReturningProductionRaw[] = [
  { season: 2019, team: "Alabama", conference: "SEC", totalPPA: 100, percentPPA: 0.72, usage: 0.6 },
];

const TALENT: CfbdResearchTalentRaw[] = [{ year: 2019, team: "Alabama", talent: 984.96 }];

describe("normalizeResearchTeamSeason", () => {
  it("resolves a known current team to its JKB id and joins returning production + talent", () => {
    const rows = normalizeResearchTeamSeason(2019, TEAMS, RETURNING, TALENT);
    const alabama = rows.find((r) => r.externalTeamId === "333")!;
    expect(alabama.jkbTeamId).toBe("ala");
    expect(alabama.returningProductionPercentPpa).toBeCloseTo(0.72);
    expect(alabama.returningProductionUsage).toBeCloseTo(0.6);
    expect(alabama.talentComposite).toBeCloseTo(984.96);
  });

  it("preserves the external id with a null jkbTeamId for an unmapped program, never fabricating one", () => {
    const rows = normalizeResearchTeamSeason(2019, TEAMS, RETURNING, TALENT);
    const defunct = rows.find((r) => r.externalTeamId === "9999")!;
    expect(defunct.jkbTeamId).toBeNull();
    expect(defunct.externalTeamId).toBe("9999");
  });

  it("leaves returning production and talent null when no join match exists", () => {
    const rows = normalizeResearchTeamSeason(2019, TEAMS, [], []);
    const alabama = rows.find((r) => r.externalTeamId === "333")!;
    expect(alabama.returningProductionPercentPpa).toBeNull();
    expect(alabama.returningProductionUsage).toBeNull();
    expect(alabama.talentComposite).toBeNull();
  });
});
