import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseWalterWindowPage } from "./parseGamePage.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(join(ROOT, "__fixtures__", name), "utf8");
}

describe("parseWalterWindowPage", () => {
  it("parses the one published game panel out of a live early-window fixture", () => {
    const html = loadFixture("2026-week01-early.html");
    const { games, pageWarnings } = parseWalterWindowPage(html, {
      sourceUrl: "https://walterfootball.com/nflpicks2026_01early.php",
    });

    expect(games).toHaveLength(1);
    expect(pageWarnings).toEqual([]);

    const [game] = games;
    expect(game.awayName).toBe("New England Patriots");
    expect(game.homeName).toBe("Seattle Seahawks");
    expect(game.headerLine).toContain("Seahawks by 3.5");
    expect(game.kickoffText).toContain("Wednesday, Sept. 9");
    expect(game.parseWarnings).toEqual([]);
  });

  it("extracts all five h3 sections with their edges", () => {
    const html = loadFixture("2026-week01-early.html");
    const { games } = parseWalterWindowPage(html);
    const [game] = games;

    expect(game.sections.matchup.edge).toBe("Seahawks");
    expect(game.sections.motivation.edge).toBeNull();
    expect(game.sections.spread.edge).toBe("Seahawks");
    expect(game.sections.vegas.edge).toBeNull();
    expect(game.sections.trends).toBeDefined();
  });

  it("splits the matchup section into labeled team/topic subsections", () => {
    const html = loadFixture("2026-week01-early.html");
    const { games } = parseWalterWindowPage(html);
    const [game] = games;

    const labels = game.sections.matchup.labeledBlocks.map((b) => b.label);
    expect(labels).toContain("NEW ENGLAND OFFENSE");
    expect(labels).toContain("SEATTLE OFFENSE");
    expect(labels).toContain("SAME-GAME PARLAY");

    const patriotsOffense = game.sections.matchup.labeledBlocks.find((b) => b.label === "NEW ENGLAND OFFENSE");
    expect(patriotsOffense.text).toContain("Campbell was injured");
  });

  it("extracts the spread calculation lines", () => {
    const html = loadFixture("2026-week01-early.html");
    const { games } = parseWalterWindowPage(html);
    const [game] = games;

    expect(game.sections.spread.lines["WalterFootball.com Calculated Spread"]).toContain("Seahawks -4");
    expect(game.sections.spread.lines["Computer Model"]).toContain("Seahawks -6");
  });

  it("extracts trend list items and opening line/total", () => {
    const html = loadFixture("2026-week01-early.html");
    const { games } = parseWalterWindowPage(html);
    const [game] = games;

    expect(game.sections.trends.items.length).toBeGreaterThan(0);
    expect(game.sections.trends.lines["Opening Line"]).toContain("Seahawks -3.5");
    expect(game.sections.trends.lines["Opening Total"]).toContain("44.5");
  });

  it("extracts the official pick block without crossing into premium content", () => {
    const html = loadFixture("2026-week01-early.html");
    const { games } = parseWalterWindowPage(html);
    const [game] = games;

    expect(game.pick.rawText).toContain("Seahawks 24, Patriots 20");
    expect(game.pick.rawText).toContain("Seahawks -3.5 (2 Units)");
    expect(game.pick.rawText).not.toContain("Premium members have access");
  });

  it("parses a second, independently-fetched window page (late games) with a different game", () => {
    const html = loadFixture("2026-week01-late.html");
    const { games, pageWarnings } = parseWalterWindowPage(html);

    expect(pageWarnings).toEqual([]);
    expect(games.length).toBeGreaterThanOrEqual(1);
    const [game] = games;
    expect(game.awayName).toBe("Arizona Cardinals");
    expect(game.homeName).toBe("Los Angeles Chargers");
    expect(game.pick.rawText).toContain("Chargers 38, Cardinals 17");
  });

  it("returns zero games with a warning when the page has no game panels yet", () => {
    const html = "<html><body><div class='entry-content'><h1>NFL Picks Against the Spread: Week 1, 2026</h1><p>Picks will be posted soon.</p></div></body></html>";
    const { games, pageWarnings } = parseWalterWindowPage(html);

    expect(games).toEqual([]);
    expect(pageWarnings).toEqual(["no div.panel[id] elements found on page -- layout may have changed"]);
  });

  it("never throws on malformed/empty HTML", () => {
    expect(() => parseWalterWindowPage("<html><body>not a picks page</body></html>")).not.toThrow();
    expect(() => parseWalterWindowPage("")).not.toThrow();
  });
});
