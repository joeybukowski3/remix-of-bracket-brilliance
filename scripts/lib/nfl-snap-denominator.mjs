/**
 * Team snap denominator reconstruction and season snap aggregation.
 *
 * snap_counts publishes each player's raw offensive/defensive snaps AND the
 * percentage those snaps represent, but never the team play total the
 * percentage was taken against. Season share therefore needs that denominator.
 *
 * It is recovered exactly, not estimated. Every player row in a team-game is a
 * simultaneous constraint of the form round(snaps / N, 2) == published_pct, and
 * a team-game supplies roughly 25-45 such constraints. The system is heavily
 * over-determined, so the integer N that satisfies all of them is unique. The
 * 2025 regular season resolves 544/544 offensive and 544/544 defensive
 * team-games to a unique N with zero ambiguity.
 *
 * max(player snaps) is NOT used and is not an acceptable fallback: it is only a
 * lower bound, correct when some player took every snap and silently short
 * otherwise. It was wrong in 3 of 544 team-games in 2025 (BAL wk4 54 vs 55,
 * MIA wk6 57 vs 59, SF wk11 53 vs 55).
 */

/**
 * Rounding tolerance on each constraint.
 *
 * Percentages are published to two decimals, so a player's true share sits
 * within +/-0.005 of the published value. The extra 0.0001 covers ties exactly
 * on that boundary — 74/80 = 0.925 is equidistant, and whether it publishes as
 * 0.92 or 0.93 depends on the provider's rounding mode and binary float
 * representation, neither of which is ours to assume. Widening to 0.0051 admits
 * both readings while remaining far tighter than the gap between adjacent
 * candidate denominators: moving N by one shifts a mid-range ratio by about
 * 1/N (0.012-0.02 here), an order of magnitude outside the tolerance. That is
 * why the solution stays unique rather than the tolerance creating ambiguity.
 *
 * At a strict 0.005 the same 2025 data leaves 46 team-games unsolved, all of
 * them exactly on that boundary.
 */
export const DENOMINATOR_TOLERANCE = 0.0051;

/** Plausible team play totals for one side of the ball in a single NFL game. */
export const MIN_DENOMINATOR = 20;
export const MAX_DENOMINATOR = 130;

/**
 * Solve for the unique integer team snap denominator of one team-game/unit.
 *
 * Only rows with snaps > 0 constrain the answer: a 0-snap player publishes 0.00
 * against every candidate N and carries no information.
 *
 * @returns {{ denominator: number|null, status: "resolved"|"ambiguous"|"unsolved"|"no-constraints",
 *             candidates: number[], constraintCount: number }}
 */
export function solveTeamDenominator(rows, { snapsKey, pctKey }) {
  const constraints = [];
  for (const row of rows) {
    const snaps = row[snapsKey];
    const pct = row[pctKey];
    if (!Number.isInteger(snaps) || snaps <= 0) continue;
    if (!Number.isFinite(pct)) continue;
    constraints.push([snaps, pct]);
  }

  if (constraints.length === 0) {
    return { denominator: null, status: "no-constraints", candidates: [], constraintCount: 0 };
  }

  const candidates = [];
  for (let n = MIN_DENOMINATOR; n <= MAX_DENOMINATOR; n += 1) {
    let ok = true;
    for (const [snaps, pct] of constraints) {
      if (snaps > n || Math.abs(snaps / n - pct) > DENOMINATOR_TOLERANCE) {
        ok = false;
        break;
      }
    }
    if (ok) candidates.push(n);
  }

  if (candidates.length === 1) {
    return {
      denominator: candidates[0],
      status: "resolved",
      candidates,
      constraintCount: constraints.length,
    };
  }
  return {
    denominator: null,
    status: candidates.length === 0 ? "unsolved" : "ambiguous",
    candidates,
    constraintCount: constraints.length,
  };
}

/**
 * Resolve offensive and defensive denominators for every (gameId, team) in the
 * supplied regular-season snap rows.
 *
 * Unresolved or ambiguous denominators are returned as failures. The caller
 * must treat them as a validation error rather than substituting a value —
 * a known-good artifact is preserved instead.
 */
