/**
 * Deterministic current-season qualification for the locked NFL situational
 * trend definitions. This module reuses Phase 1 / Phase 2B primitives and
 * never calculates historical performance or changes a prediction model.
 */

import {
  TREND_DEFINITIONS,
  blowoutThresholds,
  calculateRestDays,
  gradeTeamAts,
  isByeGap,
  isDivisionalMatchup,
  isLesserFavorite,
  isMajorOpponent,
  isPrimeTimeKickoff,
  isWestToEastEarly,
  qualifiesLetdown,
  qualifiesLookAhead,
  qualifiesSandwich,
  roadSequenceAt,
} from "./nfl-situational-trends-core.mjs";
import {
  PHASE2B_TREND_IDS,
  doubleDigitClassification,
  doubleDigitMarginBand,
  favoriteSpreadBand,
  homeUnderdog,
  isMondayNight,
  isOvertimeValue,
  isSundayNight,
  previousScoreBand,
  priorUpsetClassification,
  roadFavorite,
  underdogSpreadBand,
} from "./nfl-situational-trends-phase2b-core.mjs";
import {
  PHASE2C_TREND_IDS,
  isWeek1FavoriteAtsLoss,
  isWeek1FavoriteLostOutright,
  isWeek1UnderdogWonOutright,
  marginAtLeast,
  marketRole,
  priorSeasonPlayoffStatus,
  priorSeasonRecordRole,
} from "./nfl-situational-trends-phase2c-core.mjs";

export const CURRENT_TREND_SCHEMA_VERSION = "nfl-situational-trend-matchups-v1";

export const QUALIFICATION_STATUS = Object.freeze({
  confirmed: "CONFIRMED",
  awaitingMarket: "AWAITING_MARKET",
  awaitingPriorResult: "AWAITING_PRIOR_RESULT",
  unavailable: "UNAVAILABLE",
  notApplicable: "NOT_APPLICABLE",
});

export const CURRENT_TREND_IDS = Object.freeze([
  ...TREND_DEFINITIONS.map((trend) => trend.id),
  ...PHASE2B_TREND_IDS,
  ...PHASE2C_TREND_IDS,
]);

const finite = (value) => Number.isFinite(value);

function status(value, reason, variantIds = []) {
  return { status: value, reason, variantIds };
}

function sideForGame(game, team) {
  const isHome = game.homeAbbr === team;
  const isAway = game.awayAbbr === team;
  if (!isHome && !isAway) return null;
  return {
    team,
    opponent: isHome ? game.awayAbbr : game.homeAbbr,
    venue: game.neutralSite ? "neutral" : isHome ? "home" : "away",
  };
}

function spreadFor(market, team) {
  if (!market) return null;
  const value = market.homeAbbr === team ? market.spread?.home : market.awayAbbr === team ? market.spread?.away : null;
  return finite(value) ? value : null;
}

function resultFor(result, team) {
  if (!result?.final) return null;
  const isHome = result.homeAbbr === team;
  const isAway = result.awayAbbr === team;
  if (!isHome && !isAway) return null;
  const teamScore = isHome ? result.homeScore : result.awayScore;
  const opponentScore = isHome ? result.awayScore : result.homeScore;
  if (!finite(teamScore) || !finite(opponentScore)) return null;
  return {
    teamScore,
    opponentScore,
    pointMargin: teamScore - opponentScore,
    overtime: result.overtime ?? result.overtimeIndicator ?? null,
  };
}

function locationVariant(row) {
  if (row.venue === "home") return "current-home";
  if (row.venue === "away") return "current-road";
  return null;
}

function marketVariant(row) {
  if (!finite(row.teamSpread) || row.teamSpread === 0) return null;
  return row.teamSpread < 0 ? "current-favorite" : "current-underdog";
}

function commonCurrentVariants(row) {
  return [locationVariant(row), marketVariant(row)].filter(Boolean);
}

function priorResultUnavailable(row) {
  if (!row.previousGame) return status(QUALIFICATION_STATUS.notApplicable, "No previous same-season game.");
  if (!row.previousResult) return status(QUALIFICATION_STATUS.awaitingPriorResult, "Awaiting the previous game's final result.");
  return null;
}

function marketUnavailable(reason = "Awaiting a current market spread.") {
  return status(QUALIFICATION_STATUS.awaitingMarket, reason);
}

function confirmed(reason, variantIds = []) {
  return status(QUALIFICATION_STATUS.confirmed, reason, variantIds);
}

function notApplicable(reason) {
  return status(QUALIFICATION_STATUS.notApplicable, reason);
}

