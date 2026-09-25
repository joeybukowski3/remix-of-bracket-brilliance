import { resolveCurrentWeek } from "./nfl-market-coverage.mjs";

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
// The canonical catalogue carries both a display name and nflverse code.
// Combining the latter with its nickname covers DK's broadcast-style labels
// (ATL Falcons, JAX Jaguars, WAS Commanders) without a second team universe.
const DK_ALIASES = Object.freeze({});

export function resolveDraftKingsTeam(label, teams) {
  const key = clean(label);
  const exact = teams.filter((team) => [team.name, team.fullName, `${team.nflverseAbbr} ${team.shortName}`].some((name) => clean(name) === key));
  if (exact.length === 1) return exact[0].abbr;
  if (exact.length > 1) return null;
  const alias = DK_ALIASES[key];
  return alias && teams.some((team) => team.abbr === alias) ? alias : null;
}

function dateMatches(dateText, kickoffUtc) {
  const match = /^(\d{1,2})\/(\d{1,2}),\s*(\d{1,2}):(\d{2})(AM|PM)$/i.exec(dateText);
  if (!match || !Number.isFinite(Date.parse(kickoffUtc))) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(kickoffUtc));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const hour = Number(value("hour")) % 12 || 12;
  return Number(match[1]) === Number(value("month")) && Number(match[2]) === Number(value("day")) && Number(match[3]) === hour && Number(match[4]) === Number(value("minute")) && match[5].toUpperCase() === value("dayPeriod")?.toUpperCase();
}

/** Joins only exact oriented canonical schedule matches; no hand-built game IDs. */
export function joinDraftKingsGames(parsedPages, teams, schedule, { season, intendedWeek = resolveCurrentWeek(schedule), sourceCapturedAt = null } = {}) {
  if (!Number.isInteger(season) || !Number.isInteger(intendedWeek)) throw new Error("Season/current week unavailable");
  if (sourceCapturedAt !== null && !Number.isFinite(Date.parse(sourceCapturedAt))) throw new Error("Invalid sourceCapturedAt");
  const diagnostics = [];
  const current = new Map();
  const adjacent = [];
  const started = [];
  const seen = new Set();
  const canonical = schedule.filter((game) => game.season === season && game.seasonType === "REG");
  const startedMatchup = (heading) => {
    if (sourceCapturedAt === null) return null;
    const matchup = /^(.+?)\s+@\s+(.+)$/.exec(heading ?? "");
    if (!matchup) return null;
    const away = resolveDraftKingsTeam(matchup[1], teams);
    const home = resolveDraftKingsTeam(matchup[2], teams);
    const candidates = canonical.filter((game) => game.awayAbbr === away && game.homeAbbr === home);
    return candidates.length === 1 && candidates[0].week === intendedWeek && Date.parse(candidates[0].dateUtc) <= Date.parse(sourceCapturedAt) ? candidates[0] : null;
  };
  for (const parsed of parsedPages) {
    for (const issue of parsed.diagnostics) {
      const game = startedMatchup(issue.matchupHeading);
      if (game) {
        started.push({ gameId: game.gameId, market: issue.market });
        diagnostics.push({ code: "already_started", market: issue.market, page: issue.page, sourceText: issue.matchupHeading, gameId: game.gameId, sourceIssue: issue.code });
      } else diagnostics.push(issue);
    }
    for (const row of parsed.games) {
      const away = resolveDraftKingsTeam(row.awaySource, teams);
      const home = resolveDraftKingsTeam(row.homeSource, teams);
      if (!away || !home || away === home) {
        diagnostics.push({ code: "unresolved_team", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource}`, detail: `${away ?? "?"} @ ${home ?? "?"}` });
        continue;
      }
      const sourceKey = `${row.market}:${away}:${home}`;
      if (seen.has(sourceKey)) {
        diagnostics.push({ code: "duplicate_source_matchup", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource}` });
        continue;
      }
      seen.add(sourceKey);
      const candidates = canonical.filter((g) => g.awayAbbr === away && g.homeAbbr === home);
      if (candidates.length > 1) {
        diagnostics.push({ code: "duplicate_canonical_candidate", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource}`, candidateGameIds: candidates.map((g) => g.gameId) });
        continue;
      }
      if (candidates.length === 0) {
        const reversed = canonical.filter((g) => g.awayAbbr === home && g.homeAbbr === away);
        diagnostics.push({ code: reversed.length ? "reversed_orientation" : "matchup_not_found", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource}`, candidateGameIds: reversed.map((g) => g.gameId) });
        continue;
      }
      const game = candidates[0];
      if (game.week !== intendedWeek) {
        adjacent.push({ gameId: game.gameId, week: game.week, market: row.market });
        diagnostics.push({ code: "adjacent_week", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource}`, gameId: game.gameId, week: game.week });
        continue;
      }
      if (sourceCapturedAt !== null && Date.parse(game.dateUtc) <= Date.parse(sourceCapturedAt)) {
        started.push({ gameId: game.gameId, market: row.market });
        diagnostics.push({ code: "already_started", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource}`, gameId: game.gameId });
        continue;
      }
      const dateMatch = dateMatches(row.dateText, game.dateUtc);
      if (dateMatch === false) {
        diagnostics.push({ code: "kickoff_mismatch", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource} ${row.dateText}`, candidateGameIds: [game.gameId] });
        continue;
      }
      const record = current.get(game.gameId) ?? { gameId: game.gameId, season: game.season, seasonType: game.seasonType, week: game.week, kickoffUtc: game.dateUtc, away: game.awayAbbr, home: game.homeAbbr, markets: {} };
      if (record.markets[row.market]) {
        diagnostics.push({ code: "duplicate_source_matchup", market: row.market, page: row.page, sourceText: `${row.awaySource} @ ${row.homeSource}`, gameId: game.gameId });
        continue;
      }
      record.markets[row.market] = row.sides.map((side) => {
        const team = row.market === "total" ? null : resolveDraftKingsTeam(side.side, teams);
        const orientation = row.market === "total" ? side.side : team === away ? "away" : "home";
        return { side: orientation, ...(team ? { team } : {}), line: side.line, odds: side.odds, handlePct: side.handlePct, betsPct: side.betsPct, capturedAt: side.capturedAt };
      });
      current.set(game.gameId, record);
    }
  }
  const games = [...current.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId));
  for (const game of games) for (const market of ["spread", "moneyline", "total"]) if (!game.markets[market]) diagnostics.push({ code: "missing_market", gameId: game.gameId, market });
  return { season, week: intendedWeek, games, adjacent, started, diagnostics };
}
