import { describe, expect, it } from "vitest";
import { getMlbMoneylinesWithFallbacks } from "../../../scripts/lib/mlb-moneyline-providers.mjs";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-requests-remaining": "10" },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", "x-requests-remaining": "10" },
  });
}

describe("MLB moneyline provider fallbacks", () => {
  it("keeps The Odds API as the winning primary source", async () => {
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      calls.push(url);
      return jsonResponse([
        {
          away_team: "Chicago White Sox",
          home_team: "Kansas City Royals",
          bookmakers: [
            {
              key: "draftkings",
              markets: [
                {
                  key: "h2h",
                  outcomes: [
                    { name: "Chicago White Sox", price: 145 },
                    { name: "Kansas City Royals", price: -165 },
                  ],
                },
              ],
            },
          ],
        },
      ]);
    };

    const result = await getMlbMoneylinesWithFallbacks({
      oddsApiKey: "odds-key",
      sportsGameOddsApiKey: "sgo-key",
      oddsApiIoKey: "io-key",
      fetchFn: fetchFn as typeof fetch,
      logger: {},
    });

    expect(calls).toHaveLength(1);
    expect(result.metadata.source).toBe("the-odds-api");
    expect(result.metadata.fallbackUsed).toBe(false);
    expect(result.moneylines["CWS@KC"]).toEqual({
      away: { team: "Chicago White Sox", price: 145, american: "+145", implied: 100 / 245 },
      home: { team: "Kansas City Royals", price: -165, american: "-165", implied: 165 / 265 },
    });
  });

  it("uses SportsGameOdds when The Odds API fails", async () => {
    const fetchFn = async (url: string) => {
      if (url.includes("api.the-odds-api.com")) return textResponse("out of credits", 429);
      return jsonResponse({
        success: true,
        data: [
          {
            teams: {
              away: { names: { short: "CHW" } },
              home: { names: { short: "KCR" } },
            },
            odds: {
              awayMl: {
                betTypeID: "ml",
                sideID: "away",
                periodID: "game",
                byBookmaker: { draftkings: { odds: "+150", available: true } },
              },
              homeMl: {
                betTypeID: "ml",
                sideID: "home",
                periodID: "game",
                byBookmaker: { draftkings: { odds: "-170", available: true } },
              },
            },
          },
        ],
      });
    };

    const result = await getMlbMoneylinesWithFallbacks({
      oddsApiKey: "odds-key",
      sportsGameOddsApiKey: "sgo-key",
      oddsApiIoKey: "io-key",
      fetchFn: fetchFn as typeof fetch,
      logger: {},
    });

    expect(result.metadata.source).toBe("sportsgameodds");
    expect(result.metadata.fallbackUsed).toBe(true);
    expect(result.moneylines["CWS@KC"].away.american).toBe("+150");
    expect(result.moneylines["CWS@KC"].home.american).toBe("-170");
  });

  it("uses Odds-API.io when both earlier providers fail", async () => {
    const fetchFn = async (url: string) => {
      if (url.includes("api.the-odds-api.com")) return textResponse("server error", 500);
      if (url.includes("api.sportsgameodds.com")) return jsonResponse({ success: true, data: [] });
      if (url.includes("/events?")) return jsonResponse({ data: [{ id: 101 }] });
      return jsonResponse([
        {
          home: "Kansas City Royals",
          away: "Chicago White Sox",
          bookmakers: {
            DraftKings: [
              {
                name: "ML",
                odds: [{ home: "1.62", away: "2.50" }],
              },
            ],
          },
        },
      ]);
    };

    const result = await getMlbMoneylinesWithFallbacks({
      oddsApiKey: "odds-key",
      sportsGameOddsApiKey: "sgo-key",
      oddsApiIoKey: "io-key",
      fetchFn: fetchFn as typeof fetch,
      logger: {},
    });

    expect(result.metadata.source).toBe("odds-api-io");
    expect(result.moneylines["CWS@KC"].away.american).toBe("+150");
    expect(result.moneylines["CWS@KC"].home.american).toBe("-161");
  });

  it("returns the existing empty odds shape when every provider fails", async () => {
    const fetchFn = async () => textResponse("rate limited", 429);

    const result = await getMlbMoneylinesWithFallbacks({
      oddsApiKey: "odds-key",
      sportsGameOddsApiKey: "sgo-key",
      oddsApiIoKey: "io-key",
      fetchFn: fetchFn as typeof fetch,
      logger: {},
    });

    expect(result.metadata.source).toBe("none");
    expect(result.metadata.fallbackUsed).toBe(true);
    expect(result.moneylines).toEqual({});
    expect(result.metadata.providerErrors.length).toBe(4);
  });

  it("handles malformed provider responses without crashing", async () => {
    const fetchFn = async (url: string) => {
      if (url.includes("api.the-odds-api.com")) return textResponse("not json");
      if (url.includes("api.sportsgameodds.com")) return jsonResponse({ data: [{ odds: {} }] });
      // ESPN and odds-api-io return non-JSON to force failure
      return textResponse("not json");
    };

    const result = await getMlbMoneylinesWithFallbacks({
      oddsApiKey: "odds-key",
      sportsGameOddsApiKey: "sgo-key",
      oddsApiIoKey: "io-key",
      fetchFn: fetchFn as typeof fetch,
      logger: {},
    });

    expect(result.metadata.source).toBe("none");
    expect(result.moneylines).toEqual({});
    expect(result.metadata.providerErrors.join(" ")).toContain("malformed JSON");
  });

  it("uses ESPN when all keyed providers fail", async () => {
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      calls.push(url);
      if (url.includes("scoreboard")) {
        return new Response(JSON.stringify({
          events: [{
            id: "123",
            competitions: [{
              competitors: [
                { homeAway: "away", team: { abbreviation: "TOR" } },
                { homeAway: "home", team: { abbreviation: "BOS" } },
              ],
            }],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/odds")) {
        return new Response(JSON.stringify({
          items: [{
            provider: { name: "DraftKings" },
            awayTeamOdds: { moneyLine: 104 },
            homeTeamOdds: { moneyLine: -126 },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    };

    const result = await getMlbMoneylinesWithFallbacks({
      oddsApiKey: undefined,
      sportsGameOddsApiKey: undefined,
      oddsApiIoKey: undefined,
      fetchFn: fetchFn as typeof fetch,
      logger: {},
    });

    expect(result.metadata.source).toBe("espn");
    expect(result.moneylines["TOR@BOS"]?.away?.american).toBe("+104");
    expect(result.moneylines["TOR@BOS"]?.home?.american).toBe("-126");
  });
});