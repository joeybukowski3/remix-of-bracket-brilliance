/** Compare current regular-season team-games with the canonical final results. */
export function expectedFinalTeamGames(results, games = null) {
  const scheduled = games == null ? null : new Set(
    games.filter((game) => game.seasonType === "REG").map((game) => game.gameId)
  );
  const expected = [];
  for (const result of results) {
    if (result.seasonType !== "REG" || result.final !== true) continue;
    if (scheduled && !scheduled.has(result.gameId)) {
      throw new Error(`Final regular-season game ${result.gameId} is absent from the schedule`);
    }
    for (const team of [result.homeAbbr, result.awayAbbr]) {
      if (!result.gameId || !team) throw new Error(`Malformed final result ${result.gameId ?? "?"}`);
      expected.push({ gameId: result.gameId, team });
    }
  }
  return expected;
}

export function validateTeamGameCoverage(expectedRows, includedRows, label) {
  const key = (row) => `${row.gameId}|${row.team}`;
  const expected = new Set(expectedRows.map(key));
  const included = new Set(includedRows.map(key));
  const gameId = (entry) => entry.split("|")[0];
  const missing = [...expected].filter((entry) => !included.has(entry));
  const unexpected = [...included].filter((entry) => !expected.has(entry));
  const teams = new Set([...expectedRows, ...includedRows].map((row) => row.team));
  const teamsWithSampleCountMismatches = [...teams].sort().flatMap((team) => {
    const expectedCount = expectedRows.filter((row) => row.team === team).length;
    const includedCount = includedRows.filter((row) => row.team === team).length;
    return expectedCount === includedCount ? [] : [{ team, expected: expectedCount, included: includedCount }];
  });
  const summary = {
    label,
    expectedGames: new Set(expectedRows.map((row) => row.gameId)).size,
    includedGames: new Set(includedRows.map((row) => row.gameId)).size,
    missingGameIds: [...new Set(missing.map(gameId))].sort(),
    unexpectedGameIds: [...new Set(unexpected.map(gameId))].sort(),
    teamsWithSampleCountMismatches,
  };
  const problems = [];
  if (expected.size !== expectedRows.length) problems.push("duplicate expected team-game");
  if (included.size !== includedRows.length) problems.push("duplicate included team-game");
  if (missing.length) problems.push(`missing team-games: ${missing.slice(0, 8).join(", ")}`);
  if (unexpected.length) problems.push(`unexpected team-games: ${unexpected.slice(0, 8).join(", ")}`);
  return { summary, problems };
}

export function requireTeamGameCoverage(expectedRows, includedRows, label) {
  const result = validateTeamGameCoverage(expectedRows, includedRows, label);
  console.log(`[nfl:coverage] ${JSON.stringify(result.summary)}`);
  if (result.problems.length) throw new Error(`${label}: ${result.problems.join("; ")}`);
  return result.summary;
}