export function resolveAllDenominators(snapRows) {
  const byTeamGame = new Map();
  for (const row of snapRows) {
    const key = `${row.gameId}|${row.team}`;
    if (!byTeamGame.has(key)) byTeamGame.set(key, []);
    byTeamGame.get(key).push(row);
  }

  const denominators = new Map();
  const failures = [];
  let resolvedCount = 0;

  for (const [key, rows] of byTeamGame) {
    const [gameId, team] = key.split("|");
    const offense = solveTeamDenominator(rows, { snapsKey: "offenseSnaps", pctKey: "offensePct" });
    const defense = solveTeamDenominator(rows, { snapsKey: "defenseSnaps", pctKey: "defensePct" });

    for (const [unit, result] of [["offense", offense], ["defense", defense]]) {
      if (result.status === "resolved") {
        resolvedCount += 1;
      } else if (result.status !== "no-constraints") {
        failures.push({
          gameId,
          team,
          unit,
          status: result.status,
          candidates: result.candidates,
          constraintCount: result.constraintCount,
        });
      }
    }

    denominators.set(key, {
      gameId,
      team,
      week: rows[0].week,
      offense: offense.denominator,
      defense: defense.denominator,
    });
  }

  return { denominators, failures, resolvedCount, teamGameCount: byTeamGame.size };
}

/**
 * Season snap share for one player, aggregated exactly.
 *
 * Numerators and denominators are summed across games and divided once. Weekly
 * percentages are never averaged — an equal-weight mean of weekly shares would
 * over-weight low-snap games and is not the same number.
 *
 * Games included are the completed regular-season games strictly before
 * `beforeWeek` in which the player appears in the snap table, i.e. the games he
 * dressed for. Games he missed entirely are excluded from BOTH the numerator
 * and the denominator, so the figure reads "when available, how much of the
 * unit's work did he take" rather than being diluted by absence. Byes fall out
 * naturally because no snap row exists.
 *
 * @returns {{ offensePct: number|null, defensePct: number|null, gamesIncluded: number,
 *             gameIds: string[], offenseSnaps: number, offenseTeamSnaps: number,
 *             defenseSnaps: number, defenseTeamSnaps: number }}
 */
export function aggregateSeasonSnaps(playerRows, denominators, { beforeWeek }) {
  let offenseSnaps = 0;
  let offenseTeamSnaps = 0;
  let defenseSnaps = 0;
  let defenseTeamSnaps = 0;
  const gameIds = [];

  const ordered = [...playerRows].sort((a, b) => a.week - b.week);
  for (const row of ordered) {
    if (beforeWeek != null && row.week >= beforeWeek) continue;
    const denominator = denominators.get(`${row.gameId}|${row.team}`);
    if (!denominator) continue;

    gameIds.push(row.gameId);
    if (denominator.offense != null) {
      offenseSnaps += row.offenseSnaps;
      offenseTeamSnaps += denominator.offense;
    }
    if (denominator.defense != null) {
      defenseSnaps += row.defenseSnaps;
      defenseTeamSnaps += denominator.defense;
    }
  }

  return {
    offensePct: offenseTeamSnaps > 0 ? (100 * offenseSnaps) / offenseTeamSnaps : null,
    defensePct: defenseTeamSnaps > 0 ? (100 * defenseSnaps) / defenseTeamSnaps : null,
    gamesIncluded: gameIds.length,
    gameIds,
    offenseSnaps,
    offenseTeamSnaps,
    defenseSnaps,
    defenseTeamSnaps,
  };
}

/**
 * The team's most recent completed regular-season game strictly before
 * `beforeWeek`. Preseason and postseason never appear here because only REG
 * rows are parsed.
 */
export function findLastTeamGame(teamSnapRows, { beforeWeek }) {
  let best = null;
  for (const row of teamSnapRows) {
    if (beforeWeek != null && row.week >= beforeWeek) continue;
    if (!best || row.week > best.week) best = { week: row.week, gameId: row.gameId };
  }
  return best;
}

/**
 * Last-game unit share, taken directly from the source-published percentage.
 *
 * Null vs zero is the important distinction:
 *   present in the snap table with 0 unit snaps -> 0 (he dressed and did not
 *     take a snap on that side of the ball; that is a real, meaningful zero)
 *   absent from the snap table                  -> null (he did not dress;
 *     nothing is known and 0% would be a fabrication)
 */
export function lastGameSnapPct(playerRow, unit) {
  if (!playerRow) return null;
  const pct = unit === "offense" ? playerRow.offensePct : playerRow.defensePct;
  if (!Number.isFinite(pct)) return null;
  return 100 * pct;
}
