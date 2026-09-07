/**
 * The hypothesis library for the market-mispricing search.
 *
 * Two kinds of candidate:
 *
 *   DIFFERENTIALS  continuous, home-minus-away. Tested by partial correlation
 *                  with market error after projecting out the spread, so a
 *                  feature that merely predicts football scores nothing here.
 *
 *   CONDITIONS     signed segments returning +1 (back home), -1 (back away) or
 *                  0 (does not apply). Scored by mean market error in the
 *                  backed direction, which makes "back" and "fade" hypotheses
 *                  directly comparable.
 *
 * Every hypothesis is stated as a football mechanism, not a schedule pattern.
 * Standardisation constants come from the discovery seasons only and are
 * applied unchanged to the holdout, so no threshold is ever set on holdout data.
 */

/** Great-circle km between two stadiums, for travel and time-zone proxies. */
export function haversineKm(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const diff = (home, away, field) => {
  if (home[field] === null || away[field] === null) return null;
  return home[field] - away[field];
};
/** Home's offence against away's defence, minus the mirror image. */
const mismatch = (home, away, offField, defField) => {
  const values = [home[offField], away[defField], away[offField], home[defField]];
  if (values.some((value) => value === null)) return null;
  return (home[offField] - away[defField]) - (away[offField] - home[defField]);
};

/**
 * Continuous hypotheses. Each returns a home-minus-away quantity, or null when
 * either side lacks the games to define it.
 */
export function buildDifferentials(game, z) {
  const { home, away } = game.state;
  const zd = (field) => {
    const value = diff(home, away, field);
    return value === null ? null : value / (z.sd(field) || 1);
  };
  const zf = (side, field) => (side[field] === null ? null : (side[field] - z.mean(field)) / (z.sd(field) || 1));
  const sub = (a, b) => (a === null || b === null ? null : a - b);

  return {
    // --- A. matchup mismatches
    passMismatch: mismatch(home, away, "offPassEpa", "defPassEpa"),
    rushMismatch: mismatch(home, away, "offRushEpa", "defRushEpa"),
    passSuccMismatch: mismatch(home, away, "offPassSucc", "defPassSucc"),
    rushSuccMismatch: mismatch(home, away, "offRushSucc", "defRushSucc"),
    explosiveMismatch: mismatch(home, away, "explosiveRate", "explosiveAllowed"),
    netEpaDiff: zd("netEpa"),
    successNetDiff: sub(sub(zf(home, "offSucc"), zf(home, "defSucc")), sub(zf(away, "offSucc"), zf(away, "defSucc"))),
    styleAsymmetry: home.passRate === null || away.passRate === null ? null : Math.abs(home.passRate - away.passRate),

    // --- B. headline results vs underlying efficiency
    recordMinusEpa: sub(sub(zf(home, "winPct"), zf(home, "netEpa")), sub(zf(away, "winPct"), zf(away, "netEpa"))),
    pointDiffMinusSucc: sub(sub(zf(home, "pointDiff"), zf(home, "offSucc")), sub(zf(away, "pointDiff"), zf(away, "offSucc"))),
    pointsMinusEpa: sub(sub(zf(home, "pointsFor"), zf(home, "offEpa")), sub(zf(away, "pointsFor"), zf(away, "offEpa"))),
    last5MinusSeasonEpa: sub(sub(zf(home, "last5NetEpa"), zf(home, "netEpa")), sub(zf(away, "last5NetEpa"), zf(away, "netEpa"))),
    priorMinusCurrentEpa: sub(sub(zf(home, "priorNetEpa"), zf(home, "netEpa")), sub(zf(away, "priorNetEpa"), zf(away, "netEpa"))),

    // --- C. regression candidates
    turnoverMarginDiff: zd("turnoverMargin"),
    closeWinPctDiff: zd("closeWinPct"),
    rzTdRateDiff: zd("rzTdRate"),
    rzTdAllowedDiff: zd("rzTdAllowed") === null ? null : -zd("rzTdAllowed"),
    thirdDownConvDiff: zd("thirdDownConv"),
    thirdDownAllowedDiff: zd("thirdDownAllowed") === null ? null : -zd("thirdDownAllowed"),
    returnTdMarginDiff: zd("returnTdMargin"),
    explosiveRateDiff: zd("explosiveRate"),

    // --- D. early-season prior disagreement
    y1MinusY2: sub(sub(zf(home, "y1NetEpa"), zf(home, "y2NetEpa")), sub(zf(away, "y1NetEpa"), zf(away, "y2NetEpa"))),
    y1Last8MinusFull: sub(sub(zf(home, "y1Last8NetEpa"), zf(home, "y1NetEpa")), sub(zf(away, "y1Last8NetEpa"), zf(away, "y1NetEpa"))),
    priorNetEpaDiff: zd("priorNetEpa"),
    priorPassDefDiff: home.priorPassDef === null || away.priorPassDef === null ? null : away.priorPassDef - home.priorPassDef,
    y1Last8PassDefDiff: home.y1Last8PassDef === null || away.y1Last8PassDef === null ? null : away.y1Last8PassDef - home.y1Last8PassDef,

    // --- E. situational
    restDiff: game.restDiff,
    travelKmAway: game.travelKmAway,
    longitudeSwingAway: game.longitudeSwingAway,
    homeSplitDiff: zd("homeSplit"),

    // --- F. market structure
    absSpread: Math.abs(game.spread),
    jkbMinusMarket: game.jkbFair === null ? null : game.jkbFair - game.spread,
  };
}

const HIGH = 0.75;
const LOW = -0.75;

/**
 * Signed segment hypotheses.
 *
 * Each returns +1 to back the home team, -1 to back the away team, or 0 when
 * the condition does not fire. A team-level condition fires only when exactly
 * one side qualifies, so "both teams are lucky" is not silently treated as an
 * edge for the home team.
 */
export function buildConditions(game, z) {
  const { home, away } = game.state;
  const zf = (side, field) => (side[field] === null ? null : (side[field] - z.mean(field)) / (z.sd(field) || 1));
  /** Fires for whichever single side satisfies `test`; 0 if neither or both do. */
  const exclusive = (test) => {
    const h = test(home, "home");
    const a = test(away, "away");
    if (h === null || a === null) return 0;
    if (h && !a) return 1;
    if (a && !h) return -1;
    return 0;
  };
  const both = (field) => home[field] !== null && away[field] !== null;
  const dog = game.spread === 0 ? 0 : (game.spread > 0 ? -1 : 1); // side the market has as underdog
  const favourite = -dog;

  const goodEpaBadRecord = (side) => {
    const epa = zf(side, "netEpa");
    const record = zf(side, "winPct");
    return epa === null || record === null ? null : epa >= 0.5 && record <= -0.5;
  };
  const badEpaGoodRecord = (side) => {
    const epa = zf(side, "netEpa");
    const record = zf(side, "winPct");
    return epa === null || record === null ? null : epa <= -0.5 && record >= 0.5;
  };

  return {
    // --- B. Vegas trusting results over efficiency
    backGoodEpaBadRecord: exclusive(goodEpaBadRecord),
    fadeBadEpaGoodRecord: -exclusive(badEpaGoodRecord),
    fadeHotRecordColdEpa: -exclusive((side) => {
      const form = zf(side, "last5WinPct");
      const epa = zf(side, "last5NetEpa");
      return form === null || epa === null ? null : form >= HIGH && epa <= LOW;
    }),
    backColdRecordHotEpa: exclusive((side) => {
      const form = zf(side, "last5WinPct");
      const epa = zf(side, "last5NetEpa");
      return form === null || epa === null ? null : form <= LOW && epa >= HIGH;
    }),
    fadePointsAboveEpa: -exclusive((side) => {
      const points = zf(side, "pointsFor");
      const epa = zf(side, "offEpa");
      return points === null || epa === null ? null : points - epa >= 1.0;
    }),

    // --- C. regression to the mean
    backTurnoverUnlucky: exclusive((side) => {
      const value = zf(side, "turnoverMargin");
      return value === null ? null : value <= -HIGH;
    }),
    fadeTurnoverLucky: -exclusive((side) => {
      const value = zf(side, "turnoverMargin");
      return value === null ? null : value >= HIGH;
    }),
    fadeCloseGameLucky: -exclusive((side) => {
      const value = side.closeWinPct;
      return value === null ? null : value >= 0.75;
    }),
    backCloseGameUnlucky: exclusive((side) => {
      const value = side.closeWinPct;
      return value === null ? null : value <= 0.25;
    }),
    fadeRedZoneLucky: -exclusive((side) => {
      const value = zf(side, "rzTdRate");
      return value === null ? null : value >= 1.0;
    }),
    backRedZoneUnlucky: exclusive((side) => {
      const value = zf(side, "rzTdRate");
      return value === null ? null : value <= -1.0;
    }),
    fadeReturnTdLucky: -exclusive((side) => {
      const value = zf(side, "returnTdMargin");
      return value === null ? null : value >= 1.0;
    }),
    fadeThirdDownLucky: -exclusive((side) => {
      const value = zf(side, "thirdDownConv");
      return value === null ? null : value >= 1.0;
    }),

    // --- D. early-season prior disagreement (evaluated everywhere, reported by band)
    backPriorAboveCurrent: exclusive((side) => {
      const prior = zf(side, "priorNetEpa");
      const current = zf(side, "netEpa");
      return prior === null || current === null ? null : prior - current >= 1.0;
    }),
    backStrongPriorFinalEight: exclusive((side) => {
      const late = zf(side, "y1Last8NetEpa");
      const full = zf(side, "y1NetEpa");
      return late === null || full === null ? null : late - full >= 1.0;
    }),

    // --- E. situational
    backHomeVsShortWeekRoad: game.awayRest !== null && game.homeRest !== null
      && game.awayRest <= 4 && game.homeRest >= 6 ? 1 : 0,
    backTeamOffBye: game.homeRest >= 12 && game.awayRest < 12 ? 1
      : (game.awayRest >= 12 && game.homeRest < 12 ? -1 : 0),
    backHomeVsThirdStraightRoad: game.awayConsecutiveRoad >= 3 ? 1 : 0,
    backDenverAltitude: game.home === "den" && game.travelKmAway >= 800 ? 1 : 0,
    backHomeVsLongTravel: game.travelKmAway >= 2500 ? 1 : 0,
    backRematchLoser: game.rematchLoser === null ? 0 : game.rematchLoser,
    backHomeInDivision: game.divGame ? 1 : 0,

    // --- F. market structure
    backShortDog: Math.abs(game.spread) > 0 && Math.abs(game.spread) <= 3 ? dog : 0,
    backLargeDog: Math.abs(game.spread) >= 10 ? dog : 0,
    backKeyNumberDog: Math.abs(game.spread) >= 2.5 && Math.abs(game.spread) <= 3.5 ? dog : 0,
    backJkbAgainstMarket: game.jkbFair !== null && Math.abs(game.jkbFair - game.spread) >= 3
      ? Math.sign(game.jkbFair - game.spread) : 0,
    backJkbSideFlip: game.jkbFair !== null && Math.sign(game.jkbFair) !== Math.sign(game.spread)
      && Math.abs(game.jkbFair - game.spread) >= 2 ? Math.sign(game.jkbFair - game.spread) : 0,

    // --- G. small, theory-driven interactions
    backDogWithBetterEpa: (() => {
      if (!both("netEpa") || dog === 0) return 0;
      const better = home.netEpa > away.netEpa ? 1 : -1;
      return better === dog ? dog : 0;
    })(),
    backDogWithPassMismatch: (() => {
      const value = mismatch(home, away, "offPassEpa", "defPassEpa");
      if (value === null || dog === 0) return 0;
      return Math.sign(value) === dog && Math.abs(value) >= 0.1 ? dog : 0;
    })(),
    backFavouriteWithRushMismatch: (() => {
      const value = mismatch(home, away, "offRushEpa", "defRushEpa");
      if (value === null || favourite === 0) return 0;
      return Math.sign(value) === favourite && Math.abs(value) >= 0.1 ? favourite : 0;
    })(),
    backDogWithTurnoverRegression: (() => {
      if (dog === 0) return 0;
      const side = dog === 1 ? home : away;
      const value = zf(side, "turnoverMargin");
      return value !== null && value <= -HIGH ? dog : 0;
    })(),
  };
}

/**
 * Consensus count: how many independent underlying-quality signals favour one
 * side. Deliberately unweighted - the question is whether agreement itself
 * carries information, not whether a fitted blend does.
 */
export function consensusSignals(game) {
  const { home, away } = game.state;
  const signals = [];
  const push = (homeValue, awayValue) => {
    if (homeValue === null || awayValue === null) return;
    signals.push(Math.sign(homeValue - awayValue));
  };
  push(home.netEpa, away.netEpa);
  push(home.offSucc - home.defSucc, away.offSucc - away.defSucc);
  push(home.turnoverMargin === null ? null : -home.turnoverMargin,
    away.turnoverMargin === null ? null : -away.turnoverMargin);
  push(home.last5NetEpa, away.last5NetEpa);
  return signals;
}
