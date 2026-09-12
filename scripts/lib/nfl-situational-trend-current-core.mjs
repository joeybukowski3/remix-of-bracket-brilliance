/**
 * Deterministic current-season qualification for the locked NFL situational
 * trend definitions. This module reuses Phase 1 / Phase 2B primitives and
 * never calculates historical performance or changes a prediction model.
 */

import {
  TREND_DEFINITIONS,
  blowoutThresholds,
  calculateRestDays,
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

/** Build canonical team-game contexts before evaluating any trend. */
export function buildCurrentTeamContexts({ season, games, results, teams, priorSeasonGames = [], currentMarket = {} }) {
  const targetGames = games
    .filter((game) => game.season === season && game.seasonType === "REG")
    .map((game) => ({ ...game, kickoffUtc: game.kickoffUtc ?? game.dateUtc ?? null }))
    .sort((a, b) => (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? "") || a.gameId.localeCompare(b.gameId));
  const divisionByTeam = new Map(teams.map((team) => [team.abbr, team.division]));
  const resultByGame = new Map(results.map((result) => [result.gameId, result]));
  const priorPlayoffTeams = new Set(
    priorSeasonGames.filter((game) => game.seasonType !== "REG").flatMap((game) => [game.homeAbbr, game.awayAbbr])
  );
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
        team,
        opponent: side.opponent,
        venue: side.venue,
        kickoffUtc: game.kickoffUtc,
        game,
        previousGame,
        nextGame,
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
