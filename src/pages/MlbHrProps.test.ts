import { describe, expect, it } from "vitest";
import {
  buildTbdFootnotes,
  buildTbdGameKeySet,
  DEFAULT_BATTER_SORT,
  DEFAULT_MATCHUP_SORT,
  DEFAULT_PITCHER_SORT,
  DEFAULT_TAB,
  buildHeatStatRanges,
  buildParkSidebarRows,
  buildPitcherVsBatterRows,
  buildSlateSummary,
  getHeatCellStyle,
  normalizeHrBestBetsPayload,
  normalizeHrDashboardPayload,
  normalizeHrPropRows,
  sortBatters,
} from "@/pages/MlbHrProps";
import {
  computeBatterHrScore,
  computePitcherMatchupRatings,
  deriveAngleTags,
  extractPropFinderWeatherGames,
  parseCsv,
  sanitizePercentStat,
} from "../../scripts/generate-mlb-hr-props.mjs";

describe("MLB HR props dashboard guards", () => {
  it("normalizes best-bets payloads that use opp instead of opponent", () => {
    const payload = normalizeHrBestBetsPayload({
      date: "2026-05-08",
      generatedAt: "2026-05-08T11:55:55.255Z",
      bestBets: [
        {
          player: "Blake Dunn",
          team: "CIN",
          opp: "HOU",
          opposingPitcher: "Mike Burrows",
          hrScoreRank: 1,
          topStats: ["Barrel%=14.3", "Pitcher HR VS=72.1"],
          bullets: ["HR score 78.4 (#1)", "Pitcher HR VS 72.1 at park 1.25"],
        },
      ],
      valueBets: [],
      longshots: [],
    });

    expect(payload?.bestBets).toHaveLength(1);
    expect(payload?.bestBets[0].opponent).toBe("HOU");
  });

  it("normalizes the structured dashboard payload and preserves safe rows", () => {
    const payload = normalizeHrDashboardPayload({
      date: "2026-05-08",
      generatedAt: "2026-05-08T10:30:00Z",
      games: [
        {
          gameKey: "HOU@CIN",
          matchup: "HOU @ CIN",
          awayTeam: "HOU",
          homeTeam: "CIN",
          stadium: "Great American Ball Park",
          roofType: "Open",
          temperature: 72,
          precipitation: 10,
          windSpeed: 8,
          windDirection: "SW",
          conditions: "Clear",
          parkFactor: 1.25,
        },
      ],
      pitchers: [
        {
          gameKey: "HOU@CIN",
          pitcher: "Hunter Greene",
          team: "CIN",
          opponent: "HOU",
          hand: "R",
          ballpark: "Great American Ball Park",
          parkFactor: 1.25,
          xera: 3.44,
          hardHitRate: 34.2,
          flyBallRate: 37.8,
          barrelRate: 7.1,
          kRate: 29.3,
          bbRate: 8.4,
          whiffRate: 29.8,
          hrVs: 45.7,
          hitsVs: 41.1,
          kVs: 73.8,
        },
      ],
      batters: [
        {
          gameKey: "HOU@CIN",
          player: "Yordan Alvarez",
          team: "HOU",
          opponent: "CIN",
          opposingPitcher: "Hunter Greene",
          pitcherHand: "R",
          ballpark: "Great American Ball Park",
          parkFactor: 1.25,
          barrelRate: 16,
          hardHitRate: 54,
          xba: 0.298,
          kRate: 18,
          bbRate: 12,
          whiffRate: 22,
          last7HR: 2,
          last30HR: 7,
          opposingPitcherHrVs: 45.7,
          opposingPitcherHitsVs: 41.1,
          opposingPitcherKVs: 73.8,
          weatherBoost: 3.2,
          hrScore: 71.4,
          hrScoreRank: 1,
          angleTags: ["HR damage edge"],
        },
        {
          player: "Broken Row",
          team: "HOU",
          opponent: "CIN",
          hrScore: "bad",
        },
      ],
    });

    expect(payload?.games).toHaveLength(1);
    expect(payload?.pitchers).toHaveLength(1);
    expect(payload?.batters).toHaveLength(1);
    expect(payload?.batters[0].player).toBe("Yordan Alvarez");
    expect(payload?.games[0].windDirection).toBe("SW");
  });

  it("keeps legacy raw-array fallback support for batter rows", () => {
    const rows = normalizeHrPropRows([
      {
        player: "Valid Player",
        team: "NYY",
        opponent: "BOS",
        opposingPitcher: "Chris Sale",
        pitcherHand: "L",
        ballpark: "Yankee Stadium",
        parkFactor: 1.18,
        barrelRate: 20.5,
        hardHitRate: 64.2,
        xba: 0.312,
        kRate: 21.4,
        bbRate: 11.2,
        whiffRate: 24.1,
        last7HR: 3,
        last30HR: 12,
        opposingPitcherHrVs: 62.4,
        opposingPitcherHitsVs: 58.2,
        opposingPitcherKVs: 44.1,
        hrScore: 73,
        hrScoreRank: 4,
      },
      {
        player: "Broken Player",
        team: "NYY",
        opponent: "BOS",
        hardHitRate: 125,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].player).toBe("Valid Player");
  });

  it("parses the statcast CSV header correctly and retains player ids", () => {
    const rows = parseCsv(
      "\"last_name, first_name\",\"player_id\",\"year\",\"player_id\",\"player_name\",\"barrel_batted_rate\",\"hard_hit_percent\",\"exit_velocity_avg\",\"isolated_power\",\"pull_percent\",\"xba\",\"whiff_percent\",\"k_percent\",\"bb_percent\"\n\"Bleday, JJ\",668709,2026,668709,\"Bleday, JJ\",18.2,59.1,\"94.4\",\"0.449\",54.5,\".281\",25.5,19.1,11.4\n",
    );

    expect(rows[0].player_id).toBe("668709");
    expect(rows[0].hard_hit_percent).toBe("59.1");
    expect(rows[0].xba).toBe(".281");
  });

  it("rejects impossible percentage stats instead of treating them as valid output", () => {
    expect(sanitizePercentStat("125", "Hard Hit%", { player: "Broken" })).toBeNull();
    expect(sanitizePercentStat("59.1", "Hard Hit%", { player: "Valid" })).toBe(59.1);
  });

  it("extracts embedded PropFinder weather game objects", () => {
    const html = String.raw`<script>self.__next_f.push([1,"{\"id\":824522,\"homeTeam\":{\"code\":\"CIN\"},\"visitorTeam\":{\"code\":\"HOU\"},\"weatherData\":[{\"dateTimeEpoch\":1778212800,\"temp\":72.4,\"precipProb\":10,\"windSpeed\":8.2,\"windDir\":214,\"conditions\":\"Clear\"}],\"ballpark\":{\"name\":\"Great American Ball Park\",\"roofType\":\"Open\"},\"gameDate\":\"2026-05-08T22:10:00Z\"}"])</script>`;
    const games = extractPropFinderWeatherGames(html);

    expect(games).toHaveLength(1);
    expect(games[0].homeTeam.code).toBe("CIN");
    expect(games[0].ballpark.name).toBe("Great American Ball Park");
  });

  it("builds deterministic pitcher composite ratings", () => {
    const ratings = computePitcherMatchupRatings(
      {
        xera: 4.8,
        hardHitRate: 45,
        flyBallRate: 41,
        barrelRate: 10,
        kRate: 21,
        bbRate: 9,
        whiffRate: 23,
      },
      {
        hardHitValues: [31, 36, 45, 49],
        flyBallValues: [28, 33, 41, 44],
        barrelValues: [5, 7, 10, 12],
        kValues: [19, 21, 27, 31],
        bbValues: [4, 7, 9, 11],
        whiffValues: [20, 23, 29, 33],
      },
    );

    expect(ratings.hrVs).toBeGreaterThan(60);
    expect(ratings.hitsVs).toBeGreaterThan(55);
    expect(ratings.kVs).toBeLessThan(60);
  });

  it("builds deterministic batter HR scores from batter plus pitcher context", () => {
    const hrScore = computeBatterHrScore(
      {
        barrelRate: 15,
        hardHitRate: 52,
        xba: 0.291,
        whiffRate: 23,
        last7HR: 2,
        last30HR: 8,
        opposingPitcherHrVs: 68,
        parkFactor: 1.18,
        weatherBoost: 4,
      },
      {
        barrelValues: [6, 10, 15, 18],
        hardHitValues: [34, 41, 52, 57],
        xbaValues: [0.212, 0.244, 0.291, 0.318],
        whiffValues: [19, 23, 29, 34],
        last7Values: [0, 1, 2, 3],
        last30Values: [2, 4, 8, 10],
        parkValues: [0.9, 1, 1.18, 1.25],
      },
    );

    expect(hrScore).toBeGreaterThan(65);
    expect(hrScore).toBeLessThanOrEqual(100);
  });

  it("uses the production default tab and sort states", () => {
    expect(DEFAULT_TAB).toBe("pitchers");
    expect(DEFAULT_PITCHER_SORT).toEqual({ key: "hrVs", direction: "desc" });
    expect(DEFAULT_BATTER_SORT).toEqual({ key: "hrScore", direction: "desc" });
    expect(DEFAULT_MATCHUP_SORT).toEqual({ key: "hrTargetScore", direction: "desc" });
  });

  it("ranks highest HR score first in batter sorting", () => {
    const rows = normalizeHrPropRows([
      { player: "Low", team: "AAA", opponent: "BBB", opposingPitcher: "Pitcher A", hrScore: 21, hrScoreRank: 3 },
      { player: "High", team: "AAA", opponent: "BBB", opposingPitcher: "Pitcher B", hrScore: 78, hrScoreRank: 1 },
      { player: "Mid", team: "AAA", opponent: "BBB", opposingPitcher: "Pitcher C", hrScore: 54, hrScoreRank: 2 },
    ]);

    const sorted = sortBatters(rows, DEFAULT_BATTER_SORT.key, DEFAULT_BATTER_SORT.direction);
    expect(sorted.map((row) => row.player)).toEqual(["High", "Mid", "Low"]);
  });

  it("builds a park sidebar sorted by highest park factor first", () => {
    const parks = buildParkSidebarRows([
      { gameKey: "A@B", matchup: "A @ B", awayTeam: "A", homeTeam: "B", stadium: "Neutral Park", roofType: "Open", temperature: 70, precipitation: 5, windSpeed: 8, windDirection: "SW", conditions: "Clear", parkFactor: 1 },
      { gameKey: "C@D", matchup: "C @ D", awayTeam: "C", homeTeam: "D", stadium: "Coors Field", roofType: "Open", temperature: 75, precipitation: 0, windSpeed: 10, windDirection: "NW", conditions: "Clear", parkFactor: 1.4 },
    ]);

    expect(parks[0].stadium).toBe("Coors Field");
    expect(parks[0].parkFactor).toBe(1.4);
  });

  it("builds slate summary from the strongest park, top arm, and top bat", () => {
    const summary = buildSlateSummary(
      [{ gameKey: "A@B", pitcher: "Pitcher A", team: "B", opponent: "A", hand: "R", ballpark: "Big Park", parkFactor: 1.2, xera: 4.1, hardHitRate: 45, flyBallRate: 37, barrelRate: 10, kRate: 22, bbRate: 8, whiffRate: 25, hrVs: 71.2, hitsVs: 60, kVs: 44 }],
      [{ gameKey: "A@B", player: "Batter A", team: "A", opponent: "B", opposingPitcher: "Pitcher A", opposingPitcherId: 1, pitcherHand: "R", ballpark: "Big Park", parkFactor: 1.2, barrelRate: 14, hardHitRate: 52, exitVelo: 92, iso: 0.3, hrFBRatio: 8, pullRate: 42, xba: 0.289, kRate: 19, bbRate: 10, whiffRate: 24, last7HR: 2, last30HR: 7, opposingPitcherHrVs: 71.2, opposingPitcherHitsVs: 60, opposingPitcherKVs: 44, weatherBoost: 4, hrScore: 77.4, hrScoreRank: 1, angleTags: ["HR damage edge"] }],
      [{ gameKey: "A@B", matchup: "A @ B", awayTeam: "A", homeTeam: "B", stadium: "Big Park", roofType: "Open", temperature: 72, precipitation: 5, windSpeed: 9, windDirection: "SW", conditions: "Clear", parkFactor: 1.2 }],
    );

    expect(summary.strongestParks).toContain("Big Park");
    expect(summary.topArm).toContain("Pitcher A");
    expect(summary.topBat).toContain("Batter A");
    expect(summary.hitterCount).toBe(1);
  });

  it("builds batter-first matchup rows from live batter and pitcher data", () => {
    const rows = buildPitcherVsBatterRows(
      [
        {
          gameKey: "NYM@AZ",
          player: "Juan Soto",
          team: "NYM",
          opponent: "AZ",
          opposingPitcher: "Ryne Nelson",
          opposingPitcherId: 1,
          pitcherHand: "R",
          ballpark: "Chase Field",
          parkFactor: 1,
          barrelRate: 18,
          hardHitRate: 54,
          exitVelo: 93,
          iso: 0.33,
          hrFBRatio: 8,
          pullRate: 40,
          xba: 0.301,
          kRate: 16,
          bbRate: 12,
          whiffRate: 21,
          last7HR: 2,
          last30HR: 8,
          opposingPitcherHrVs: 74.9,
          opposingPitcherHitsVs: 63,
          opposingPitcherKVs: 34,
          weatherBoost: 3,
          hrScore: 70.1,
          hrScoreRank: 1,
          angleTags: ["HR damage edge"],
        },
      ],
      [{ gameKey: "NYM@AZ", matchup: "NYM @ AZ", awayTeam: "NYM", homeTeam: "AZ", stadium: "Chase Field", roofType: "Retractable", temperature: 78, precipitation: 0, windSpeed: 6, windDirection: "N", conditions: "Roof likely closed", parkFactor: 1 }],
      [
        {
          gameKey: "NYM@AZ",
          pitcher: "Ryne Nelson",
          pitcherId: 1,
          team: "AZ",
          opponent: "NYM",
          hand: "R",
          ballpark: "Chase Field",
          parkFactor: 1,
          xera: 5.11,
          hardHitRate: 43,
          flyBallRate: 39,
          barrelRate: 9.2,
          kRate: 20,
          bbRate: 8,
          whiffRate: 24,
          hrVs: 74.9,
          hitsVs: 63,
          kVs: 34,
        },
      ],
    );

    expect(rows[0].hrTargetScore).toBeGreaterThan(rows[0].hrScore);
    expect(rows[0].batterPowerScore).toBeGreaterThan(60);
    expect(rows[0].pitcherVulnerabilityScore).toBeGreaterThan(60);
    expect(rows[0].park).toBe("Chase Field");
  });

  it("keeps elite hitter quality ahead of weak bats even when pitcher vulnerability is lower", () => {
    const rows = buildPitcherVsBatterRows(
      [
        {
          gameKey: "NYY@BOS",
          player: "Aaron Judge",
          team: "NYY",
          opponent: "BOS",
          opposingPitcher: "Pitcher A",
          opposingPitcherId: 1,
          pitcherHand: "R",
          ballpark: "Fenway Park",
          parkFactor: 1.04,
          barrelRate: 22,
          hardHitRate: 59,
          exitVelo: 95,
          iso: 0.39,
          hrFBRatio: 24,
          pullRate: 43,
          xba: 0.31,
          kRate: 24,
          bbRate: 15,
          whiffRate: 24,
          last7HR: 3,
          last30HR: 11,
          opposingPitcherHrVs: 22,
          opposingPitcherHitsVs: 38,
          opposingPitcherKVs: 52,
          weatherBoost: 2,
          hrScore: 84,
          hrScoreRank: 1,
          angleTags: ["HR damage edge"],
        },
        {
          gameKey: "SEA@COL",
          player: "Weak Bat",
          team: "SEA",
          opponent: "COL",
          opposingPitcher: "Pitcher B",
          opposingPitcherId: 2,
          pitcherHand: "R",
          ballpark: "Coors Field",
          parkFactor: 1.28,
          barrelRate: 7,
          hardHitRate: 34,
          exitVelo: 88,
          iso: 0.14,
          hrFBRatio: 8,
          pullRate: 38,
          xba: 0.228,
          kRate: 28,
          bbRate: 7,
          whiffRate: 31,
          last7HR: 0,
          last30HR: 2,
          opposingPitcherHrVs: 78,
          opposingPitcherHitsVs: 70,
          opposingPitcherKVs: 30,
          weatherBoost: 4,
          hrScore: 43,
          hrScoreRank: 25,
          angleTags: [],
        },
      ],
      [
        { gameKey: "NYY@BOS", matchup: "NYY @ BOS", awayTeam: "NYY", homeTeam: "BOS", stadium: "Fenway Park", roofType: "Open", temperature: 65, precipitation: 0, windSpeed: 8, windDirection: "SW", conditions: "Clear", parkFactor: 1.04 },
        { gameKey: "SEA@COL", matchup: "SEA @ COL", awayTeam: "SEA", homeTeam: "COL", stadium: "Coors Field", roofType: "Open", temperature: 73, precipitation: 0, windSpeed: 10, windDirection: "NW", conditions: "Clear", parkFactor: 1.28 },
      ],
      [
        { gameKey: "NYY@BOS", pitcher: "Pitcher A", pitcherId: 1, team: "BOS", opponent: "NYY", hand: "R", ballpark: "Fenway Park", parkFactor: 1.04, xera: 3.8, hardHitRate: 36, flyBallRate: 33, barrelRate: 7, kRate: 24, bbRate: 7, whiffRate: 27, hrVs: 22, hitsVs: 38, kVs: 52 },
        { gameKey: "SEA@COL", pitcher: "Pitcher B", pitcherId: 2, team: "COL", opponent: "SEA", hand: "R", ballpark: "Coors Field", parkFactor: 1.28, xera: 5.7, hardHitRate: 46, flyBallRate: 42, barrelRate: 11, kRate: 18, bbRate: 9, whiffRate: 21, hrVs: 78, hitsVs: 70, kVs: 30 },
      ],
    );

    expect(rows[0].player).toBe("Aaron Judge");
    expect(rows[0].hrTargetScore).toBeGreaterThan(rows[1].hrTargetScore);
  });

  it("keeps batter rows aligned with the correct opposing pitcher matchup score", () => {
    const payload = normalizeHrDashboardPayload({
      date: "2026-05-08",
      generatedAt: "2026-05-08T10:30:00Z",
      games: [{ gameKey: "NYM@AZ", awayTeam: "NYM", homeTeam: "AZ", stadium: "Chase Field", roofType: "Retractable", parkFactor: 1 }],
      pitchers: [
        { gameKey: "NYM@AZ", pitcherId: 1, pitcher: "Ryne Nelson", team: "AZ", opponent: "NYM", hrVs: 74.9, hitsVs: 70.1, kVs: 30.2 },
        { gameKey: "NYM@AZ", pitcherId: 2, pitcher: "Kodai Senga", team: "NYM", opponent: "AZ", hrVs: 41.2, hitsVs: 38.4, kVs: 68.7 },
      ],
      batters: [
        { gameKey: "NYM@AZ", player: "Juan Soto", team: "NYM", opponent: "AZ", opposingPitcher: "Ryne Nelson", opposingPitcherId: 1, opposingPitcherHrVs: 74.9, hrScore: 70, hrScoreRank: 1 },
        { gameKey: "NYM@AZ", player: "Corbin Carroll", team: "AZ", opponent: "NYM", opposingPitcher: "Kodai Senga", opposingPitcherId: 2, opposingPitcherHrVs: 41.2, hrScore: 55, hrScoreRank: 2 },
      ],
    });

    const pitcherMap = new Map(payload?.pitchers.map((pitcher) => [pitcher.pitcherId, pitcher.hrVs]));
    expect(pitcherMap.get(payload?.batters[0].opposingPitcherId ?? null)).toBe(payload?.batters[0].opposingPitcherHrVs);
    expect(pitcherMap.get(payload?.batters[1].opposingPitcherId ?? null)).toBe(payload?.batters[1].opposingPitcherHrVs);
  });

  it("keeps matchup angle tags concise and skips tagging TBD pitcher rows", () => {
    expect(deriveAngleTags({
      opposingPitcher: "TBD",
      hrScore: 72,
      barrelRate: 15,
      hardHitRate: 52,
      kRate: 14,
      whiffRate: 20,
      opposingPitcherHrVs: 70,
      opposingPitcherHitsVs: 65,
      opposingPitcherKVs: 35,
      weatherBoost: 5,
    }, { parkFactor: 1.2 })).toEqual([]);

    const tags = deriveAngleTags({
      opposingPitcher: "Ryne Nelson",
      hrScore: 71,
      barrelRate: 18,
      hardHitRate: 54,
      kRate: 15,
      whiffRate: 21,
      opposingPitcherHrVs: 75,
      opposingPitcherHitsVs: 63,
      opposingPitcherKVs: 34,
      weatherBoost: 5,
    }, { parkFactor: 1.18 });

    expect(tags).toContain("HR damage edge");
    expect(tags.length).toBeLessThanOrEqual(2);
  });

  it("marks TBD starter games once and builds one footnote per affected matchup", () => {
    const payload = normalizeHrDashboardPayload({
      date: "2026-05-09",
      generatedAt: "2026-05-09T10:30:00Z",
      games: [
        { gameKey: "NYM@AZ", matchup: "NYM @ AZ", awayTeam: "NYM", homeTeam: "AZ", stadium: "Chase Field", roofType: "Retractable", parkFactor: 1 },
        { gameKey: "ATL@LAD", matchup: "ATL @ LAD", awayTeam: "ATL", homeTeam: "LAD", stadium: "Dodger Stadium", roofType: "Open", parkFactor: 1 },
      ],
      pitchers: [
        { gameKey: "ATL@LAD", pitcherId: 7, pitcher: "Emmet Sheehan", team: "LAD", opponent: "ATL", hrVs: 50, hitsVs: 45, kVs: 60 },
      ],
      batters: [
        { gameKey: "NYM@AZ", player: "Juan Soto", team: "NYM", opponent: "AZ", opposingPitcher: "TBD", hrScore: 70, hrScoreRank: 1 },
        { gameKey: "ATL@LAD", player: "Matt Olson", team: "ATL", opponent: "LAD", opposingPitcher: "Emmet Sheehan", hrScore: 76, hrScoreRank: 2 },
      ],
    });

    expect(payload).not.toBeNull();
    const tbdGameKeys = buildTbdGameKeySet(payload!.pitchers, payload!.batters);
    const footnotes = buildTbdFootnotes(tbdGameKeys, payload!.games, payload!.pitchers, payload!.batters);

    expect([...tbdGameKeys]).toEqual(["NYM@AZ"]);
    expect(footnotes).toEqual(["NYM @ AZ"]);
  });

  it("builds deterministic red-blue heat styles from slate-relative values", () => {
    const rows = normalizeHrPropRows([
      {
        player: "Low",
        team: "AAA",
        opponent: "BBB",
        opposingPitcher: "Pitcher Low",
        barrelRate: 5,
        hardHitRate: 30,
        xba: 0.201,
        kRate: 28,
        bbRate: 5,
        whiffRate: 33,
        last7HR: 0,
        last30HR: 1,
        opposingPitcherHrVs: 25,
        hrScore: 20,
        hrScoreRank: 2,
      },
      {
        player: "High",
        team: "CCC",
        opponent: "DDD",
        opposingPitcher: "Pitcher High",
        barrelRate: 20,
        hardHitRate: 60,
        xba: 0.324,
        kRate: 17,
        bbRate: 14,
        whiffRate: 18,
        last7HR: 3,
        last30HR: 9,
        opposingPitcherHrVs: 82,
        hrScore: 80,
        hrScoreRank: 1,
      },
    ]);

    const ranges = buildHeatStatRanges(rows);
    const hot = getHeatCellStyle(60, ranges.hardHitRate);
    const cold = getHeatCellStyle(30, ranges.hardHitRate);

    expect(hot?.backgroundColor).toContain("220, 38, 38");
    expect(cold?.backgroundColor).toContain("37, 99, 235");
  });
});
