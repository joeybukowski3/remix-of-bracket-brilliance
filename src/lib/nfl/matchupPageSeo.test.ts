import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CANONICAL_BASE } from "@/hooks/usePageSeo";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { buildMatchupFromGame, type NflMatchup } from "@/lib/nfl/matchups";
import type { NflGameRecord } from "@/lib/nfl/standings";
import {
  buildNflMatchupDescription,
  buildNflMatchupStructuredData,
  buildNflMatchupTitle,
  nflMatchupCanonicalUrl,
} from "@/lib/nfl/matchupPageSeo";

const ROOT = resolve(__dirname, "../../..");
const GAMES: NflGameRecord[] = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2026/games.json"), "utf-8")).games;
const GUIDE = getNflSeasonGuide(2026)!;

function matchupFor(gameId: string): NflMatchup {
  return buildMatchupFromGame(GAMES.find((game) => game.gameId === gameId)!, GUIDE)!;
}

const HOME_GAME = matchupFor("2026_01_NE_SEA");
const NEUTRAL_GAME = matchupFor("2026_04_IND_WAS");

describe("matchup page metadata", () => {
  it("uses the same canonical origin as usePageSeo", () => {
    expect(nflMatchupCanonicalUrl(HOME_GAME)).toBe(
      `${CANONICAL_BASE}/nfl/matchups/2026/week-1/new-england-patriots-at-seattle-seahawks`
    );
  });

  it("names both teams, the season and the week", () => {
    expect(buildNflMatchupTitle(HOME_GAME)).toBe(
      "New England Patriots at Seattle Seahawks — 2026 Week 1 Matchup | Joe Knows Ball"
    );
    expect(buildNflMatchupDescription(HOME_GAME)).toBe(
      "New England Patriots vs Seattle Seahawks 2026 NFL Week 1 preview: power ratings, side-by-side comparison, model advantages and matchup angles."
    );
  });

  it("says vs, not at, for a neutral-site game and names the venue from the schedule", () => {
    expect(buildNflMatchupTitle(NEUTRAL_GAME)).toBe(
      "Indianapolis Colts vs Washington Commanders — 2026 Week 4 Matchup | Joe Knows Ball"
    );
    expect(buildNflMatchupDescription(NEUTRAL_GAME)).toContain(`preview at ${NEUTRAL_GAME.stadium}:`);
  });
});

describe("matchup structured data", () => {
  it("emits a SportsEvent built only from the schedule record", () => {
    const [event] = buildNflMatchupStructuredData(HOME_GAME);
    expect(event).toEqual({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: "New England Patriots at Seattle Seahawks",
      url: nflMatchupCanonicalUrl(HOME_GAME),
      sport: "American Football",
      homeTeam: { "@type": "SportsTeam", name: "Seattle Seahawks" },
      awayTeam: { "@type": "SportsTeam", name: "New England Patriots" },
      startDate: HOME_GAME.kickoffUtc,
      location: { "@type": "Place", name: HOME_GAME.stadium },
    });
  });

  it("omits startDate and location when the schedule has none, and never invents a status", () => {
    const [event] = buildNflMatchupStructuredData({ ...HOME_GAME, kickoffUtc: null, stadium: null });
    expect(event).not.toHaveProperty("startDate");
    expect(event).not.toHaveProperty("location");
    expect(event).not.toHaveProperty("eventStatus");
  });

  it("emits Home › NFL › Matchups › Week › game breadcrumbs ending at the canonical URL", () => {
    const [, breadcrumbs] = buildNflMatchupStructuredData(NEUTRAL_GAME);
    const items = breadcrumbs.itemListElement as Array<{ position: number; name: string; item: string }>;
    expect(items.map((item) => item.name)).toEqual([
      "Home",
      "NFL",
      "Matchups",
      "Week 4",
      "Indianapolis Colts vs Washington Commanders",
    ]);
    expect(items.map((item) => item.position)).toEqual([1, 2, 3, 4, 5]);
    expect(items[3].item).toBe(`${CANONICAL_BASE}/nfl/matchups?week=4`);
    expect(items[4].item).toBe(nflMatchupCanonicalUrl(NEUTRAL_GAME));
  });
});