/** Evaluate one team-game against one locked broad trend definition. */
export function evaluateCurrentTrend(row, trendId) {
  const previousGate = () => priorResultUnavailable(row);
  const spread = row.teamSpread;
  const previous = row.previousResult
    ? { ...row.previousResult, teamSpread: row.previousTeamSpread }
    : null;
  const week1Gate = () => (row.week === 1 ? null : notApplicable(`This is a Week 1 definition; the current game is Week ${row.week ?? "unknown"}.`));
  const week2Gate = () => {
    if (row.week !== 2) return notApplicable(`This is a Week 2 definition; the current game is Week ${row.week ?? "unknown"}.`);
    if (!row.previousGame || row.previousGame.week !== 1) return notApplicable("Week 2 bounce-back definitions require an immediately previous Week 1 game.");
    return previousGate();
  };
  const opponentWeek1 = row.opponentPreviousResult
    ? { ...row.opponentPreviousResult, teamSpread: row.opponentPreviousTeamSpread }
    : null;

  switch (trendId) {
    case "classic-sandwich": {
      if (!row.previousGame || !row.nextGame) return notApplicable("Both adjacent same-season games are required.");
      if (!row.previousMajorOpponent || !row.nextMajorOpponent || row.currentMajorOpponent) {
        return notApplicable("The adjacent/current opponent major-status pattern does not qualify.");
      }
      if (!finite(spread)) return marketUnavailable();
      const lesserFavorite = isLesserFavorite({ majorOpponent: row.currentMajorOpponent, teamSpread: spread });
      return qualifiesSandwich({ lesserFavorite, previousMajorOpponent: row.previousMajorOpponent, nextMajorOpponent: row.nextMajorOpponent })
        ? confirmed("Favored by at least 6 against a non-major opponent between two major opponents.")
        : notApplicable("The team is not favored by at least 6 in the qualifying opponent sequence.");
    }
    case "look-ahead": {
      if (!row.nextGame) return notApplicable("No next same-season opponent.");
      if (!row.nextMajorOpponent || row.currentMajorOpponent) return notApplicable("The current/next opponent major-status pattern does not qualify.");
      if (!finite(spread)) return marketUnavailable();
      const lesserFavorite = isLesserFavorite({ majorOpponent: row.currentMajorOpponent, teamSpread: spread });
      return qualifiesLookAhead({ lesserFavorite, nextMajorOpponent: row.nextMajorOpponent })
        ? confirmed("Favored by at least 6 against a non-major opponent before a major opponent.")
        : notApplicable("The team is not favored by at least 6 in the qualifying opponent sequence.");
    }
    case "letdown": {
      const gate = previousGate();
      if (gate) return gate;
      if (previous.pointMargin <= 0) return notApplicable("The team did not win its previous game.");
      if (row.previousMajorOpponent || row.previousPrimeTime) {
        return confirmed("Won the previous game in a major-opponent or prime-time situation.");
      }
      if (!finite(row.previousTeamSpread)) return marketUnavailable("Awaiting the previous game's market spread.");
      return qualifiesLetdown({
        previousPointMargin: previous.pointMargin,
        previousTeamSpread: row.previousTeamSpread,
        previousMajorOpponent: row.previousMajorOpponent,
        previousPrimeTime: row.previousPrimeTime,
      })
        ? confirmed("Won the previous game as an underdog of at least 3 points.")
        : notApplicable("The previous win was not divisional, against a prior playoff team, a 3+ point upset, or prime time.");
    }
    case "short-rest-disadvantage": {
      if (!row.previousGame) return notApplicable("Season openers are excluded.");
      if (!finite(row.restDays) || !finite(row.opponentRestDays)) return status(QUALIFICATION_STATUS.unavailable, "Rest-day comparison is unavailable.");
      return row.restDays <= 6 && row.restDifferential <= -1
        ? confirmed(`${row.restDays} rest days, ${Math.abs(row.restDifferential)} fewer than the opponent.`)
        : notApplicable("The team does not have short rest plus a rest disadvantage.");
    }
    case "rest-advantage": {
      if (!row.previousGame) return notApplicable("Season openers are excluded.");
      if (!finite(row.restDifferential)) return status(QUALIFICATION_STATUS.unavailable, "Rest-day comparison is unavailable.");
      return row.restDifferential >= 3
        ? confirmed(`${row.restDays} rest days, ${row.restDifferential} more than the opponent.`)
        : notApplicable("The team does not have at least three more rest days than the opponent.");
    }
    case "post-bye":
      if (!row.previousGame) return notApplicable("No previous same-season game.");
      return row.postBye
        ? confirmed(`First game after a one-week schedule gap (${row.restDays} calendar days).`)
        : notApplicable("The previous schedule gap is not the locked post-bye structure.");
    case "pre-bye": {
      if (!row.nextGame) return notApplicable("No next same-season game.");
      const days = calculateRestDays(row.game.kickoffUtc, row.nextGame.kickoffUtc);
      return row.preBye
        ? confirmed(`Final game before a one-week schedule gap (${days} calendar days until the next game).`)
        : notApplicable("The next schedule gap is not the locked pre-bye structure.");
    }
    case "consecutive-road": {
      if (row.roadSequence < 2) return notApplicable("The team is not in a second-or-later consecutive true road game.");
      const variant = row.roadSequence === 2 ? "road-game-2" : "road-game-3-plus";
      return confirmed(`Playing true road game ${row.roadSequence} in a row.`, [variant]);
    }
    case "west-to-east-early":
      if (!row.game.kickoffUtc) return status(QUALIFICATION_STATUS.unavailable, "Kickoff time is unavailable.");
      return isWestToEastEarly(row)
        ? confirmed("Pacific-origin team at a non-neutral Eastern-time venue for a 1:00 PM ET kickoff.")
        : notApplicable("The travel origin, venue, or kickoff time does not match the locked qualifier.");
    case "divisional-underdog": {
      if (!row.divisional) return notApplicable("This is not a divisional matchup.");
      if (!finite(spread)) return marketUnavailable();
      if (spread <= 0) return notApplicable("The team is not a current underdog.");
      const variant = row.venue === "home" ? "divisional-dog-home" : row.venue === "away" ? "divisional-dog-road" : null;
      return confirmed("Divisional matchup with the team listed as the current underdog.", variant ? [variant] : []);
    }
    case "after-blowout-win": {
      const gate = previousGate();
      if (gate) return gate;
      const bands = blowoutThresholds(previous.pointMargin);
      if (!bands.win14) return notApplicable("The previous win margin was below 14 points.");
      const variants = ["after-win-14-plus", bands.win17 && "after-win-17-plus", bands.win20 && "after-win-20-plus"].filter(Boolean);
      return confirmed(`Won the previous game by ${previous.pointMargin} points.`, variants);
    }
    case "after-blowout-loss": {
      const gate = previousGate();
      if (gate) return gate;
      const bands = blowoutThresholds(previous.pointMargin);
      if (!bands.loss14) return notApplicable("The previous loss margin was below 14 points.");
      const variants = ["after-loss-14-plus", bands.loss17 && "after-loss-17-plus", bands.loss20 && "after-loss-20-plus"].filter(Boolean);
      return confirmed(`Lost the previous game by ${Math.abs(previous.pointMargin)} points.`, variants);
    }
    case "home-underdogs": {
      if (row.venue !== "home") return notApplicable("The team is not at a non-neutral home venue.");
      if (!finite(spread)) return marketUnavailable();
      if (!homeUnderdog(row)) return notApplicable("The home team is not a current underdog.");
      const band = underdogSpreadBand(spread)?.replace("underdog-", "dog-");
      return confirmed(`Home team listed at ${spread > 0 ? "+" : ""}${spread}.`, band ? [band] : []);
    }
    case "road-favorites": {
      if (row.venue !== "away") return notApplicable("The team is not at a true road venue.");
      if (!finite(spread)) return marketUnavailable();
      if (!roadFavorite(row)) return notApplicable("The road team is not the current favorite.");
      const band = favoriteSpreadBand(spread);
      return confirmed(`Road team listed at ${spread}.`, band ? [band] : []);
    }
    case "double-digit-favorites":
    case "double-digit-underdogs": {
      if (!finite(spread)) return marketUnavailable();
      const role = doubleDigitClassification(spread);
      const wanted = trendId === "double-digit-favorites" ? "favorite" : "underdog";
      if (role !== wanted) return notApplicable(`The team is not a double-digit ${wanted}.`);
      const margin = doubleDigitMarginBand(spread);
      return confirmed(`Current market spread is ${spread > 0 ? "+" : ""}${spread}.`, [locationVariant(row), margin && `margin-${margin}`].filter(Boolean));
    }
    case "after-outright-upset-win":
    case "after-outright-upset-loss": {
      const gate = previousGate();
      if (gate) return gate;
      if (!finite(row.previousTeamSpread)) return marketUnavailable("Awaiting the previous game's market spread.");
      const kind = priorUpsetClassification(previous);
      const wanted = trendId === "after-outright-upset-win" ? "upset-win" : "upset-loss";
      if (kind !== wanted) return notApplicable(`The previous game was not an outright ${wanted === "upset-win" ? "underdog win" : "favorite loss"}.`);
      const band = wanted === "upset-win"
        ? underdogSpreadBand(row.previousTeamSpread)?.replace("underdog-", "dog-")
        : favoriteSpreadBand(row.previousTeamSpread);
      const variant = band ? `prior-${band}` : null;
      return confirmed(wanted === "upset-win" ? "Won the previous game outright as an underdog." : "Lost the previous game outright as a favorite.", variant ? [variant] : []);
    }
    case "coming-off-overtime": {
      const gate = previousGate();
      if (gate) return gate;
      if (previous.overtime == null) return status(QUALIFICATION_STATUS.unavailable, "The current public result artifact does not provide an overtime indicator.");
      if (!isOvertimeValue(previous.overtime)) return notApplicable("The previous game did not go to overtime.");
      const outcome = previous.pointMargin > 0 ? "won-previous-ot" : previous.pointMargin < 0 ? "lost-previous-ot" : null;
      return confirmed("The immediately previous game went to overtime.", [outcome, locationVariant(row)].filter(Boolean));
    }
    case "coming-off-monday-night-football":
    case "coming-off-sunday-night-football": {
      if (!row.previousGame) return notApplicable("No previous same-season game.");
      if (!row.previousGame.kickoffUtc) return status(QUALIFICATION_STATUS.unavailable, "Previous kickoff time is unavailable.");
      const monday = trendId === "coming-off-monday-night-football";
      const qualifies = monday ? isMondayNight(row.previousGame.kickoffUtc) : isSundayNight(row.previousGame.kickoffUtc);
      if (!qualifies) return notApplicable(`The previous game was not ${monday ? "Monday" : "Sunday"} night by the locked ET definition.`);
      const variants = commonCurrentVariants(row);
      if (finite(row.restDays) && finite(row.opponentRestDays) && row.opponentRestDays > row.restDays) variants.push("opponent-more-rest");
      return confirmed(`Immediately follows a ${monday ? "Monday" : "Sunday"} night kickoff.`, variants);
    }
    case "second-divisional-meeting": {
      if (!row.divisional || row.divisionalMeetingNumber !== 2) return notApplicable("This is not the second same-season divisional meeting.");
      const variants = commonCurrentVariants(row);
      if (row.firstMeetingResult?.pointMargin > 0) variants.push("current-team-won-first");
      if (spread > 0 && row.firstMeetingResult?.pointMargin < 0) variants.push("current-underdog-lost-first");
      return confirmed("Second same-season regular-season meeting between these divisional opponents.", variants);
    }
    case "after-scoring-40-plus":
    case "after-allowing-40-plus": {
      const gate = previousGate();
      if (gate) return gate;
      const scored = trendId === "after-scoring-40-plus";
      const points = scored ? previous.teamScore : previous.opponentScore;
      const band = previousScoreBand(points);
      if (!band) return notApplicable(`The team did not ${scored ? "score" : "allow"} at least 40 in its previous game.`);
      const resultVariant = scored && previous.pointMargin > 0 ? "won-previous" : !scored && previous.pointMargin < 0 ? "lost-previous" : null;
      const scoreVariant = `${scored ? "scored" : "allowed"}-${band}`;
      return confirmed(`${scored ? "Scored" : "Allowed"} ${points} points in the previous game.`, [resultVariant, ...commonCurrentVariants(row), scoreVariant].filter(Boolean));
    }
    case "week1-home-favorites": {
      const gate = week1Gate();
      if (gate) return gate;
      if (row.venue !== "home") return notApplicable("The team is not at a non-neutral home venue.");
      if (!finite(spread)) return marketUnavailable();
      if (marketRole(spread) !== "favorite") return notApplicable("The home team is not the current favorite.");
      return confirmed(`Week 1 home favorite listed at ${spread}.`, [favoriteSpreadBand(spread)].filter(Boolean));
    }
    case "week1-home-underdogs": {
      const gate = week1Gate();
      if (gate) return gate;
      if (row.venue !== "home") return notApplicable("The team is not at a non-neutral home venue.");
      if (!finite(spread)) return marketUnavailable();
      if (marketRole(spread) !== "underdog") return notApplicable("The home team is not the current underdog.");
      const band = underdogSpreadBand(spread)?.replace("underdog-", "dog-");
      return confirmed(`Week 1 home underdog listed at +${spread}.`, band ? [band] : []);
    }
    case "week1-road-favorites": {
      const gate = week1Gate();
      if (gate) return gate;
      if (row.venue !== "away") return notApplicable("The team is not at a true road venue.");
      if (!finite(spread)) return marketUnavailable();
      if (marketRole(spread) !== "favorite") return notApplicable("The road team is not the current favorite.");
      return confirmed(`Week 1 road favorite listed at ${spread}.`, [favoriteSpreadBand(spread)].filter(Boolean));
    }
    case "week1-road-underdogs": {
      const gate = week1Gate();
      if (gate) return gate;
      if (row.venue !== "away") return notApplicable("The team is not at a true road venue.");
      if (!finite(spread)) return marketUnavailable();
      if (marketRole(spread) !== "underdog") return notApplicable("The road team is not the current underdog.");
      const band = underdogSpreadBand(spread)?.replace("underdog-", "dog-");
      return confirmed(`Week 1 road underdog listed at +${spread}.`, band ? [band] : []);
    }
    case "week1-divisional-home-favorites": {
      const gate = week1Gate();
      if (gate) return gate;
      if (!row.divisional || row.venue !== "home") return notApplicable("This is not a Week 1 divisional home matchup.");
      if (!finite(spread)) return marketUnavailable();
      return marketRole(spread) === "favorite"
        ? confirmed("Week 1 divisional home favorite.")
        : notApplicable("The home team is not the current favorite.");
    }
    case "week1-divisional-home-underdogs": {
      const gate = week1Gate();
      if (gate) return gate;
      if (!row.divisional || row.venue !== "home") return notApplicable("This is not a Week 1 divisional home matchup.");
      if (!finite(spread)) return marketUnavailable();
      return marketRole(spread) === "underdog"
        ? confirmed("Week 1 divisional home underdog.")
        : notApplicable("The home team is not the current underdog.");
    }
    case "week1-favorites-by-spread-band": {
      const gate = week1Gate();
      if (gate) return gate;
      if (!finite(spread)) return marketUnavailable();
      if (marketRole(spread) !== "favorite") return notApplicable("The team is not the current favorite.");
      return confirmed(`Week 1 favorite listed at ${spread}.`, [locationVariant(row), favoriteSpreadBand(spread)].filter(Boolean));
    }
    case "week1-underdogs-by-spread-band": {
      const gate = week1Gate();
      if (gate) return gate;
      if (!finite(spread)) return marketUnavailable();
      if (marketRole(spread) !== "underdog") return notApplicable("The team is not the current underdog.");
      const band = underdogSpreadBand(spread)?.replace("underdog-", "dog-");
      return confirmed(`Week 1 underdog listed at +${spread}.`, [locationVariant(row), band].filter(Boolean));
    }
    case "week1-double-digit-favorites":
    case "week1-double-digit-underdogs": {
      const gate = week1Gate();
      if (gate) return gate;
      if (!finite(spread)) return marketUnavailable();
      const role = doubleDigitClassification(spread);
      const wanted = trendId === "week1-double-digit-favorites" ? "favorite" : "underdog";
      if (role !== wanted) return notApplicable(`The team is not a Week 1 double-digit ${wanted}.`);
      const margin = doubleDigitMarginBand(spread);
      return confirmed(`Week 1 market spread is ${spread > 0 ? "+" : ""}${spread}.`, [locationVariant(row), margin && `margin-${margin}`].filter(Boolean));
    }
    case "week1-prior-season-playoff-team":
    case "week1-prior-season-non-playoff-team": {
      const gate = week1Gate();
      if (gate) return gate;
      if (row.teamPriorSeasonPlayoffStatus == null) return status(QUALIFICATION_STATUS.unavailable, "Prior-season playoff participation is unavailable.");
      const wanted = trendId === "week1-prior-season-playoff-team" ? "playoff" : "non-playoff";
      if (row.teamPriorSeasonPlayoffStatus !== wanted) return notApplicable(`The team is not a prior-season ${wanted} team.`);
      return confirmed(`The team was a prior-season ${wanted} team.`, commonCurrentVariants(row));
    }
    case "week1-prior-season-winning-vs-losing": {
      const gate = week1Gate();
      if (gate) return gate;
      if (row.teamPriorSeasonRecordRole == null) return status(QUALIFICATION_STATUS.unavailable, "Prior-season record is unavailable or exactly .500.");
      return confirmed(`The team's prior-season record was a ${row.teamPriorSeasonRecordRole} record.`, [`${row.teamPriorSeasonRecordRole}-team`]);
    }
    case "week2-after-0-1-start":
    case "week2-after-1-0-start": {
      const gate = week2Gate();
      if (gate) return gate;
      const wanted = trendId === "week2-after-0-1-start" ? "L" : "W";
      const previousSu = previous.pointMargin > 0 ? "W" : previous.pointMargin < 0 ? "L" : "T";
      if (previousSu !== wanted) return notApplicable(`The team did not start ${wanted === "L" ? "0-1" : "1-0"}.`);
      return confirmed(`The team started ${wanted === "L" ? "0-1" : "1-0"}.`, commonCurrentVariants(row));
    }
    case "week2-after-week1-ats-loss":
    case "week2-after-week1-ats-win": {
      const gate = week2Gate();
      if (gate) return gate;
      if (!finite(previous.teamSpread)) return marketUnavailable("Awaiting the Week 1 market spread.");
      const wanted = trendId === "week2-after-week1-ats-loss" ? "L" : "W";
      const previousAts = gradeTeamAts(previous.pointMargin, previous.teamSpread);
      if (previousAts !== wanted) return notApplicable(`The Week 1 ATS grade was not a ${wanted === "L" ? "loss" : "win"}.`);
      return confirmed(`Week 1 ATS grade was a ${wanted === "L" ? "loss" : "win"}.`, commonCurrentVariants(row));
    }
    case "week2-after-week1-favorite-failed-to-cover": {
      const gate = week2Gate();
      if (gate) return gate;
      if (!finite(previous.teamSpread)) return marketUnavailable("Awaiting the Week 1 market spread.");
      const previousAts = gradeTeamAts(previous.pointMargin, previous.teamSpread);
      if (!isWeek1FavoriteAtsLoss({ previousTeamSpread: previous.teamSpread, previousAtsResult: previousAts })) {
        return notApplicable("The team was not a Week 1 favorite that failed to cover.");
      }
      return confirmed("The team was a Week 1 favorite that failed to cover.", commonCurrentVariants(row));
    }
    case "week2-home-favorite-after-week1-ats-loss": {
      const gate = week2Gate();
      if (gate) return gate;
      if (row.venue !== "home") return notApplicable("The team is not at a non-neutral home venue.");
      if (!finite(previous.teamSpread)) return marketUnavailable("Awaiting the Week 1 market spread.");
      const previousAts = gradeTeamAts(previous.pointMargin, previous.teamSpread);
      if (!isWeek1FavoriteAtsLoss({ previousTeamSpread: previous.teamSpread, previousAtsResult: previousAts })) {
        return notApplicable("The team was not a Week 1 favorite that failed to cover.");
      }
      return confirmed("Home team after an ATS loss as a Week 1 favorite.", [marketVariant(row)].filter(Boolean));
    }
    case "week2-after-week1-favorite-lost-outright": {
      const gate = week2Gate();
      if (gate) return gate;
      if (!finite(previous.teamSpread)) return marketUnavailable("Awaiting the Week 1 market spread.");
      if (!isWeek1FavoriteLostOutright({ previousTeamSpread: previous.teamSpread, previousPointMargin: previous.pointMargin })) {
        return notApplicable("The team was not a Week 1 favorite that lost outright.");
      }
      return confirmed("The team was a Week 1 favorite that lost outright.", commonCurrentVariants(row));
    }
    case "week2-after-week1-underdog-won-outright": {
      const gate = week2Gate();
      if (gate) return gate;
      if (!finite(previous.teamSpread)) return marketUnavailable("Awaiting the Week 1 market spread.");
      if (!isWeek1UnderdogWonOutright({ previousTeamSpread: previous.teamSpread, previousPointMargin: previous.pointMargin })) {
        return notApplicable("The team was not a Week 1 underdog that won outright.");
      }
      return confirmed("The team was a Week 1 underdog that won outright.", commonCurrentVariants(row));
    }
    case "week2-after-week1-win-10-plus":
    case "week2-after-week1-win-14-plus": {
      const gate = week2Gate();
      if (gate) return gate;
      const threshold = trendId === "week2-after-week1-win-14-plus" ? 14 : 10;
      if (!(previous.pointMargin > 0) || !marginAtLeast(previous.pointMargin, threshold)) {
        return notApplicable(`The team did not win Week 1 by at least ${threshold} points.`);
      }
      return confirmed(`Won Week 1 by ${previous.pointMargin} points.`, commonCurrentVariants(row));
    }
    case "week2-after-week1-loss-10-plus":
    case "week2-after-week1-loss-14-plus": {
      const gate = week2Gate();
      if (gate) return gate;
      const threshold = trendId === "week2-after-week1-loss-14-plus" ? 14 : 10;
      if (!(previous.pointMargin < 0) || !marginAtLeast(previous.pointMargin, threshold)) {
        return notApplicable(`The team did not lose Week 1 by at least ${threshold} points.`);
      }
      return confirmed(`Lost Week 1 by ${Math.abs(previous.pointMargin)} points.`, commonCurrentVariants(row));
    }
    case "week2-0-1-favorite":
    case "week2-0-1-underdog":
    case "week2-1-0-favorite":
    case "week2-1-0-underdog": {
      const gate = week2Gate();
      if (gate) return gate;
      const wantedRecord = trendId.startsWith("week2-0-1") ? "L" : "W";
      const previousSu = previous.pointMargin > 0 ? "W" : previous.pointMargin < 0 ? "L" : "T";
      if (previousSu !== wantedRecord) return notApplicable(`The team did not start ${wantedRecord === "L" ? "0-1" : "1-0"}.`);
      if (!finite(spread)) return marketUnavailable();
      const wantedRole = trendId.endsWith("favorite") ? "favorite" : "underdog";
      if (marketRole(spread) !== wantedRole) return notApplicable(`The team is not the current ${wantedRole}.`);
      return confirmed(`${wantedRecord === "L" ? "0-1" : "1-0"} team and current ${wantedRole}.`, [locationVariant(row)].filter(Boolean));
    }
    case "week2-0-1-vs-1-0-opponent":
    case "week2-1-0-vs-0-1-opponent": {
      const gate = week2Gate();
      if (gate) return gate;
      if (!opponentWeek1) return status(QUALIFICATION_STATUS.awaitingPriorResult, "Awaiting the opponent's Week 1 result.");
      const teamWanted = trendId === "week2-0-1-vs-1-0-opponent" ? "L" : "W";
      const opponentWanted = teamWanted === "L" ? "W" : "L";
      const previousSu = previous.pointMargin > 0 ? "W" : previous.pointMargin < 0 ? "L" : "T";
      const opponentSu = opponentWeek1.pointMargin > 0 ? "W" : opponentWeek1.pointMargin < 0 ? "L" : "T";
      if (previousSu !== teamWanted || opponentSu !== opponentWanted) {
        return notApplicable(`The team/opponent Week 1 records do not match ${teamWanted === "L" ? "0-1 vs 1-0" : "1-0 vs 0-1"}.`);
      }
      return confirmed(`${teamWanted === "L" ? "0-1 team facing a 1-0 opponent" : "1-0 team facing an 0-1 opponent"}.`, [locationVariant(row)].filter(Boolean));
    }
    default:
      return status(QUALIFICATION_STATUS.unavailable, "Unknown trend definition.");
  }
}

