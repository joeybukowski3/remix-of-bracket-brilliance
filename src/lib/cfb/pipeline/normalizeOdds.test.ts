import { describe, expect, it } from "vitest";
import { buildOddsByGameId, normalizeCfbdLines, selectProviderLine } from "./normalizeOdds";
import type { CfbdLinesGameRaw } from "./types";

function game(overrides: Partial<CfbdLinesGameRaw> = {}): CfbdLinesGameRaw {
  return { id: 401, lines: [], ...overrides };
}

describe("normalizeCfbdLines", () => {
  it("home favorite: negative spread passes through unchanged (home-team-perspective convention)", () => {
    const rows = normalizeCfbdLines([
      game({ lines: [{ provider: "DraftKings", spread: -7, overUnder: 51.5, homeMoneyline: -280, awayMoneyline: 230 }] }),
    ]);
    expect(rows[0].spread).toBe(-7);
    expect(rows[0].homeMoneyline).toBe(-280);
    expect(rows[0].awayMoneyline).toBe(230);
  });

  it("home underdog: positive spread passes through unchanged", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DraftKings", spread: 3.5 }] })]);
    expect(rows[0].spread).toBe(3.5);
  });

  it("pick'em: zero spread is preserved as zero, not treated as missing", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DraftKings", spread: 0 }] })]);
    expect(rows[0].spread).toBe(0);
  });

  it("neutral-site game: normalizes identically to any other game (no special-casing by venue)", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DraftKings", spread: -3, overUnder: 47 }] })]);
    expect(rows[0].spread).toBe(-3);
    expect(rows[0].total).toBe(47);
  });

  it("missing line: a game with no lines array produces no rows", () => {
    expect(normalizeCfbdLines([game({ lines: [] })])).toEqual([]);
  });

  it("rejects malformed moneylines (between -99 and 99) without dropping the rest of the row", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DK", spread: -7, homeMoneyline: 50, awayMoneyline: -400 }] })]);
    expect(rows[0].spread).toBe(-7);
    expect(rows[0].homeMoneyline).toBeNull();
    expect(rows[0].awayMoneyline).toBe(-400);
  });

  it("rejects impossible totals (<=0 or absurdly high) without dropping spread", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DK", spread: -7, overUnder: -5 }] })]);
    expect(rows[0].spread).toBe(-7);
    expect(rows[0].total).toBeNull();
  });

  it("rejects NaN/non-finite fields", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DK", spread: Number.NaN }] })]);
    expect(rows[0].spread).toBeNull();
  });

  it("only populates opening fields when CFBD explicitly returns a distinct opening value", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DK", spread: -7, spreadOpen: null }] })]);
    expect(rows[0].spreadOpen).toBeNull();
    const withOpen = normalizeCfbdLines([game({ lines: [{ provider: "DK", spread: -7, spreadOpen: -3 }] })]);
    expect(withOpen[0].spreadOpen).toBe(-3);
  });

  it("keeps duplicate provider rows separate — one row per (game, provider), never merged", () => {
    const rows = normalizeCfbdLines([
      game({
        lines: [
          { provider: "DraftKings", spread: -7 },
          { provider: "consensus", spread: -6.5 },
        ],
      }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe("selectProviderLine", () => {
  it("prefers a consensus provider when present", () => {
    const rows = normalizeCfbdLines([
      game({
        lines: [
          { provider: "ESPN Bet", spread: -6 },
          { provider: "consensus", spread: -6.5 },
          { provider: "DraftKings", spread: -7 },
        ],
      }),
    ]);
    const selected = selectProviderLine(rows);
    expect(selected?.provider).toBe("consensus");
  });

  it("prefers DraftKings over other providers when there is no consensus row (coverage-driven, not brand preference)", () => {
    const rows = normalizeCfbdLines([
      game({
        lines: [
          { provider: "ESPN Bet", spread: -6 },
          { provider: "Bovada", spread: -6.5 },
          { provider: "DraftKings", spread: -7 },
        ],
      }),
    ]);
    const selected = selectProviderLine(rows);
    expect(selected?.provider).toBe("DraftKings");
  });

  it("falls back to the alphabetically-first remaining provider when neither consensus nor DraftKings is present", () => {
    const rows = normalizeCfbdLines([
      game({
        lines: [
          { provider: "William Hill", spread: -6 },
          { provider: "ESPN Bet", spread: -7 },
        ],
      }),
    ]);
    const selected = selectProviderLine(rows);
    expect(selected?.provider).toBe("ESPN Bet");
  });

  it("is deterministic across repeated calls with the same input order", () => {
    const rows = normalizeCfbdLines([
      game({ lines: [{ provider: "ESPN Bet", spread: -6 }, { provider: "DraftKings", spread: -7 }] }),
    ]);
    const a = selectProviderLine(rows);
    const b = selectProviderLine([...rows].reverse());
    expect(a?.provider).toBe(b?.provider);
  });

  it("returns null when every row for the game is entirely unusable", () => {
    const rows = normalizeCfbdLines([game({ lines: [{ provider: "DK", spread: Number.NaN, homeMoneyline: 0 }] })]);
    expect(selectProviderLine(rows)).toBeNull();
  });

  describe("spread/moneyline coherence", () => {
    it("skips an incoherent DraftKings row in favor of a coherent alternative provider", () => {
      const rows = normalizeCfbdLines([
        game({
          lines: [
            // home favorite per spread, but away is MORE favored via ML — contradictory
            { provider: "DraftKings", spread: -7, homeMoneyline: 200, awayMoneyline: -300 },
            { provider: "Bovada", spread: -7, homeMoneyline: -280, awayMoneyline: 230 },
          ],
        }),
      ]);
      const selected = selectProviderLine(rows);
      expect(selected?.provider).toBe("Bovada");
      expect(selected?.homeMoneyline).toBe(-280);
      expect(selected?.awayMoneyline).toBe(230);
    });

    it("nulls moneylines (keeping spread/total) when no coherent provider exists for the game at all", () => {
      const rows = normalizeCfbdLines([
        game({
          lines: [{ provider: "DraftKings", spread: -7, overUnder: 51.5, homeMoneyline: 200, awayMoneyline: -300 }],
        }),
      ]);
      const selected = selectProviderLine(rows);
      expect(selected?.provider).toBe("DraftKings");
      expect(selected?.spread).toBe(-7);
      expect(selected?.total).toBe(51.5);
      expect(selected?.homeMoneyline).toBeNull();
      expect(selected?.awayMoneyline).toBeNull();
    });

    it("treats a pick'em (spread === 0) as coherent regardless of moneyline split", () => {
      const rows = normalizeCfbdLines([
        game({ lines: [{ provider: "DraftKings", spread: 0, homeMoneyline: -115, awayMoneyline: -105 }] }),
      ]);
      const selected = selectProviderLine(rows);
      expect(selected?.provider).toBe("DraftKings");
      expect(selected?.homeMoneyline).toBe(-115);
      expect(selected?.awayMoneyline).toBe(-105);
    });

    it("never mixes fields across providers when swapping to a coherent alternative — the full alternative row wins, not a blend", () => {
      const rows = normalizeCfbdLines([
        game({
          lines: [
            { provider: "DraftKings", spread: -7, overUnder: 51.5, homeMoneyline: 200, awayMoneyline: -300 },
            { provider: "Bovada", spread: -6.5, overUnder: 50, homeMoneyline: -280, awayMoneyline: 230 },
          ],
        }),
      ]);
      const selected = selectProviderLine(rows);
      expect(selected?.provider).toBe("Bovada");
      expect(selected?.spread).toBe(-6.5);
      expect(selected?.total).toBe(50);
      expect(selected?.homeMoneyline).toBe(-280);
      expect(selected?.awayMoneyline).toBe(230);
    });

    // Regression: the five real 2026 Week 1 games where live CFBD data showed
    // Bovada posting an internally-contradictory sentinel moneyline (e.g.
    // -100000) on the side opposite its own spread, while DraftKings' row for
    // the same game was coherent throughout. The final policy must always
    // select the coherent DraftKings row, never Bovada's contradictory one.
    const sentinelRegressionGames = [
      {
        id: 401858436,
        away: "Fresno State",
        home: "USC",
        draftKings: { spread: -22.5, overUnder: 51.5, homeMoneyline: -3200, awayMoneyline: 1400 },
        bovada: { spread: -22.5, overUnder: 51.5, homeMoneyline: -3500, awayMoneyline: -100000 },
      },
      {
        id: 401858206,
        away: "Miami",
        home: "Stanford",
        draftKings: { spread: 24.5, overUnder: 48.5, homeMoneyline: 1400, awayMoneyline: -3200 },
        bovada: { spread: 24.5, overUnder: 48.5, homeMoneyline: -100000, awayMoneyline: -2500 },
      },
      {
        id: 401856780,
        away: "Coastal Carolina",
        home: "West Virginia",
        draftKings: { spread: -21.5, overUnder: 58.5, homeMoneyline: -1450, awayMoneyline: 850 },
        bovada: { spread: -21.5, overUnder: 58, homeMoneyline: -1725, awayMoneyline: -100000 },
      },
      {
        id: 401856667,
        away: "Texas State",
        home: "Texas",
        draftKings: { spread: -30.5, overUnder: 60.5, homeMoneyline: -10000, awayMoneyline: 3000 },
        bovada: { spread: -30.5, overUnder: 60, homeMoneyline: -10000, awayMoneyline: -100000 },
      },
      {
        id: 401858210,
        away: "UCLA",
        home: "California",
        draftKings: { spread: 1.5, overUnder: 53.5, homeMoneyline: -105, awayMoneyline: -115 },
        bovada: { spread: 1.5, overUnder: 54.5, homeMoneyline: -115, awayMoneyline: -105 },
      },
    ] as const;

    it.each(sentinelRegressionGames)(
      "game $id ($away @ $home): selects the coherent DraftKings row, never Bovada's contradictory one",
      ({ id, draftKings, bovada }) => {
        const rows = normalizeCfbdLines([
          game({
            id,
            lines: [
              { provider: "DraftKings", ...draftKings },
              { provider: "Bovada", ...bovada },
            ],
          }),
        ]);
        const selected = selectProviderLine(rows);
        expect(selected?.provider).toBe("DraftKings");
        expect(selected?.homeMoneyline).toBe(draftKings.homeMoneyline);
        expect(selected?.awayMoneyline).toBe(draftKings.awayMoneyline);
        // Bovada's contradictory sentinel value must never surface in the selected row.
        expect(selected?.homeMoneyline).not.toBe(-100000);
        expect(selected?.awayMoneyline).not.toBe(-100000);
      },
    );
  });
});

describe("buildOddsByGameId", () => {
  it("joins strictly by CFBD game ID and applies the provider policy end-to-end", () => {
    const map = buildOddsByGameId([
      game({
        id: 401856766,
        lines: [
          { provider: "ESPN Bet", spread: -6, overUnder: 50, homeMoneyline: -240, awayMoneyline: 200 },
          { provider: "consensus", spread: -6.5, overUnder: 50.5, homeMoneyline: -250, awayMoneyline: 210 },
        ],
      }),
    ]);
    expect(map.get("401856766")).toEqual({
      openingSpread: null,
      currentSpread: -6.5,
      awayMoneyline: 210,
      homeMoneyline: -250,
      openingTotal: null,
      currentTotal: 50.5,
    });
  });

  it("FBS-vs-FCS game with a posted line still normalizes", () => {
    const map = buildOddsByGameId([game({ id: 999, lines: [{ provider: "DK", spread: -35, overUnder: 60, homeMoneyline: -10000, awayMoneyline: 3000 }] })]);
    expect(map.get("999")?.currentSpread).toBe(-35);
  });

  it("omits games with no usable line from the map (caller decides null vs. last-known-good)", () => {
    const map = buildOddsByGameId([game({ id: 1, lines: [] }), game({ id: 2, lines: [{ provider: "DK", spread: -7 }] })]);
    expect(map.has("1")).toBe(false);
    expect(map.has("2")).toBe(true);
  });
});
