/**
 * Discovery: given a season/week, returns the WalterFootball window URLs to
 * capture. Verified (2026-09-09, live fetch) for Week 1: the two grouping
 * pages `nflpicks{season}_{week:02}early.php` and `...late.php`, each of
 * which accumulates one or more per-game `div.panel[id]` sections as Walt
 * publishes through the week -- NOT one page per game.
 *
 * WalterFootball has historically also published dedicated primetime pages
 * in some seasons (e.g. a "_TNF"/"_SNF"/"_MNF" suffix) in addition to, or
 * instead of, folding those games into early/late. This has NOT been
 * verified against the live 2026 site beyond Week 1, where the Thursday
 * game (Patriots @ Seahawks) appeared inside the "early" page rather than a
 * separate primetime page. `PRIMETIME_URL_CANDIDATES` is therefore left
 * empty by default; capture-walter-week.mjs treats a 404/unreachable
 * candidate as a normal "not published this way" outcome, never a hard
 * failure, so it's safe to extend this list once a given week's primetime
 * structure is confirmed by hand.
 */

const BASE = "https://walterfootball.com";

export function buildWindowUrls(season, week) {
  const weekPadded = String(week).padStart(2, "0");
  return [
    { window: "early", url: `${BASE}/nflpicks${season}_${weekPadded}early.php` },
    { window: "late", url: `${BASE}/nflpicks${season}_${weekPadded}late.php` },
  ];
}
