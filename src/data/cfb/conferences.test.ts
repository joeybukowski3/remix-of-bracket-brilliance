import { describe, expect, it } from "vitest";
import { CFB_CONFERENCES, CFB_CONFERENCE_ORDER, getConferenceBySlug, getConferenceMeta } from "./conferences";

describe("CFB conference metadata", () => {
  it("gives every conference in the production order a full name and a logo", () => {
    for (const id of CFB_CONFERENCE_ORDER) {
      const meta = CFB_CONFERENCES[id];
      expect(meta.fullName.length).toBeGreaterThan(0);
      expect(meta.fullName).not.toBe(meta.shortName);
      expect(meta.logo).not.toBeNull();
      expect(meta.logo).toMatch(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/ncaa_conf\/500\/.+\.png$/);
    }
  });

  it("keeps logo URLs unique across conferences (no accidental duplicate slug mapping)", () => {
    const logos = CFB_CONFERENCE_ORDER.map((id) => CFB_CONFERENCES[id].logo);
    expect(new Set(logos).size).toBe(logos.length);
  });

  it("getConferenceMeta returns the matching record by id", () => {
    expect(getConferenceMeta("sec").fullName).toBe("Southeastern Conference");
    expect(getConferenceMeta("big-ten").fullName).toBe("Big Ten Conference");
  });

  it("getConferenceBySlug resolves by slug", () => {
    expect(getConferenceBySlug("sec")?.id).toBe("sec");
    expect(getConferenceBySlug("not-a-conference")).toBeUndefined();
  });
});
