import { describe, expect, it } from "vitest";
import { CFB_FBS_TEAM_COUNT } from "./teamMetadata";
import {
  CFB_EXTERNAL_TEAM_MAPPINGS,
  getJkbTeamIdForCfbdName,
  normalizeCfbdTeamName,
} from "./externalTeamMapping";

describe("CFB external team mapping", () => {
  it("maps all 138 JKB FBS teams without duplicate IDs or external names", () => {
    expect(CFB_EXTERNAL_TEAM_MAPPINGS).toHaveLength(CFB_FBS_TEAM_COUNT);
    expect(new Set(CFB_EXTERNAL_TEAM_MAPPINGS.map((row) => row.jkbTeamId)).size).toBe(138);
    expect(new Set(CFB_EXTERNAL_TEAM_MAPPINGS.map((row) => row.jkbSlug)).size).toBe(138);
    expect(new Set(CFB_EXTERNAL_TEAM_MAPPINGS.map((row) => row.espnId)).size).toBe(138);
    expect(
      new Set(CFB_EXTERNAL_TEAM_MAPPINGS.map((row) => normalizeCfbdTeamName(row.cfbdName))).size,
    ).toBe(138);
    expect(CFB_EXTERNAL_TEAM_MAPPINGS.every((row) => getJkbTeamIdForCfbdName(row.cfbdName))).toBe(true);
  });

  it("centralizes known CFBD aliases", () => {
    expect(getJkbTeamIdForCfbdName("Ole Miss")).toBe("miss");
    expect(getJkbTeamIdForCfbdName("Mississippi")).toBe("miss");
    expect(getJkbTeamIdForCfbdName("North Carolina State")).toBe("ncsu");
    expect(getJkbTeamIdForCfbdName("Hawai'i")).toBe("haw");
  });
});