function buildMeetingNumbers(games, divisionByTeam) {
  const byPair = new Map();
  for (const game of games) {
    if (!isDivisionalMatchup(divisionByTeam.get(game.homeAbbr), divisionByTeam.get(game.awayAbbr))) continue;
    const key = [game.homeAbbr, game.awayAbbr].sort().join("-");
    const list = byPair.get(key) ?? [];
    list.push(game);
    byPair.set(key, list);
  }
  const numberByGame = new Map();
  for (const list of byPair.values()) {
    list.sort((a, b) => (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? "") || a.gameId.localeCompare(b.gameId));
    list.forEach((game, index) => numberByGame.set(game.gameId, index + 1));
  }
  return numberByGame;
}

function priorSeasonRecordByTeam(priorSeasonResults) {
  const records = new Map();
  const bump = (team, key) => records.set(team, { ...(records.get(team) ?? { wins: 0, losses: 0, ties: 0 }), [key]: (records.get(team)?.[key] ?? 0) + 1 });
  for (const result of priorSeasonResults) {
    if (result.seasonType !== "REG" || !result.final || !finite(result.homeScore) || !finite(result.awayScore)) continue;
    if (result.homeScore > result.awayScore) { bump(result.homeAbbr, "wins"); bump(result.awayAbbr, "losses"); }
    else if (result.homeScore < result.awayScore) { bump(result.awayAbbr, "wins"); bump(result.homeAbbr, "losses"); }
    else { bump(result.homeAbbr, "ties"); bump(result.awayAbbr, "ties"); }
  }
  return records;
}

