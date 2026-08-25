// Official-rank badge behavior on the merged matchup card. The card LAYOUT is
// deliberately untouched by this work — these tests cover only which rank is
// shown, how it is labeled, and how it is visually distinguished.
//
// Participants are constructed locally so all three rank sources (CFP / AP /
// JKB fallback) can be exercised regardless of which polls have been ingested
// into the production artifact. These are display fixtures, not poll data.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CfbGame, CfbJkbRatings } from "@/data/cfb/types";
import CollegeFootballGameCard, { type CfbScheduleParticipant } from "./CollegeFootballGameCard";

const GAME: CfbGame = {
  id: "test-1",
  season: 2026,
  week: 1,
  date: "2026-08-29",
  time: "16:00",
  awayTeamId: "away",
  homeTeamId: "home",
  neutralSite: false,
  venue: "Test Stadium",
  tvNetwork: null,
  gameStatus: "scheduled",
  awayScore: null,
  homeScore: null,
  odds: {
    openingSpread: null,
    currentSpread: null,
    awayMoneyline: null,
    homeMoneyline: null,
    openingTotal: null,
    currentTotal: null,
  },
  model: {
    jkbProjectedSpread: null,
    jkbProjectedTotal: null,
    homeWinProbability: null,
    awayWinProbability: null,
    neutralPowerDifference: null,
    homeFieldAdjustment: null,
    jkbPowerLine: null,
  },
};

function ratings(overrides: Partial<CfbJkbRatings>): CfbJkbRatings {
  return {
    teamId: "t",
    jkbRank: null,
    previousJkbRank: null,
    apRank: null,
    cfpRank: null,
    jkbPowerRating: 70,
    offensiveRating: null,
    defensiveRating: null,
    sosPlayedRating: null,
    sosPlayedRank: null,
    sosRemainingRating: null,
    sosRemainingRank: null,
    ...overrides,
  };
}

function participant(id: string, teamRatings: CfbJkbRatings): CfbScheduleParticipant {
  return {
    id,
    name: `${id} team`,
    shortName: `${id} team`,
    abbreviation: id.toUpperCase().slice(0, 4),
    primaryColor: "#123456",
    logo: "",
    ratings: teamRatings,
    record: {
      teamId: id,
      wins: 0,
      losses: 0,
      ties: 0,
      conferenceWins: 0,
      conferenceLosses: 0,
      conferenceTies: 0,
      atsWins: null,
      atsLosses: null,
      overs: null,
      unders: null,
    },
  };
}

function renderWith(away: CfbJkbRatings, home: CfbJkbRatings) {
  return render(
    <MemoryRouter>
      <CollegeFootballGameCard
        game={GAME}
        away={participant("away", away)}
        home={participant("home", home)}
        matchupAvailable={false}
      />
    </MemoryRouter>,
  );
}

describe("CollegeFootballGameCard — official rank badge", () => {
  it("renders an official AP rank as a bare '#8' badge labeled 'AP rank 8'", () => {
    renderWith(ratings({ apRank: 8, jkbRank: 14 }), ratings({ jkbRank: 40 }));
    expect(screen.getByText("#8")).toBeInTheDocument();
    expect(screen.getByText("AP rank 8")).toBeInTheDocument();
    expect(screen.queryByText("JKB 14")).not.toBeInTheDocument();
  });

  it("renders an official CFP rank as '#6' labeled 'CFP rank 6', outranking AP", () => {
    renderWith(ratings({ cfpRank: 6, apRank: 8, jkbRank: 14 }), ratings({ jkbRank: 40 }));
    expect(screen.getByText("#6")).toBeInTheDocument();
    expect(screen.getByText("CFP rank 6")).toBeInTheDocument();
    expect(screen.queryByText("#8")).not.toBeInTheDocument();
  });

  it("renders the fallback for an officially unranked team as 'JKB 14', never a bare hash", () => {
    renderWith(ratings({ jkbRank: 14 }), ratings({ jkbRank: 40 }));
    expect(screen.getByText("JKB 14")).toBeInTheDocument();
    expect(screen.getByText("JKB power rank 14")).toBeInTheDocument();
    expect(screen.queryByText("#14")).not.toBeInTheDocument();
  });

  it("styles official badges distinctly from the JKB fallback badge", () => {
    const { container, unmount } = renderWith(ratings({ apRank: 8, jkbRank: 14 }), ratings({ jkbRank: 40 }));
    const official = container.querySelector("span.bg-slate-900");
    const fallback = container.querySelector("span.bg-slate-100.text-slate-500");
    expect(official?.textContent).toContain("#8");
    expect(fallback?.textContent).toContain("JKB 40");
    unmount();
  });

  it("exposes the rank source to assistive technology via both title and screen-reader text", () => {
    const { container } = renderWith(ratings({ apRank: 3, jkbRank: 9 }), ratings({ jkbRank: 40 }));
    const badge = container.querySelector('span[title="AP rank 3"]');
    expect(badge).toBeTruthy();
    expect(badge?.querySelector(".sr-only")?.textContent).toBe("AP rank 3");
    // The visible glyph itself is hidden from the accessibility tree so the
    // label is not read twice.
    expect(badge?.querySelector('[aria-hidden="true"]')?.textContent).toBe("#3");
  });

  it("omits the badge entirely when a team has no official rank and no JKB rank", () => {
    const { container } = renderWith(ratings({}), ratings({}));
    expect(container.querySelector("span.bg-slate-900")).toBeNull();
    expect(container.querySelector("span.bg-slate-100.text-slate-500")).toBeNull();
  });
});
