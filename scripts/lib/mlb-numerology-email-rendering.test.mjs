import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "./mlb-numerology-tracking.mjs";
import { validateNumerologyEmailHtml } from "./mlb-numerology-email-validation.mjs";

function fixturePlay(player, team, opponent, score, opposingPitcher, pitcherXera, playerId) {
  return {
    player,
    playerId,
    team,
    opponent,
    numerologyScore: score,
    opposingPitcher,
    pitcherXera,
    matchType: "Exact Match",
    explanation: `${player} owns the strongest exact-date and jersey-number alignments.`,
    numerologySignals: [
      { label: "Birth Day Alignment", field: "birthDay", value: 19, points: 25, type: "exact" },
      { label: "Jersey Alignment", field: "jerseyNumber", value: 3, points: 20, type: "exact" },
    ],
    seasonStats: { avg: ".282", obp: ".331", slg: ".435", ops: ".766", homeRuns: 14, rbi: 53, atBats: 365, plateAppearances: 397 },
    lastFiveGames: {
      available: true,
      games: [
        { opponent: "NYM", atBats: 4, hits: 2, homeRuns: 1, totalBases: 5, rbi: 2 },
        { opponent: "LAD", atBats: 4, hits: 1, homeRuns: 0, totalBases: 1, rbi: 0 },
      ],
    },
    hrEnrichmentStatus: "enriched",
    hrScore: 71,
    hrOddsYes: "+420",
    hrOddsBook: "Fixture Book",
    barrelRate: 12.4,
    hardHitRate: 45.1,
    iso: ".193",
  };
}

function fixtureCard() {
  const plays = [
    fixturePlay("Jackson Merrill", "SD", "NYM", 79, "Kodai Senga", 3.72, 701538),
    fixturePlay("Vladimir Guerrero Jr.", "TOR", "LAD", 72, "Yoshinobu Yamamoto", 2.91, 665489),
    fixturePlay("Francisco Lindor", "NYM", "SD", 64, "Dylan Cease", 3.88, 596019),
  ];
  return {
    date: "2026-07-12",
    dailyNumber: 1,
    dailyProfile: { universalDayCompound: 19, universalDayRoot: 1 },
    livePageUrl: "https://www.joeknowsball.com/mlb/numerology",
    scoreThreshold: 50,
    topPlay: { ...plays[0], isTopPlay: true },
    emailSelectedPlays: plays.map((play, index) => ({ ...play, isTopPlay: index === 0 })),
    emailSelectionPolicy: { threshold: 65, minimumPlays: 3, mode: "top-minimum", aboveThresholdCount: 2, selectedCount: 3 },
  };
}

function fixtureSummary() {
  const result = { total: 3, finalized: 3, hasStats: true, avg: 0.333, hits: 4, atBats: 12, homeRuns: 1, totalBases: 8, rbi: 3, runs: 2, baseOnBalls: 1, strikeOuts: 2 };
  return {
    resultBuckets: {
      previousDay: { date: "2026-07-11", topPlay: result, over50: result },
      overall: { topPlay: result, over50: result },
    },
  };
}

