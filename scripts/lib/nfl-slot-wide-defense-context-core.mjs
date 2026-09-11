/**
 * Pure parse/validate/build helpers for the Razzball defensive slot-vs-wide
 * PPG-allowed table (https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/).
 *
 * No network I/O here -- `scripts/refresh-nfl-slot-wide-defense-context.mjs`
 * owns fetching; this module is fixture-testable against saved HTML.
 *
 * Verified against the live page (2026-09-11): the table (`#neorazzstatstable`)
 * is present in server-delivered HTML behind Cloudflare's CDN (not a JS
 * challenge/anti-bot page), no auth required, robots.txt permits crawling
 * this path with `Crawl-delay: 10` (a once-daily refresh is trivially
 * compliant). Columns: #, Defense, Total PPG Allowed, Slot PPG Allowed,
 * Wide PPG Allowed, Slot%, Wide%, Next Opp -- plus one trailing "NFL Average"
 * summary row that must be excluded, not treated as a 33rd team.
 */

export const NFL_TEAM_COUNT = 32;

/** Team codes Razzball spells out that the canonical alias table doesn't cover natively (see identity.ts). */
const TABLE_ID = "neorazzstatstable";

/**
 * @param {string} html
 * @returns {{ ok: true, rows: Array<{ team: string, totalPpgAllowed: number, slotPpgAllowed: number, widePpgAllowed: number, slotPct: number, widePct: number, nextOpponent: string | null }> } | { ok: false, error: string }}
 */
export function parseSlotWideDefenseTable(html) {
  const tableStart = html.indexOf(`id="${TABLE_ID}"`);
  if (tableStart === -1) return { ok: false, error: `Table #${TABLE_ID} not found in fetched HTML` };

  const tbodyMatch = /<TBODY>([\s\S]*?)<\/TBODY>/i.exec(html.slice(tableStart));
  if (!tbodyMatch) return { ok: false, error: "No <TBODY> found inside the slot/wide defense table" };

  const rowMatches = [...tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length === 0) return { ok: false, error: "No <tr> rows found inside the slot/wide defense table body" };

  const rows = [];
  for (const rowMatch of rowMatches) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cellMatch) => cellMatch[1].replace(/<[^>]*>/g, "").trim());
    // Layout is [#, Defense, Total PPG Allowed, Slot PPG Allowed, Wide PPG Allowed, Slot%, Wide%, Next Opp].
    if (cells.length !== 8) return { ok: false, error: `Expected 8 cells per row, found ${cells.length}: ${JSON.stringify(cells)}` };
    const [, team, totalPpgAllowedRaw, slotPpgAllowedRaw, widePpgAllowedRaw, slotPctRaw, widePctRaw, nextOpponentRaw] = cells;
    if (!team || team === "NFL Average") continue; // the trailing league-average summary row, not a team.

    const totalPpgAllowed = Number(totalPpgAllowedRaw);
    const slotPpgAllowed = Number(slotPpgAllowedRaw);
    const widePpgAllowed = Number(widePpgAllowedRaw);
    const slotPct = parsePercent(slotPctRaw);
    const widePct = parsePercent(widePctRaw);
    if (![totalPpgAllowed, slotPpgAllowed, widePpgAllowed, slotPct, widePct].every(Number.isFinite)) {
      return { ok: false, error: `Non-numeric field for team "${team}": ${JSON.stringify(cells)}` };
    }
    rows.push({ team, totalPpgAllowed, slotPpgAllowed, widePpgAllowed, slotPct, widePct, nextOpponent: nextOpponentRaw || null });
  }

  return { ok: true, rows };
}

function parsePercent(raw) {
  const match = /^(-?\d+(?:\.\d+)?)%$/.exec(String(raw ?? "").trim());
  return match ? Number(match[1]) / 100 : NaN;
}

/**
 * Normalizes team codes (via the caller's canonical `normalizeTeamAbbr`),
 * validates plausible numeric ranges, and rejects duplicate normalized teams
 * or incomplete NFL coverage. Never a partial write: `ok: false` here means
 * the caller must preserve the last-known-good artifact untouched.
 *
 * @param {Array<{ team: string, totalPpgAllowed: number, slotPpgAllowed: number, widePpgAllowed: number, slotPct: number, widePct: number, nextOpponent: string | null }>} rows
 * @param {(code: string) => string | null} normalizeTeamAbbr
 * @returns {{ ok: true, teams: Array<{ team: string, totalPpgAllowed: number, slotPpgAllowed: number, widePpgAllowed: number, slotPct: number, widePct: number, nextOpponent: string | null }> } | { ok: false, error: string }}
 */
export function normalizeSlotWideDefenseRows(rows, normalizeTeamAbbr) {
  const seen = new Set();
  const teams = [];
  for (const row of rows) {
    const team = normalizeTeamAbbr(row.team);
    if (!team) return { ok: false, error: `Could not normalize team code "${row.team}"` };
    if (seen.has(team)) return { ok: false, error: `Duplicate normalized team "${team}" (raw "${row.team}")` };
    seen.add(team);

    if (row.totalPpgAllowed < 0 || row.totalPpgAllowed > 80) return { ok: false, error: `Implausible Total PPG Allowed for ${team}: ${row.totalPpgAllowed}` };
    if (row.slotPpgAllowed < 0 || row.slotPpgAllowed > 60) return { ok: false, error: `Implausible Slot PPG Allowed for ${team}: ${row.slotPpgAllowed}` };
    if (row.widePpgAllowed < 0 || row.widePpgAllowed > 60) return { ok: false, error: `Implausible Wide PPG Allowed for ${team}: ${row.widePpgAllowed}` };
    if (row.slotPct < 0 || row.slotPct > 1) return { ok: false, error: `Implausible Slot% for ${team}: ${row.slotPct}` };
    if (row.widePct < 0 || row.widePct > 1) return { ok: false, error: `Implausible Wide% for ${team}: ${row.widePct}` };

    teams.push({
      team,
      totalPpgAllowed: row.totalPpgAllowed,
      slotPpgAllowed: row.slotPpgAllowed,
      widePpgAllowed: row.widePpgAllowed,
      slotPct: row.slotPct,
      widePct: row.widePct,
      nextOpponent: row.nextOpponent ? normalizeTeamAbbr(row.nextOpponent) : null,
    });
  }

  if (teams.length < NFL_TEAM_COUNT) return { ok: false, error: `Insufficient team coverage: ${teams.length}/${NFL_TEAM_COUNT} teams parsed` };

  teams.sort((a, b) => a.team.localeCompare(b.team)); // deterministic ordering, independent of source row order.
  return { ok: true, teams };
}

/**
 * @param {{ season: number, generatedAt: string, teams: ReturnType<typeof normalizeSlotWideDefenseRows>["teams"] }} input
 */
export function buildSlotWideDefenseArtifact({ season, generatedAt, teams }) {
  return {
    schemaVersion: "nfl-slot-wide-defense-context-v1",
    source: "Razzball",
    sourceUrl: "https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/",
    season,
    generatedAt,
    teams,
  };
}
