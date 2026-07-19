/**
 * MlbModelEdgeHero.test.tsx
 * The new light-themed hero for the individual Game Matchup Analyzer page:
 * team/pitcher identity, game context, categorical model verdict, factor
 * breakdown with an Edge column, and takeaway -- all presentation-only,
 * sourced from computeModelEdge(detail) and other existing canonical
 * helpers (never recomputed independently in the test).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MlbModelEdgeHero from "./MlbModelEdgeHero";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";
import { computeModelEdge, getEdgeTierLabel } from "@/lib/mlb/mlbModelEdge";
import { computeK9 } from "@/lib/mlb/mlbFormatters";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";
import type { MlbOddsData } from "@/hooks/useMlbOdds";

const DETAIL = DEV_MLB_MATCHUP_FIXTURE.detail;
const AWAY = DETAIL.game.away.abbreviation; // NYY
const HOME = DETAIL.game.home.abbreviation; // BOS

const ODDS_WITH_LINE: MlbOddsData = {
  fetchedAt: new Date().toISOString(),
  moneylines: {
    [`${AWAY}@${HOME}`]: {
      away: { team: AWAY, american: "-145", implied: 0.59 },
      home: { team: HOME, american: "+125", implied: 0.44 },
    },
  },
  hrOdds: {},
  kOdds: {},
};

function renderHero(detail: MlbGameDetail = DETAIL, mlbOdds: MlbOddsData | null = null) {
  return render(
    <MemoryRouter>
      <MlbModelEdgeHero detail={detail} mlbOdds={mlbOdds} />
    </MemoryRouter>,
  );
}

describe("MlbModelEdgeHero — team, pitcher, and game context", () => {
  it("1. renders both team names, abbreviations, and logos", () => {
    renderHero();
    expect(screen.getAllByText(AWAY, { selector: "div" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(HOME, { selector: "div" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(DETAIL.game.away.name)).toBeInTheDocument();
    expect(screen.getByText(DETAIL.game.home.name)).toBeInTheDocument();
    expect(screen.getAllByAltText(/NYY logo|BOS logo/i).length).toBeGreaterThanOrEqual(2);
  });

  it("renders real team records, never placeholders", () => {
    renderHero();
    expect(screen.getByText(DETAIL.game.away.record)).toBeInTheDocument();
    expect(screen.getByText(DETAIL.game.home.record)).toBeInTheDocument();
  });

  it("2. renders both starting pitcher names", () => {
    renderHero();
    expect(screen.getByText(DETAIL.starters.away.name)).toBeInTheDocument();
    expect(screen.getByText(DETAIL.starters.home.name)).toBeInTheDocument();
  });

  it("3. shows ERA and the canonical computeK9 value for each pitcher", () => {
    renderHero();
    const awayK9 = computeK9(DETAIL.starters.away.strikeOuts, DETAIL.starters.away.inningsPitched);
    const homeK9 = computeK9(DETAIL.starters.home.strikeOuts, DETAIL.starters.home.inningsPitched);
    expect(screen.getByText(new RegExp(`${DETAIL.starters.away.era} ERA`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${awayK9?.toFixed(1)} K/9`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${homeK9?.toFixed(1)} K/9`))).toBeInTheDocument();
  });

  it("3b. omits the K/9 segment cleanly (no dash) when computeK9 cannot return a value", () => {
    const detailWithoutK9: MlbGameDetail = {
      ...DETAIL,
      starters: {
        ...DETAIL.starters,
        away: { ...DETAIL.starters.away, strikeOuts: null, inningsPitched: null },
      },
    };
    renderHero(detailWithoutK9);
    const awayPitcherLine = screen.getByText(DETAIL.starters.away.name).parentElement!;
    expect(awayPitcherLine).not.toHaveTextContent("K/9");
    // ERA still renders even though K/9 is omitted
    expect(awayPitcherLine).toHaveTextContent(`${DETAIL.starters.away.era} ERA`);
    // Home pitcher's K/9 is unaffected
    const homeK9 = computeK9(DETAIL.starters.home.strikeOuts, DETAIL.starters.home.inningsPitched);
    expect(screen.getByText(new RegExp(`${homeK9?.toFixed(1)} K/9`))).toBeInTheDocument();
  });

  it("4. shows the first-pitch time formatted in ET", () => {
    renderHero();
    expect(screen.getByText(/First Pitch/)).toBeInTheDocument();
    expect(screen.getByText(/ET/)).toBeInTheDocument();
  });

  it("5. shows the venue", () => {
    renderHero();
    expect(screen.getByText(new RegExp(DETAIL.game.venue))).toBeInTheDocument();
  });

  it("6. shows the weather string", () => {
    renderHero();
    expect(screen.getByText(new RegExp(DETAIL.weather))).toBeInTheDocument();
  });

  it("7. shows real moneyline odds when available", () => {
    renderHero(DETAIL, ODDS_WITH_LINE);
    expect(screen.getByText(new RegExp(`${AWAY} -145 / ${HOME} \\+125`))).toBeInTheDocument();
  });

  it("11. shows 'Market pending' for the moneyline when mlbOdds is null", () => {
    renderHero(DETAIL, null);
    const lineRow = screen.getByText("Line").parentElement;
    expect(lineRow).toHaveTextContent("Market pending");
  });

  it("11b. shows 'Market pending' for the moneyline when this specific game's key is missing", () => {
    const oddsForOtherGame: MlbOddsData = { ...ODDS_WITH_LINE, moneylines: { "XXX@YYY": ODDS_WITH_LINE.moneylines[`${AWAY}@${HOME}`] } };
    renderHero(DETAIL, oddsForOtherGame);
    const lineRow = screen.getByText("Line").parentElement;
    expect(lineRow).toHaveTextContent("Market pending");
  });

  it("8. always shows 'Market pending' for Total, since no real market total field exists", () => {
    renderHero(DETAIL, ODDS_WITH_LINE);
    const totalRow = screen.getByText("Total").parentElement;
    expect(totalRow).toHaveTextContent("Market pending");
  });
});

describe("MlbModelEdgeHero — model verdict", () => {
  it("9. shows the categorical verdict with no percentage or win-probability language", () => {
    renderHero();
    const result = computeModelEdge(DETAIL);
    const container = screen.getByText("Model Verdict").parentElement!;
    if (result.pick !== "push") {
      const pickAbbr = result.pick === "away" ? AWAY : HOME;
      expect(container).toHaveTextContent(`${pickAbbr} · ${getEdgeTierLabel(result.confidence)}`);
    } else {
      expect(container).toHaveTextContent("Even");
    }
    // The confidence score itself must never appear as a percentage or bare
    // number next to the verdict (factor `weight` disclosure, e.g. "30% wt",
    // is a separate, already-approved use of "%" and is not checked here).
    expect(container.textContent).not.toMatch(new RegExp(`${result.confidence}%`));
    expect(container.textContent).not.toMatch(/%/);
    expect(document.body.textContent).not.toMatch(/win probability|implied probability|chance to win/i);
  });

  it("10. neutral/push state renders 'Even', not a blank verdict", () => {
    // Force a push by making every canonical input identical between teams
    const neutralDetail: MlbGameDetail = {
      ...DETAIL,
      starters: {
        away: { ...DETAIL.starters.away, era: 3.5, strikeOuts: 50, inningsPitched: "50.0", baseOnBalls: 15, battersFaced: 200, homeRuns: 5, regressionScore: 0 },
        home: { ...DETAIL.starters.home, era: 3.5, strikeOuts: 50, inningsPitched: "50.0", baseOnBalls: 15, battersFaced: 200, homeRuns: 5, regressionScore: 0 },
      },
      lineupSummaries: {
        away: { avg: 0.25, obp: 0.32, slg: 0.4, ops: 0.72, kPct: 22 },
        home: { avg: 0.25, obp: 0.32, slg: 0.4, ops: 0.72, kPct: 22 },
      },
      opponentSplits: {
        awayBattingVsHomeStarter: { plateAppearances: 100, strikeOuts: 22, baseOnBalls: 10, avg: 0.25, obp: 0.32, slg: 0.4, ops: 0.72, leftOnBase: 20 },
        homeBattingVsAwayStarter: { plateAppearances: 100, strikeOuts: 22, baseOnBalls: 10, avg: 0.25, obp: 0.32, slg: 0.4, ops: 0.72, leftOnBase: 20 },
      },
      awayContext: { ...DETAIL.awayContext, lastFiveRecord: "2-3", awayRecord: "10-10" },
      homeContext: { ...DETAIL.homeContext, lastFiveRecord: "2-3", homeRecord: "10-10" },
      game: {
        ...DETAIL.game,
        away: { ...DETAIL.game.away, record: "20-20" },
        home: { ...DETAIL.game.home, record: "20-20" },
      },
    };
    const result = computeModelEdge(neutralDetail);
    expect(result.pick).toBe("push"); // sanity check the fixture actually produces a push
    renderHero(neutralDetail);
    expect(screen.getByText("Even")).toBeInTheDocument();
  });

  it("12. always produces a verdict object -- computeModelEdge never returns nothing", () => {
    renderHero();
    // The verdict area always renders either a team pill or "Even" -- never empty
    const container = screen.getByText("Model Verdict").parentElement!;
    expect(container.textContent?.trim().length).toBeGreaterThan("Model Verdict".length);
  });
});

describe("MlbModelEdgeHero — factor breakdown and takeaway", () => {
  it("13. renders all 5 factor rows with their canonical labels and descriptions", () => {
    renderHero();
    const result = computeModelEdge(DETAIL);
    for (const factor of result.factors) {
      expect(screen.getByText(factor.label)).toBeInTheDocument();
      expect(screen.getByText(factor.description)).toBeInTheDocument();
    }
  });

  it("14. each factor row's Edge column shows the leading team and a signed model-differential value", () => {
    renderHero();
    const result = computeModelEdge(DETAIL);
    for (const factor of result.factors) {
      const leaderAbbr = factor.awayScore >= factor.homeScore ? AWAY : HOME;
      const row = screen.getByText(factor.label).closest("div.rounded-lg")!;
      expect(row).toHaveTextContent(`${leaderAbbr} advantage`);
      expect(row.textContent).toMatch(/\+\d+/);
    }
  });

  it("15. renders the model's own takeaway summary verbatim", () => {
    renderHero();
    const result = computeModelEdge(DETAIL);
    expect(screen.getByText(result.summary)).toBeInTheDocument();
  });

  it("17. the only '%' in the whole hero is the already-approved factor-weight disclosure ('NN% wt'), never a confidence/verdict percentage", () => {
    const { container } = renderHero(DETAIL, ODDS_WITH_LINE);
    const text = container.textContent ?? "";
    const percentMatches = text.match(/[^\d]?\d+%/g) ?? [];
    expect(percentMatches.length).toBeGreaterThan(0); // sanity check: the weight disclosure is present
    for (const match of percentMatches) {
      // Each "<digits>%" occurrence must immediately be followed by " wt" in
      // the source (the factor-weight disclosure), confirmed by re-scanning
      // the surrounding text at each match index.
      const idx = text.indexOf(match) + match.length;
      expect(text.slice(idx, idx + 3)).toBe(" wt");
    }
    expect(container.textContent).not.toMatch(/win probability|implied probability|chance to win/i);
  });
});

describe("MlbModelEdgeHero — responsive ordering contract", () => {
  it("16. game context is order-1 on mobile and order-2 on desktop; team/pitcher block is order-2 mobile / order-1 desktop", () => {
    const { container } = renderHero();
    const contextRow = screen.getByText(/First Pitch/).closest("div.order-1, div.order-2")!;
    expect(contextRow.className).toMatch(/order-1/);
    expect(contextRow.className).toMatch(/md:order-2/);

    const teamGrid = container.querySelector('div[class*="order-2"][class*="md:order-1"]');
    expect(teamGrid).toBeTruthy();
  });
});
