import { computeModelEdge, getEdgeTierKey, getEdgeTierLabel } from "@/lib/mlb/mlbModelEdge";
import { resolveKPropStatus } from "@/lib/mlb/kPropStatus";
import { getProjectionEdgeInfo, sortByAbsoluteProjectionEdge } from "@/lib/mlb/kPropValueSorting";
import { keyForBvpRow } from "@/hooks/useMlbBvpHistory";
import { getPropEdgeTier } from "@/components/mlb/MlbPropModelComponents";
// @ts-expect-error -- plain JS module, no type declarations. This is the
// same value-play eligibility gate the completed Strikeout Props X
// value-post workflow uses (scripts/lib/mlb-k-x-selection-core.mjs,
// evaluateKValuePlayEligibility) -- VALID + projectedIP > 3.0 + nonzero
// edge + odds present for the edge-derived side. Deliberately NOT the
// looser >=0.4-edge/no-IP-check rule the public page's "Best Bets" section
// (buildKPropBestBets) uses -- see the PR discussion for why these two
// differ and which one this per-game card reuses.
import { evaluateKValuePlayEligibility } from "../../../../scripts/lib/mlb-k-x-selection-core.mjs";
import type { PitcherStrikeoutTeamRow, PitcherVsBatterRow } from "@/pages/MlbHrProps";
import type { NumerologyPlay, WatchlistPlay } from "@/types/mlbNumerology";
import type {
  BuildGameTopPropsInput,
  BvpItem,
  GameTopProps,
  HrPropItem,
  KPropItem,
  MoneylineSummaryItem,
  NumerologyItem,
  TopPropsCard,
} from "@/lib/mlb/topProps/types";

const HR_MIN_AT_BATS = 50;
const HR_MAX_BARREL_RATE = 25;
const HR_RESULT_CAP = 3;
const K_RESULT_CAP = 2;
const BVP_RESULT_CAP = 3;
const NUMEROLOGY_RESULT_CAP = 3;

const HR_CTA_HREF = "/mlb/hr-props";
const K_CTA_HREF = "/mlb/strikeout-props";
const BVP_CTA_HREF = "/mlb/batter-vs-pitcher";
const NUMEROLOGY_CTA_HREF = "/mlb/numerology";

function isGameStarted(input: BuildGameTopPropsInput): boolean {
  return input.identity.gameStatusCategory === "in-progress" || input.identity.gameStatusCategory === "final";
}

function closedCard<T>(ctaHref: string | null, message: string): TopPropsCard<T> {
  return { status: "closed", items: [], message, ctaHref };
}

function staleCard<T>(ctaHref: string | null): TopPropsCard<T> {
  return { status: "stale", items: [], message: "Stale data", ctaHref };
}

function emptyCard<T>(ctaHref: string | null, message: string): TopPropsCard<T> {
  return { status: "empty", items: [], message, ctaHref };
}

function okCard<T>(items: T[], ctaHref: string | null, message: string | null = null): TopPropsCard<T> {
  return { status: "ok", items, message, ctaHref };
}

function isRealAmericanOdds(value: string | null | undefined): value is string {
  return value != null && /^[+-]\d+$/.test(String(value).trim());
}

/**
 * Compact Moneyline summary. Calls computeModelEdge(detail) directly -- the
 * same live computation MlbModelEdgeHero already renders -- never reads the
 * archival ml-picks-raw.json snapshot, and never recomputes a second edge.
 */
