import { describe, expect, it } from "vitest";
import { buildDefenseGames, YARDS_VS_AVERAGE_BASELINE_POLICY } from "./baseline";
import { buildOffenseGameLog } from "./gameLog";
import { qbGame } from "./__fixtures__/playerWeek";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";

const games = (rows: HistoricalPlayerWeek[], seasons = [2026]) => buildDefenseGames(buildOffenseGameLog(rows), seasons);
const find = (list: ReturnType<typeof games>, season: number, week: number, offense: string) =>
  list.find((game) => game.season === season && game.week === week && game.offense === offense)!;

/** Offense `aaa`: 110 rushing yards in five games, then `rushVsTarget` against `ccc` in week 6. */
function sixGameOffense(rushVsTarget: number) {
  return [1, 2, 3, 4, 5].map((week) => qbGame(2026, week, "aaa", `d0${week}`, 110)).concat(qbGame(2026, 6, "aaa", "ccc", rushVsTarget));
}

describe("buildDefenseGames baselines", () => {
  it("records the nfl-comparison-blend-v1 policy", () => {
    expect(YARDS_VS_AVERAGE_BASELINE_POLICY.version).toBe("nfl-comparison-blend-v1");
  });

  it("basic leave-one-out: 110 normal, 130 vs the defense = +20 (A)", () => {
    const game = find(games(sixGameOffense(130)), 2026, 6, "aaa");
    expect(game.defense).toBe("ccc");
    expect(game.baseline!.rush).toBe(110);
    expect(game.actual.rush - game.baseline!.rush).toBe(20);
  });

  it("negative delta: baseline 120, actual 90 = -30 (C)", () => {
    const rows = [1, 2, 3, 4, 5].map((week) => qbGame(2026, week, "aaa", `d0${week}`, 120)).concat(qbGame(2026, 6, "aaa", "ccc", 90));
    const game = find(games(rows), 2026, 6, "aaa");
    expect(game.actual.rush - game.baseline!.rush).toBe(-30);
  });

  it("excludes the target game from its own baseline (E)", () => {
    const all = games(sixGameOffense(170));
    // Including the target would give (5*110 + 170) / 6 = 120.
    expect(find(all, 2026, 6, "aaa").baseline!.rush).toBe(110);
    // Every other game's baseline does include week 6: (4*110 + 170) / 5 = 122.
    expect(find(all, 2026, 1, "aaa").baseline!.rush).toBe(122);
    expect(find(all, 2026, 6, "aaa").otherGames).toBe(5);
  });

  it("fades the prior season with the shared curve: 0 others = 100% prior, 1 = 80/20, 2 = 60/40, 5+ = 100% current (F)", () => {
    const prior = [qbGame(2025, 1, "aaa", "x1", 100), qbGame(2025, 2, "aaa", "x2", 100)];

    const zero = find(games([...prior, qbGame(2026, 1, "aaa", "ccc", 150)]), 2026, 1, "aaa");
    expect([zero.priorWeight, zero.currentWeight, zero.baseline!.rush]).toEqual([1, 0, 100]);

    const one = find(games([...prior, qbGame(2026, 1, "aaa", "ccc", 150), qbGame(2026, 2, "aaa", "ddd", 50)]), 2026, 1, "aaa");
    expect([one.priorWeight, one.currentWeight, one.baseline!.rush]).toEqual([0.8, 0.2, 90]);

    const two = find(games([...prior, qbGame(2026, 1, "aaa", "ccc", 150), qbGame(2026, 2, "aaa", "ddd", 50), qbGame(2026, 3, "aaa", "eee", 50)]), 2026, 1, "aaa");
    expect([two.priorWeight, two.currentWeight, two.baseline!.rush]).toEqual([0.6, 0.4, 80]);

    const six = find(games([...prior, ...sixGameOffense(130)]), 2026, 6, "aaa");
    expect([six.priorWeight, six.currentWeight, six.baseline!.rush]).toEqual([0, 1, 110]);
  });

  it("uses each game's own season for a prior-season game (K)", () => {
    // 2025: aaa normally rushes 80; 2026 it rushes 200 every week.
    const rows = [
      ...[1, 2, 3, 4, 5].map((week) => qbGame(2025, week, "aaa", `d0${week}`, 80)),
      qbGame(2025, 6, "aaa", "ccc", 100),
      ...[1, 2].map((week) => qbGame(2026, week, "aaa", `n0${week}`, 200)),
    ];
    const game = find(games(rows, [2025, 2026]), 2025, 6, "aaa");
    expect(game.baseline!.rush).toBe(80);
    expect(game.priorWeight).toBe(0);
  });

  it("gives a null baseline (never an invented fallback) when the blend needs a missing prior season", () => {
    const game = find(games([qbGame(2026, 1, "aaa", "ccc", 150), qbGame(2026, 2, "aaa", "ddd", 50)]), 2026, 1, "aaa");
    expect(game.priorWeight).toBe(0.8);
    expect(game.baseline).toBeNull();
  });
});
