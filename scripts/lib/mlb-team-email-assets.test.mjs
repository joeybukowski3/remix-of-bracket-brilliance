import test from "node:test";
import assert from "node:assert/strict";
import { getEmailTeamLogoUrl, getEmailTeamColors } from "./mlb-team-email-assets.mjs";

test("resolves the Arizona Diamondbacks logo for both ARI and AZ", () => {
  const expected = "https://www.joeknowsball.com/logos/mlb/ari.svg";
  assert.equal(getEmailTeamLogoUrl("ARI"), expected);
  assert.equal(getEmailTeamLogoUrl("AZ"), expected);
  assert.equal(getEmailTeamLogoUrl("az"), expected);
});

test("resolves the Arizona Diamondbacks colors for both ARI and AZ", () => {
  const expected = { primary: "#A71930", secondary: "#E3D4AD" };
  assert.deepEqual(getEmailTeamColors("ARI"), expected);
  assert.deepEqual(getEmailTeamColors("AZ"), expected);
});

test("still resolves other representative teams correctly", () => {
  assert.equal(getEmailTeamLogoUrl("NYY"), "https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png");
});

test("falls back to the generic MLB logo/color for an unknown team", () => {
  assert.equal(getEmailTeamLogoUrl("ZZZ"), "https://a.espncdn.com/i/teamlogos/mlb/500/mlb.png");
  assert.deepEqual(getEmailTeamColors("ZZZ"), { primary: "#334155", secondary: "#CBD5E1" });
});