function buildMoneylineSummary(input: BuildGameTopPropsInput): TopPropsCard<MoneylineSummaryItem> {
  if (isGameStarted(input)) {
    return closedCard(
      null,
      input.identity.gameStatusCategory === "final" ? "Final -- no new picks" : "Game in progress -- no new picks",
    );
  }

  const { detail, mlbOdds, polymarket, identity } = input;
  const result = computeModelEdge(detail);
  const isPush = result.pick === "push";
  const pickAbbr = isPush ? null : result.pick === "away" ? identity.awayAbbr : identity.homeAbbr;
  const tierKey = getEdgeTierKey(result.confidence);
  const tierLabel = isPush ? "Coin flip" : getEdgeTierLabel(result.confidence);

  const ml = mlbOdds?.moneylines?.[`${identity.awayAbbr}@${identity.homeAbbr}`];
  const awayAmerican = ml?.away?.american ?? null;
  const homeAmerican = ml?.home?.american ?? null;
  const hasRealOdds = isRealAmericanOdds(awayAmerican) && isRealAmericanOdds(homeAmerican);
  const marketLine = hasRealOdds ? `${identity.awayAbbr} ${awayAmerican} / ${identity.homeAbbr} ${homeAmerican}` : null;

  // Same null-safety chain as getPolymarketAgreement in MlbGameDetail.tsx:
  // never computed for a push, never fabricated when unmatched/missing.
  let polymarketAgreement: "aligned" | "contrarian" | null = null;
  let polymarketPrice: number | null = null;
  if (!isPush && polymarket?.games?.length) {
    const pmGame = polymarket.games.find((g) => g.gamePk === identity.gamePk);
    if (pmGame?.matched) {
      const pickIsAway = result.pick === "away";
      const pickTeam = pickIsAway ? pmGame.away : pmGame.home;
      const otherTeam = pickIsAway ? pmGame.home : pmGame.away;
      if (pickTeam.yesPrice != null && otherTeam.yesPrice != null) {
        polymarketAgreement = pickTeam.yesPrice >= otherTeam.yesPrice ? "aligned" : "contrarian";
        polymarketPrice = pickTeam.yesPrice;
      }
    }
  }

  const item: MoneylineSummaryItem = {
    isPush,
    pickAbbr,
    tierKey,
    tierLabel,
    topFactor: result.topFactor,
    differential: result.differential,
    marketLine,
    polymarketAgreement,
    polymarketPrice,
  };

  // Omitted per product decision: the full breakdown is already the hero
  // directly above this section -- no CTA here to avoid a redundant link.
  return okCard([item], null, marketLine ? null : "Market pending");
}