/** Build canonical team-game contexts before evaluating any trend. */
export function buildCurrentTeamContexts({ season, games, results, teams, priorSeasonGames = [], priorSeasonResults = [], currentMarket = {} }) {
  const targetGames = games
    .filter((game) => game.season === season && game.seasonType === "REG")
    .map((game) => ({ ...game, kickoffUtc: game.kickoffUtc ?? game.dateUtc ?? null }))
    .sort((a, b) => (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? "") || a.gameId.localeCompare(b.gameId));
  const divisionByTeam = new Map(teams.map((team) => [team.abbr, team.division]));
  const resultByGame = new Map(results.map((result) => [result.gameId, result]));
  const priorPlayoffTeams = new Set(
    priorSeasonGames.filter((game) => game.seasonType !== "REG").flatMap((game) => [game.homeAbbr, game.awayAbbr])
  );
  const priorSeasonKnown = priorSeasonGames.length > 0;
  const priorRecords = priorSeasonRecordByTeam(priorSeasonResults);
  const meetingNumberByGame = buildMeetingNumbers(targetGames, divisionByTeam);
  const contexts = [];

  for (const team of teams.map((value) => value.abbr)) {
    const log = targetGames.filter((game) => game.homeAbbr === team || game.awayAbbr === team);
    for (let index = 0; index < log.length; index += 1) {
      const game = log[index];
      const side = sideForGame(game, team);
      if (!side) continue;
      const previousGame = index > 0 ? log[index - 1] : null;
      const nextGame = index + 1 < log.length ? log[index + 1] : null;
      const previousSide = previousGame ? sideForGame(previousGame, team) : null;
      const division = divisionByTeam.get(team);
      const opponentDivision = divisionByTeam.get(side.opponent);
      const previousDivisional = previousSide ? isDivisionalMatchup(division, divisionByTeam.get(previousSide.opponent)) : false;
      const nextSide = nextGame ? sideForGame(nextGame, team) : null;
      const nextDivisional = nextSide ? isDivisionalMatchup(division, divisionByTeam.get(nextSide.opponent)) : false;
      const firstMeeting = meetingNumberByGame.get(game.gameId) === 2
        ? log.find((candidate) => candidate.gameId !== game.gameId && [candidate.homeAbbr, candidate.awayAbbr].includes(side.opponent))
        : null;
      contexts.push({
        schemaVersion: "nfl-situational-trend-current-team-game-v1",
        rowId: `${game.gameId}:${team}`,
        season,
        week: game.week,
        team,
        opponent: side.opponent,
        venue: side.venue,
        kickoffUtc: game.kickoffUtc,
        game,
        previousGame,
        nextGame,
        teamPriorSeasonPlayoffStatus: priorSeasonPlayoffStatus(priorSeasonKnown ? priorPlayoffTeams.has(team) : null),
        teamPriorSeasonRecordRole: priorSeasonRecordRole(priorRecords.get(team) ?? null),
        previousResult: previousGame ? resultFor(resultByGame.get(previousGame.gameId), team) : null,
        firstMeetingResult: firstMeeting ? resultFor(resultByGame.get(firstMeeting.gameId), team) : null,
        teamSpread: spreadFor(currentMarket[game.gameId], team),
        previousTeamSpread: previousGame ? spreadFor(currentMarket[previousGame.gameId], team) : null,
        divisional: isDivisionalMatchup(division, opponentDivision),
        restDays: previousGame ? calculateRestDays(previousGame.kickoffUtc, game.kickoffUtc) : null,
        previousPrimeTime: previousGame ? isPrimeTimeKickoff(previousGame.kickoffUtc) : false,
        currentMajorOpponent: isMajorOpponent({ divisional: isDivisionalMatchup(division, opponentDivision), opponent: side.opponent, priorSeasonPlayoffTeams: priorPlayoffTeams }),
        previousMajorOpponent: previousSide ? isMajorOpponent({ divisional: previousDivisional, opponent: previousSide.opponent, priorSeasonPlayoffTeams: priorPlayoffTeams }) : false,
        nextMajorOpponent: nextSide ? isMajorOpponent({ divisional: nextDivisional, opponent: nextSide.opponent, priorSeasonPlayoffTeams: priorPlayoffTeams }) : false,
        postBye: previousGame ? isByeGap(previousGame, game) : false,
        preBye: nextGame ? isByeGap(game, nextGame) : false,
        roadSequence: roadSequenceAt(log.map((item) => ({ venue: sideForGame(item, team)?.venue })), index),
        divisionalMeetingNumber: meetingNumberByGame.get(game.gameId) ?? null,
      });
    }
  }

  const byRowId = new Map(contexts.map((row) => [row.rowId, row]));
  for (const row of contexts) {
    const opponent = byRowId.get(`${row.game.gameId}:${row.opponent}`);
    row.opponentRestDays = opponent?.restDays ?? null;
    row.restDifferential = finite(row.restDays) && finite(row.opponentRestDays) ? row.restDays - row.opponentRestDays : null;
    row.opponentPreviousResult = opponent?.previousResult ?? null;
    row.opponentPreviousTeamSpread = opponent?.previousTeamSpread ?? null;
  }
  return contexts.sort((a, b) => (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? "") || a.game.gameId.localeCompare(b.game.gameId) || a.team.localeCompare(b.team));
}

