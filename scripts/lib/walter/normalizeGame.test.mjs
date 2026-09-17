import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseWalterWindowPage } from "./parseGamePage.mjs";
import { normalizeGame } from "./normalizeGame.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(join(ROOT, "__fixtures__", name), "utf8");
}

function normalizeFixtureGame(fixtureName, captureType = "wednesday") {
  const html = loadFixture(fixtureName);
  const { games } = parseWalterWindowPage(html, { sourceUrl: "https://walterfootball.com/x.php" });
  return normalizeGame(games[0], {
    season: 2026,
    week: 1,
    captureType,
    capturedAt: "2026-09-09T06:00:00.000Z",
    sourceUrl: "https://walterfootball.com/x.php",
    window: "sun_early",
  });
}

describe("normalizeGame", () => {
  it("resolves team abbreviations and builds a stable gameId", () => {
    const capture = normalizeFixtureGame("2026-week01-early.html");
    expect(capture.game.away.abbr).toBe("NE");
    expect(capture.game.home.abbr).toBe("SEA");
    expect(capture.game.gameId).toBe("2026_01_NE_SEA");
    expect(capture.parseStatus).toBe("ok");
  });

  it("buckets team breakdowns by side using the labeled OFFENSE blocks", () => {
    const capture = normalizeFixtureGame("2026-week01-early.html");
    expect(capture.teamBreakdowns.away.join(" ")).toContain("Campbell was injured");
    expect(capture.teamBreakdowns.home.join(" ")).toContain("Kenneth Walker");
  });

  it("extracts injury mentions with a team side and does not fabricate a player field", () => {
    const capture = normalizeFixtureGame("2026-week01-early.html");
    expect(capture.injuries.length).toBeGreaterThan(0);
    const campbellInjury = capture.injuries.find((i) => i.sentence.includes("Campbell"));
    expect(campbellInjury).toBeDefined();
    expect(campbellInjury.team).toBe("away");
  });

  it("parses the official pick block into spread/units/total fields", () => {
    const capture = normalizeFixtureGame("2026-week01-early.html");
    expect(capture.betting.pick.spread).toContain("Seahawks -3.5");
    expect(capture.betting.pick.units).toBe(2);
    expect(capture.betting.total).toContain("Under 44.5");
  });

  it("builds a source-ordered breakdown covering every section", () => {
    const capture = normalizeFixtureGame("2026-week01-early.html");
    const topics = capture.sourceBreakdown.map((e) => e.topic);
    expect(topics).toContain("Trends");
    expect(topics).toContain("Official pick");
    expect(capture.sourceBreakdown.every((e, i, arr) => i === 0 || arr[i - 1].order < e.order)).toBe(true);
  });

  it("marks parseStatus partial when no pick block exists, without throwing", () => {
    const rawGame = {
      walterPanelId: "AAA_BBB",
      awayName: "Made Up Team",
      homeName: "Seattle Seahawks",
      headerLine: "",
      kickoffText: "",
      sections: { matchup: { edge: null, leadingParagraphs: [], labeledBlocks: [] } },
      pick: null,
      sourceUrl: null,
      parseWarnings: [],
    };
    const capture = normalizeGame(rawGame, {
      season: 2026,
      week: 1,
      captureType: "wednesday",
      capturedAt: "2026-09-09T06:00:00.000Z",
      sourceUrl: "https://walterfootball.com/x.php",
      window: "sun_early",
    });
    expect(capture.parseStatus).toBe("partial");
    expect(capture.game.gameId).toBeNull();
    expect(capture.parseWarnings.length).toBeGreaterThan(0);
  });
});