describe("Numerology email rendering integrity", () => {
  it("renders structured player fields without positional remapping", () => {
    const card = fixtureCard();
    const html = renderEmailHtml(card, fixtureSummary());
    const document = new JSDOM(html).window.document;
    const summaries = [...document.querySelectorAll('[data-numerology-summary-entry="true"]')];
    const details = [...document.querySelectorAll('[data-numerology-play-card="true"]')];

    expect(summaries).toHaveLength(card.emailSelectedPlays.length);
    expect(details).toHaveLength(card.emailSelectedPlays.length);
    expect(summaries.map((node) => node.getAttribute("data-player-name"))).toEqual(card.emailSelectedPlays.map((play) => play.player));
    expect(details.map((node) => node.getAttribute("data-player-name"))).toEqual(card.emailSelectedPlays.map((play) => play.player));

    const jacksonSummary = summaries[0];
    const jacksonDetail = details[0];
    expect(jacksonSummary.textContent).toContain("Jackson Merrill");
    expect(jacksonSummary.textContent).toContain("SD vs NYM");
    expect(jacksonSummary.textContent).toContain("79");
    expect(jacksonSummary.textContent).toContain("Kodai Senga");
    expect(jacksonSummary.textContent).toContain("xERA 3.72");
    expect(jacksonSummary.getAttribute("data-opposing-pitcher")).toBe("Kodai Senga");
    expect(jacksonSummary.getAttribute("data-numerology-score")).toBe("79");
    expect(jacksonDetail.textContent).toContain("Opposing pitcher");
    expect(jacksonDetail.textContent).toContain("Kodai Senga");
    expect(jacksonDetail.textContent).toContain("Pitcher xERA");
    expect(jacksonDetail.textContent).toContain("3.72");

    for (const label of ["AVG", "OBP", "SLG", "OPS"]) {
      const labelNodes = [...document.querySelectorAll("span")].filter((node) => node.textContent.trim() === label);
      expect(labelNodes.length).toBeGreaterThan(0);
      expect(labelNodes.every((node) => node.closest('[data-numerology-season-stats="true"]'))).toBe(true);
    }
    expect(html).not.toMatch(/Opposing pitcher:\s*OPS/i);
    expect(summaries.map((node) => node.getAttribute("data-player-name"))).not.toEqual(expect.arrayContaining(["NYM", "LAD", "SD", "TOR", "AVG", "OPS"]));
    expect(document.querySelectorAll('[data-numerology-game-row="true"]')).toHaveLength(8);
    expect([...document.querySelectorAll('[data-numerology-game-row="true"]')].every((row) => !row.hasAttribute("data-numerology-summary-entry") && !row.hasAttribute("data-numerology-play-card"))).toBe(true);
  });

  it("keeps all required sections and isolates tracking immediately above the footer", () => {
    const card = fixtureCard();
    const html = renderEmailHtml(card, fixtureSummary());
    const document = new JSDOM(html).window.document;
    const header = document.querySelector('[data-numerology-header="true"]');
    const topPlay = document.querySelector('[data-numerology-top-play="true"]');
    const summary = document.querySelector('[data-numerology-summary="true"]');
    const details = document.querySelector('[data-numerology-details="true"]');
    const tracking = document.querySelector('[data-numerology-tracking="true"]');
    const footer = document.querySelector('[data-numerology-footer="true"]');

    expect(header?.textContent).toContain("Joe Knows Ball");
    expect(header?.textContent).toContain("MLB Numerology Plays — 2026-07-12");
    expect(header?.textContent).toContain("Universal Day 19/1");
    expect(topPlay?.textContent).toContain("Top Play");
    expect(summary).not.toBeNull();
    expect(details).not.toBeNull();
    expect(tracking?.textContent).toContain("Tracking Snapshot");
    expect(tracking?.textContent).toContain("Previous Day");
    expect(tracking?.textContent).toContain("All tracked slates");
    expect(tracking?.textContent).toContain("Top Play");
    expect(tracking?.textContent).toContain("All Qualifying Plays");
    expect(tracking?.contains(footer)).toBe(false);
    expect(details?.nextElementSibling).toBe(tracking);
    expect(tracking?.nextElementSibling).toBe(footer);
    expect(footer?.textContent).not.toMatch(/Previous Day|Overall|All Qualifying Plays|finalized/i);
    expect(footer?.textContent).toContain("View the full MLB Numerology board");
  });

  it("fails closed on corrupted mappings, missing structure, and count mismatches", () => {
    const card = fixtureCard();
    const validHtml = renderEmailHtml(card, fixtureSummary());
    expect(validateNumerologyEmailHtml(validHtml, card)).toMatchObject({ valid: true, summaryCount: 3, detailedCount: 3 });

    const corrupted = validHtml
      .replace('data-player-name="Jackson Merrill"', 'data-player-name="AVG"')
      .replace("Kodai Senga", "OPS")
      .replace('data-numerology-header="true"', "");
    const result = validateNumerologyEmailHtml(corrupted, card);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/header|summary|malformed/i);

    const missingCard = validHtml.replace('data-numerology-play-card="true"', 'data-numerology-play-card="removed"');
    expect(validateNumerologyEmailHtml(missingCard, card).errors.join(" ")).toContain("Detailed-card count 2");

    const opsAsPitcher = validHtml.replace('data-opposing-pitcher="Kodai Senga"', 'data-opposing-pitcher="OPS"');
    expect(validateNumerologyEmailHtml(opsAsPitcher, card).errors.join(" ")).toMatch(/OPS rendered as an opposing pitcher|field mapping is malformed/i);
  });
});