/** Evaluate all 24 locked broad trends for every current-season team-game. */
export function buildCurrentTrendEvaluations(inputs) {
  return buildCurrentTeamContexts(inputs).flatMap((row) => CURRENT_TREND_IDS.map((trendId) => ({
    gameId: row.game.gameId,
    team: row.team,
    trendId,
    ...evaluateCurrentTrend(row, trendId),
  })));
}

export const MATCHUP_DIRECTIONAL_STATUS = Object.freeze({
  matchupPending: "MATCHUP_PENDING",
});

const PENDING_QUALIFICATION_STATUSES = new Set([
  QUALIFICATION_STATUS.awaitingMarket,
  QUALIFICATION_STATUS.awaitingPriorResult,
  QUALIFICATION_STATUS.unavailable,
]);

/**
 * Trend ids whose predefined variants are mutually exclusive team roles
 * (e.g. prior-season winning vs. losing) rather than incidental context
 * (venue, market side). Only these trends can distinguish two same-game
 * CONFIRMED rows by variant instead of suppressing the shared trendId.
 */
const OPPOSING_VARIANT_TREND_IDS = new Set(["week1-prior-season-winning-vs-losing"]);

function isSameDirectionalClaim(trendId, rowA, rowB) {
  if (!OPPOSING_VARIANT_TREND_IDS.has(trendId)) return true;
  const [variantA] = rowA.variantIds;
  const [variantB] = rowB.variantIds;
  if (!variantA || !variantB) return true;
  return variantA === variantB;
}