function compareNullsLast(a: number | null | undefined, b: number | null | undefined): number {
  const left = a ?? null;
  const right = b ?? null;
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

/** Filters HR batters to this game via canonical gameId, then re-ranks the per-game subset by hrScore -- hrScoreRank itself is a global slate-wide rank and must never be sliced directly. */
function buildHrPropsCard(input: BuildGameTopPropsInput): TopPropsCard<HrPropItem> {
  if (isGameStarted(input)) return closedCard(HR_CTA_HREF, gameClosedMessage(input));
  if (input.propsData.stale) return staleCard(HR_CTA_HREF);

  const { identity, propsData } = input;
  const isPending = propsData.pendingGames.some((g) => g.gameId === identity.gamePk);
  if (isPending) return emptyCard(HR_CTA_HREF, "Starter TBD -- lineups not yet confirmed.");

  const gameBatters = propsData.batters.filter((b) => b.gameId === identity.gamePk);
  const eligible = gameBatters.filter(
    (b) => (b.atBats == null || b.atBats >= HR_MIN_AT_BATS) && (b.barrelRate == null || b.barrelRate <= HR_MAX_BARREL_RATE),
  );

  if (eligible.length === 0) {
    return emptyCard(HR_CTA_HREF, "No qualifying HR props for this game yet.");
  }

  const ranked = [...eligible].sort(
    (a, b) => b.hrScore - a.hrScore || compareNullsLast(a.barrelRate, b.barrelRate) || a.player.localeCompare(b.player),
  );

  const items: HrPropItem[] = ranked.slice(0, HR_RESULT_CAP).map((b, index) => ({
    player: b.player,
    team: b.team,
    opponent: b.opponent,
    hrScore: b.hrScore,
    gameRank: index + 1,
    hrOddsYes: b.hrOddsYes ?? null,
    hrOddsBook: b.hrOddsBook ?? null,
    confidenceLevel: b.confidenceLevel ?? null,
  }));

  const anyUnconfirmed = gameBatters.some((b) => b.lineupStatus !== "confirmed");
  return okCard(items, HR_CTA_HREF, anyUnconfirmed ? "Waiting for confirmed lineup" : null);
}

/**
 * Filters strikeout rows to this game via canonical gameId (doubleheader-safe
 * -- gameKey alone is not). Preserves resolveKPropStatus() as the sole
 * eligibility authority: only VALID (qualified) and NO_MARKET (informational,
 * "Market pending") rows may appear -- every other status is dropped, never
 * relabeled as a qualified play.
 */
function buildStrikeoutsCard(input: BuildGameTopPropsInput): TopPropsCard<KPropItem> {
  if (isGameStarted(input)) return closedCard(K_CTA_HREF, gameClosedMessage(input));
  if (input.propsData.stale) return staleCard(K_CTA_HREF);

  const { identity, propsData, detail } = input;
  const isPending = propsData.pendingGames.some((g) => g.gameId === identity.gamePk);
  if (isPending) return emptyCard(K_CTA_HREF, "Starter TBD -- lineups not yet confirmed.");

  const gameRows = propsData.strikeoutDetailRows.filter((row) => row.gameId === identity.gamePk);

  // Live starter identity for THIS render -- gameId filtering alone proves a
  // row belongs to this game, not that the pitcher is still the currently
  // listed starter (a scratch/replacement/opener change can leave a stale
  // same-game row behind). detail.starters is fetched fresh from the live
  // MLB Stats API on every page load, independent of the props payload's
  // own generation time, so this is the authoritative live source. Either
  // side can legitimately be null (probable pitcher not yet posted) -- no
  // name-based fallback is used when that happens; see isQualifiedKValuePlay.
  const liveStarterIds: number[] = [detail.starters.away.id, detail.starters.home.id].filter(
    (id): id is number => id != null,
  );

  const qualified: PitcherStrikeoutTeamRow[] = [];
  const informational: PitcherStrikeoutTeamRow[] = [];

  for (const row of gameRows) {
    const status = resolveKPropStatus(row).status;
    if (status === "VALID") {
      if (isQualifiedKValuePlay(row, liveStarterIds)) qualified.push(row);
      // else: a real market exists, but it doesn't clear the value-play bar
      // (zero edge, projectedIP <= 3.0, or missing odds for the derived
      // side) -- excluded entirely, same as any other non-VALID/NO_MARKET
      // status. A market-priced row we deliberately decline to recommend
      // must never be shown as if it were an open, unrecommended option.
    } else if (status === "NO_MARKET") {
      informational.push(row);
    }
    // Every other status (LOW_CONFIDENCE, INSUFFICIENT_DATA, INVALID_ODDS,
    // INVALID_WORKLOAD) is already excluded -- never surfaced here.
  }

  if (qualified.length === 0 && informational.length === 0) {
    return emptyCard(K_CTA_HREF, "No qualified strikeout play for this game.");
  }

  const orderedRows: PitcherStrikeoutTeamRow[] = [...sortByAbsoluteProjectionEdge(qualified), ...informational];
  const qualifiedSet = new Set(qualified);

  const items: KPropItem[] = orderedRows.slice(0, K_RESULT_CAP).map((row) => {
    const edge = getProjectionEdgeInfo(row);
    return {
      pitcher: row.pitcher,
      team: row.team,
      opponent: row.opponent,
      qualification: qualifiedSet.has(row) ? "qualified" : "informational",
      direction: edge.direction,
      projectedKs: edge.projectedKs,
      kLine: edge.kLine,
      projectionEdge: edge.projectionEdge,
      kOddsOver: row.kOddsOver ?? null,
      kOddsUnder: row.kOddsUnder ?? null,
    };
  });

  return okCard(items, K_CTA_HREF);
}

/**
 * A VALID row is only a "qualified" recommendation when it also clears the
 * same value-play bar the completed Strikeout Props X workflow uses
 * (evaluateKValuePlayEligibility in scripts/lib/mlb-k-x-selection-core.mjs):
 * projectedIP strictly > 3.0, a nonzero projection edge, valid odds for the
 * edge-derived side specifically, and -- the same guard the X workflow
 * enforces via its own live confirmation snapshot -- the pitcher must still
 * be the currently listed starter. Reused directly rather than
 * reimplemented -- this must never drift from the X workflow's rule.
 *
 * isCurrentStarter is derived here from row.pitcherId against
 * `liveStarterIds` (this game's two starter ids, read fresh from
 * detail.starters). Deliberately conservative in both directions, with no
 * display-name fallback:
 *   - row.pitcherId missing -> never current (can't prove identity).
 *   - liveStarterIds empty (both live starter ids unresolved -- MLB hasn't
 *     posted a probable pitcher for one or both sides yet) -> no row can be
 *     proven current, so nothing qualifies until a live id is available.
 *   - row.pitcherId present but absent from liveStarterIds -> a stale
 *     row for a scratched/replaced/opener-changed pitcher -- rejected.
 *
 * gameStarted is hard-coded false: that part of the shared function's
 * contract is about the X-poster's own scrape-then-reconfirm staleness
 * guard; "game started" is already handled at the whole-card level above.
 */
function isQualifiedKValuePlay(row: PitcherStrikeoutTeamRow, liveStarterIds: readonly number[]): boolean {
  const isCurrentStarter = row.pitcherId != null && liveStarterIds.includes(row.pitcherId);
  const evaluation = evaluateKValuePlayEligibility({
    status: "VALID",
    kLine: row.kLine,
    projectedKs: row.projectedKs,
    projectedIP: row.projectedIP,
    oddsOver: row.kOddsOver,
    oddsUnder: row.kOddsUnder,
    isCurrentStarter,
    gameStarted: false,
  });
  return Boolean(evaluation.eligible);
}

function buildCareerLine(
  row: PitcherVsBatterRow,
  bvpHistoryByKey: Map<string, import("@/hooks/useMlbBvpHistory").BvpHistoryEntry>,
): string | null {
  const key = keyForBvpRow(row.playerId, row.opposingPitcherId);
  if (!key) return null;
  const entry = bvpHistoryByKey.get(key);
  if (!entry || entry.status !== "available" || !entry.career) return null;
  const { pa, h, hr } = entry.career;
  if (pa == null || h == null) return null;
  const hrSuffix = hr ? `, ${hr} HR` : "";
  return `${h}-for-${pa}${hrSuffix} (career)`;
}

/** Filters batter-vs-pitcher matchup rows to this game via canonical gameId. Ranks by bestMatchupScore -- the existing canonical ranking field, never recomputed. bvp-history career stats are supporting context only, per existing convention (never a ranking input); no new PA eligibility threshold is introduced. */
function buildBatterVsPitcherCard(input: BuildGameTopPropsInput): TopPropsCard<BvpItem> {
  if (isGameStarted(input)) return closedCard(BVP_CTA_HREF, gameClosedMessage(input));
  if (input.propsData.stale) return staleCard(BVP_CTA_HREF);

  const { identity, propsData, bvpHistoryByKey } = input;
  const gameRows = propsData.batterVsPitcherRows.filter((row) => row.gameId === identity.gamePk);

  if (gameRows.length === 0) {
    return emptyCard(BVP_CTA_HREF, "No standout batter-vs-pitcher edge for this game.");
  }

  const ranked = [...gameRows].sort(
    (a, b) =>
      b.bestMatchupScore - a.bestMatchupScore ||
      b.hrScore - a.hrScore ||
      compareNullsLast(a.barrelRate, b.barrelRate) ||
      a.player.localeCompare(b.player),
  );

  const items: BvpItem[] = ranked.slice(0, BVP_RESULT_CAP).map((row) => ({
    player: row.player,
    team: row.team,
    opponent: row.opposingPitcher,
    bestMatchupScore: row.bestMatchupScore,
    tierLabel: getPropEdgeTier(row.bestMatchupScore).label,
    careerLine: buildCareerLine(row, bvpHistoryByKey),
  }));

  return okCard(items, BVP_CTA_HREF);
}

// WatchlistPlay's formal type omits `playerId` even though the raw JSON
// (and NumerologyPlay) both carry it -- widen locally rather than touching
// the shared type file for this narrow, additive need.
type NumerologyCandidate = (NumerologyPlay | WatchlistPlay) & { playerId?: string | number | null };

/**
 * Filters numerology plays to this game by matching the payload's own slate
 * date plus the live schedule's away/home abbreviations (never the app's
 * static team-abbreviation constants, which disagree with the live feed for
 * Arizona -- "ARI" vs "AZ"). Prioritizes the canonical ranked/featured output
 * (featuredPlays, then watchlist -- both carry an explicit slate-wide `rank`)
 * rather than inventing a new cross-array score. Dedupes by playerId.
 */
function buildNumerologyCard(input: BuildGameTopPropsInput): TopPropsCard<NumerologyItem> {
  if (isGameStarted(input)) return closedCard(NUMEROLOGY_CTA_HREF, gameClosedMessage(input));

  const { identity, numerology } = input;
  const { data, isStale } = numerology;

  if (!data) {
    return emptyCard(NUMEROLOGY_CTA_HREF, "Numerology data unavailable.");
  }
  if (isStale) {
    return staleCard(NUMEROLOGY_CTA_HREF);
  }
  if (data.date !== identity.gameDate) {
    return staleCard(NUMEROLOGY_CTA_HREF);
  }

  const pool: NumerologyCandidate[] = [...data.featuredPlays, ...data.watchlist];
  const matchesThisGame = (row: NumerologyCandidate) =>
    (row.team === identity.awayAbbr && row.opponent === identity.homeAbbr) ||
    (row.team === identity.homeAbbr && row.opponent === identity.awayAbbr);

  const candidates = pool.filter((row) => matchesThisGame(row) && row.lineupStatus !== "not_starting");

  const seenPlayerIds = new Set<string>();
  const deduped: NumerologyCandidate[] = [];
  for (const row of candidates) {
    const key = row.playerId != null ? String(row.playerId) : `${row.playerName}|${row.team}`;
    if (seenPlayerIds.has(key)) continue;
    seenPlayerIds.add(key);
    deduped.push(row);
  }

  if (deduped.length === 0) {
    return emptyCard(NUMEROLOGY_CTA_HREF, "No numerology matches for players in this game today.");
  }

  const ranked = deduped.sort((a, b) => a.rank - b.rank);

  const items: NumerologyItem[] = ranked.slice(0, NUMEROLOGY_RESULT_CAP).map((row) => ({
    playerId: row.playerId ?? null,
    playerName: row.playerName,
    team: row.team,
    opponent: row.opponent,
    numerologyScore: row.numerologyScore,
    finalScore: row.finalScore,
    recommendedMarket: row.recommendedMarket,
  }));

  const anyUnconfirmed = deduped.some((row) => row.lineupStatus !== "confirmed");
  return okCard(items, NUMEROLOGY_CTA_HREF, anyUnconfirmed ? "Waiting for confirmed lineup" : null);
}

function gameClosedMessage(input: BuildGameTopPropsInput): string {
  return input.identity.gameStatusCategory === "final" ? "Final -- no new picks" : "Game in progress -- no new picks";
}

/**
 * Builds the full "Top Props for This Game" payload. Pure -- consumes only
 * data the page has already loaded, performs no network calls, and never
 * recomputes a canonical model's own scoring. Every category re-ranks its
 * own per-game subset locally rather than trusting an upstream global rank.
 */
export function buildGameTopProps(input: BuildGameTopPropsInput): GameTopProps {
  return {
    moneyline: buildMoneylineSummary(input),
    homeRuns: buildHrPropsCard(input),
    strikeouts: buildStrikeoutsCard(input),
    batterVsPitcher: buildBatterVsPitcherCard(input),
    numerology: buildNumerologyCard(input),
    overUnder: { status: "coming-soon" },
  };
}
