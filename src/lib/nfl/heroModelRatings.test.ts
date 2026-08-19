import { describe, expect, it } from "vitest";
import type { CurrentRatingBoard, CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import {
  createHeroModelRatingResolver,
  formatHeroModelRating,
  unavailableHeroModelRatings,
} from "@/lib/nfl/heroModelRatings";

function currentRow(overrides: Partial<CurrentRatingRow> = {}): CurrentRatingRow {
  return {
    abbr: "buf",
    team: "Buffalo Bills",
    division: "AFC East",
    rating: 67.5,
    rank: 4,
    offenseRating: 84.9,
    offenseRank: 1,
    defenseRating: 72.4,
    defenseRank: 6,
    performanceRating: null,
    performanceRank: null,
    gamesPlayed: 0,
    preseasonWeight: 1,
    performanceWeight: 0,
    state: "preseason",
    preseasonV04Rating: 67.5,
    preseasonOffenseRating: 84.9,
    preseasonDefenseRating: 72.4,
    ...overrides,
  };
}

function currentBoard(teams: CurrentRatingRow[]): CurrentRatingBoard {
  return { season: 2026, state: teams.some((t) => t.gamesPlayed > 0) ? "live" : "preseason", teams };
}

describe("createHeroModelRatingResolver", () => {
  it("sources rating/rank/offenseRating/offenseRank/defenseRating/defenseRank all from the single Current Power Board", () => {
    const resolver = createHeroModelRatingResolver(
      currentBoard([currentRow({ abbr: "buf", rating: 67.5, rank: 4, offenseRating: 84.9, offenseRank: 1, defenseRating: 72.4, defenseRank: 6 })])
    );
    const buf = resolver("buf")!;
    expect(buf.rating).toBe(67.5);
    expect(buf.rank).toBe(4);
    expect(buf.offenseRating).toBe(84.9);
    expect(buf.offenseRank).toBe(1);
    expect(buf.defenseRating).toBe(72.4);
    expect(buf.defenseRank).toBe(6);
  });

  it("resolves to null (never a partial/fabricated result) for a team absent from the board", () => {
    const resolver = createHeroModelRatingResolver(currentBoard([currentRow({ abbr: "mia" })]));
    expect(resolver("buf")).toBeNull();
  });

  it("degrades to the unavailable resolver when the board itself is null or empty", () => {
    expect(createHeroModelRatingResolver(null)).toBe(unavailableHeroModelRatings);
    expect(createHeroModelRatingResolver({ season: 2026, state: "preseason", teams: [] })).toBe(unavailableHeroModelRatings);
    expect(createHeroModelRatingResolver(null)("buf")).toBeNull();
  });

  it("keeps the HeroModelRating shape internally coherent: all six fields present together when a row resolves", () => {
    const resolver = createHeroModelRatingResolver(currentBoard([currentRow({ abbr: "buf" })]));
    const buf = resolver("buf")!;
    expect(typeof buf.rating).toBe("number");
    expect(typeof buf.rank).toBe("number");
    expect(typeof buf.offenseRating).toBe("number");
    expect(typeof buf.offenseRank).toBe("number");
    expect(typeof buf.defenseRating).toBe("number");
    expect(typeof buf.defenseRank).toBe("number");
    expect(Object.keys(buf).sort()).toEqual(
      ["defenseRank", "defenseRating", "offenseRank", "offenseRating", "rank", "rating"].sort()
    );
  });

  it("a blended live team resolves OFF/DEF that differ from its preseason anchors", () => {
    const resolver = createHeroModelRatingResolver(
      currentBoard([
        currentRow({
          abbr: "buf", gamesPlayed: 6, state: "live", preseasonWeight: 0, performanceWeight: 1,
          preseasonOffenseRating: 84.9, preseasonDefenseRating: 72.4,
          offenseRating: 60.0, defenseRating: 55.0, offenseRank: 12, defenseRank: 18,
        }),
      ])
    );
    const buf = resolver("buf")!;
    expect(buf.offenseRating).toBe(60.0);
    expect(buf.defenseRating).toBe(55.0);
    expect(buf.offenseRating).not.toBe(84.9);
  });
});

describe("formatHeroModelRating", () => {
  it("formats a finite value to one decimal and treats null/undefined/non-finite as N/A", () => {
    expect(formatHeroModelRating(67.5)).toBe("67.5");
    expect(formatHeroModelRating(null)).toBe("N/A");
    expect(formatHeroModelRating(undefined)).toBe("N/A");
    expect(formatHeroModelRating(Number.NaN)).toBe("N/A");
  });
});