function matchupPendingRow(confirmedRow, blockedRow) {
  return {
    ...confirmedRow,
    status: MATCHUP_DIRECTIONAL_STATUS.matchupPending,
    reason: `${confirmedRow.team.toUpperCase()} individually qualifies, but ${blockedRow.team.toUpperCase()}'s status for this trend is still ${blockedRow.status} — a directional matchup trend is not yet confirmed.`,
  };
}

/**
 * Reduce the raw per-team evaluations for one game into matchup-ready
 * qualifiers/pending lists per the live-matchup directionality rule:
 * a trend is only surfaced when exactly one team confirms it. Both-confirmed
 * angles are suppressed (unless the trend defines mutually exclusive
 * variants); a confirmed team paired with a still-pending opponent yields a
 * pending state rather than an inferred directional claim.
 */
export function resolveMatchupTrendPresentation(gameRows) {
  const byTrend = new Map();
  for (const row of gameRows) {
    const list = byTrend.get(row.trendId) ?? [];
    list.push(row);
    byTrend.set(row.trendId, list);
  }

  const qualifiers = [];
  const pending = [];

  for (const teamRows of byTrend.values()) {
    const confirmedRows = teamRows.filter((row) => row.status === QUALIFICATION_STATUS.confirmed);
    const otherRows = teamRows.filter((row) => row.status !== QUALIFICATION_STATUS.confirmed);

    if (confirmedRows.length === 2) {
      const [rowA, rowB] = confirmedRows;
      if (!isSameDirectionalClaim(rowA.trendId, rowA, rowB)) qualifiers.push(rowA, rowB);
      continue;
    }

    if (confirmedRows.length === 1) {
      const [confirmedRow] = confirmedRows;
      const blockedOpponent = otherRows.find((row) => PENDING_QUALIFICATION_STATUSES.has(row.status));
      if (blockedOpponent) {
        pending.push(matchupPendingRow(confirmedRow, blockedOpponent));
      } else {
        qualifiers.push(confirmedRow);
      }
      for (const row of otherRows) {
        if (PENDING_QUALIFICATION_STATUSES.has(row.status)) pending.push(row);
      }
      continue;
    }

    for (const row of teamRows) {
      if (PENDING_QUALIFICATION_STATUSES.has(row.status)) pending.push(row);
    }
  }

  return { qualifiers, pending };
}
