const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const SAVANT_SEARCH_CSV = "https://baseballsavant.mlb.com/statcast_search/csv";
const FETCH_HEADERS = {
  Accept: "application/json,text/csv,*/*",
  "User-Agent": "Mozilla/5.0 (compatible; joeknowsball/1.0)",
};

function finite(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shiftDate(dateStr, deltaDays) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function fetchTextOnce(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: FETCH_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  try {
    return await fetchTextOnce(url, options);
  } catch (error) {
    // Savant occasionally leaves a cold CSV request open until our timeout.
    // Retry only that transient abort once; HTTP/source failures still surface
    // immediately and remain traceable through opponentContext.warnings.
    if (error?.name !== "AbortError" || options.retryOnTimeout !== true) throw error;
    return fetchTextOnce(url, { ...options, retryOnTimeout: false });
  }
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

/** Small RFC-4180 parser so the data pipeline does not add a CSV dependency. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).filter((values) => values.some((value) => value !== "")).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function normalizeTeamGameLogSplit(split) {
  const stat = split?.stat ?? {};
  const isHome = typeof split?.isHome === "boolean"
    ? split.isHome
    : split?.homeAway === "home" || split?.game?.homeAway === "home"
      ? true
      : split?.homeAway === "away" || split?.game?.homeAway === "away"
        ? false
        : null;
  return {
    gamePk: finite(split?.gamePk ?? split?.game?.gamePk),
    date: typeof (split?.date ?? split?.game?.gameDate) === "string" ? String(split.date ?? split.game.gameDate).slice(0, 10) : null,
    isHome,
    strikeouts: finite(stat.strikeOuts ?? stat.strikeouts),
    completed: isCompletedGame(split),
  };
}

function isCompletedGame(split) {
  const status = split?.game?.status ?? split?.status ?? {};
  const abstractState = String(status?.abstractGameState ?? split?.game?.abstractGameState ?? "").toLowerCase();
  const detailedState = String(status?.detailedState ?? split?.game?.detailedState ?? "").toLowerCase();
  const codedState = String(status?.codedGameState ?? split?.game?.codedGameState ?? "").toUpperCase();
  if (!abstractState && !detailedState && !codedState) return true;
  return abstractState === "final"
    || detailedState === "final"
    || detailedState === "game over"
    || codedState === "F"
    || codedState === "O";
}

/**
 * Official MLB StatsAPI team batting game logs. We intentionally express the
 * UI's team K/Game tendency as strikeouts per completed game: for a team
 * offense, one game is the natural nine-inning exposure unit and avoids
 * inventing offensive-innings denominators that the team batting feed does
 * not publish consistently.
 */
export async function fetchTeamStrikeoutContext(teamId, season, beforeDate, options = {}) {
  const url = `${MLB_STATS_API}/teams/${teamId}/stats?stats=gameLog&group=hitting&season=${season}`;
  const json = await fetchJson(url, options);
  const rows = (json?.stats ?? [])
    .flatMap((block) => block?.splits ?? [])
    .map(normalizeTeamGameLogSplit)
    .filter((row) => row.completed && row.date && row.date < beforeDate && row.strikeouts != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.gamePk ?? 0) - (a.gamePk ?? 0));

  function average(sample) {
    return sample.length ? sample.reduce((sum, row) => sum + row.strikeouts, 0) / sample.length : null;
  }

  const home = rows.filter((row) => row.isHome === true);
  const away = rows.filter((row) => row.isHome === false);
  return {
    homeKPerNine: average(home),
    awayKPerNine: average(away),
    last10KPerNine: average(rows.slice(0, 10)),
    games: { season: rows.length, home: home.length, away: away.length, last10: Math.min(10, rows.length) },
    completedGames: rows.map((row) => ({ gamePk: row.gamePk, date: row.date })),
    last10Games: rows.slice(0, 10).map((row) => ({ gamePk: row.gamePk, date: row.date })),
    source: "mlb_stats_api",
  };
}

const AB_EVENTS = new Set([
  "single", "double", "triple", "home_run", "field_out", "force_out", "grounded_into_double_play",
  "field_error", "fielders_choice", "fielders_choice_out", "strikeout", "strikeout_double_play",
  "double_play", "triple_play",
]);

function expectedHitsForAb(row) {
  const event = row.events;
  if (!AB_EVENTS.has(event)) return null;
  if (event === "strikeout" || event === "strikeout_double_play") return 0;
  const estimate = finite(row.estimated_ba_using_speedangle);
  return estimate == null ? null : Math.max(0, Math.min(1, estimate));
}

function aggregateXba(rows) {
  let expectedHits = 0;
  let atBats = 0;
  for (const row of rows) {
    const expected = expectedHitsForAb(row);
    if (expected == null) continue;
    expectedHits += expected;
    atBats += 1;
  }
  return atBats > 0 ? { xba: expectedHits / atBats, atBats } : { xba: null, atBats: 0 };
}

function plateAppearanceRows(rows) {
  // The Statcast CSV repeats each PA for every pitch; `events` is populated on
  // the terminal pitch only, so selecting rows with an event yields one record
  // per completed PA.
  return rows.filter((row) => row.events && row.game_date && row.game_pk);
}

function latestGamePks(rows, limit = 10) {
  const games = new Map();
  for (const row of rows) {
    const key = String(row.game_pk);
    if (!games.has(key)) games.set(key, row.game_date);
  }
  return [...games.entries()]
    .sort(([gamePkA, dateA], [gamePkB, dateB]) => {
      const dateOrder = String(dateB).localeCompare(String(dateA));
      return dateOrder !== 0 ? dateOrder : Number(gamePkB) - Number(gamePkA);
    })
    .slice(0, limit)
    .map(([gamePk]) => gamePk);
}

/**
 * Baseball Savant Statcast pitch-level CSV. xBA is reconstructed from the
 * official `estimated_ba_using_speedangle` value on completed ABs, with
 * strikeouts contributing zero expected hits. This lets the same source be
 * sliced by home/away and by the opponent's most recent 10 games.
 */
export async function fetchTeamXbaContext(teamAbbr, season, beforeDate, options = {}) {
  const startDate = options.startDate ?? `${season}-03-01`;
  const endDate = shiftDate(beforeDate, -1);
  const params = new URLSearchParams({
    all: "true",
    hfGT: "R|",
    hfSea: `${season}|`,
    hfTeam: `${teamAbbr}|`,
    player_type: "batter",
    game_date_gt: startDate,
    game_date_lt: endDate,
    group_by: "name",
    sort_col: "pitches",
    sort_order: "desc",
    min_pitches: "0",
    min_results: "0",
    min_abs: "0",
    type: "details",
  });
  const text = await fetchText(`${SAVANT_SEARCH_CSV}?${params.toString()}`, { ...options, retryOnTimeout: true });
  const completedGamePks = options.completedGamePks ? new Set(options.completedGamePks.map(String)) : null;
  const rows = plateAppearanceRows(parseCsv(text)).filter((row) =>
    row.game_date < beforeDate
    && (!completedGamePks || completedGamePks.has(String(row.game_pk))),
  );
  const withSite = rows.map((row) => ({
    ...row,
    isHome: String(row.home_team).toUpperCase() === String(teamAbbr).toUpperCase(),
  }));

  const sourceLast10GamePks = Array.isArray(options.last10GamePks)
    ? options.last10GamePks.map(String).filter((gamePk) => withSite.some((row) => String(row.game_pk) === gamePk)).slice(0, 10)
    : latestGamePks(withSite, 10);
  const last10GamePks = new Set(sourceLast10GamePks);
  const home = aggregateXba(withSite.filter((row) => row.isHome));
  const away = aggregateXba(withSite.filter((row) => !row.isHome));
  const last10 = aggregateXba(withSite.filter((row) => last10GamePks.has(String(row.game_pk))));
  return {
    homeXba: home.xba,
    awayXba: away.xba,
    last10Xba: last10.xba,
    samples: { homeAtBats: home.atBats, awayAtBats: away.atBats, last10AtBats: last10.atBats, last10Games: last10GamePks.size },
    source: "baseball_savant_statcast",
  };
}

export async function fetchOpponentContext(teamId, teamAbbr, season, beforeDate, options = {}) {
  const kResult = await Promise.resolve(fetchTeamStrikeoutContext(teamId, season, beforeDate, options))
    .then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
  const resolvedCompletedGamePks = kResult.status === "fulfilled"
    ? kResult.value.completedGames.map((game) => game.gamePk).filter((gamePk) => gamePk != null)
    : undefined;
  const resolvedLast10GamePks = kResult.status === "fulfilled"
    ? kResult.value.last10Games.map((game) => game.gamePk).filter((gamePk) => gamePk != null)
    : undefined;
  const completedGamePks = resolvedCompletedGamePks?.length ? resolvedCompletedGamePks : undefined;
  const last10GamePks = resolvedLast10GamePks?.length ? resolvedLast10GamePks : undefined;
  const xbaResult = await Promise.resolve(fetchTeamXbaContext(teamAbbr, season, beforeDate, { ...options, completedGamePks, last10GamePks }))
    .then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
  return {
    home: {
      kPerNine: kResult.status === "fulfilled" ? kResult.value.homeKPerNine : null,
      xba: xbaResult.status === "fulfilled" ? xbaResult.value.homeXba : null,
    },
    away: {
      kPerNine: kResult.status === "fulfilled" ? kResult.value.awayKPerNine : null,
      xba: xbaResult.status === "fulfilled" ? xbaResult.value.awayXba : null,
    },
    last10: {
      kPerNine: kResult.status === "fulfilled" ? kResult.value.last10KPerNine : null,
      xba: xbaResult.status === "fulfilled" ? xbaResult.value.last10Xba : null,
    },
    samples: {
      ...(kResult.status === "fulfilled" ? kResult.value.games : {}),
      ...(xbaResult.status === "fulfilled" ? xbaResult.value.samples : {}),
    },
    sources: {
      strikeouts: "mlb_stats_api",
      xba: "baseball_savant_statcast",
    },
    warnings: [
      ...(kResult.status === "rejected" ? [`OPPONENT_K_CONTEXT_FAILED:${kResult.reason?.message ?? "unknown"}`] : []),
      ...(xbaResult.status === "rejected" ? [`OPPONENT_XBA_CONTEXT_FAILED:${xbaResult.reason?.message ?? "unknown"}`] : []),
    ],
  };
}
