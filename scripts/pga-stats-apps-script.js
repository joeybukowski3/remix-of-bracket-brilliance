/**
 * Google Apps Script: Refresh PGA Stats Master
 * ===============================================
 *
 * PASTE THIS INTO: Extensions > Apps Script (in the Google Sheet)
 *
 * This replaces the old manual workflow of:
 *   1. Opening DevTools, capturing a session API key
 *   2. Running some separate import script
 *   3. Manually copy-pasting results into the sheet
 *   4. Running "Sync to SITE OUTPUT"
 *
 * Instead, this script calls PGA Tour's public GraphQL API directly from
 * Apps Script (server-side, no browser needed) and writes results straight
 * into the "PGA Stats Master" tab, with a fresh export-date header row.
 *
 * SETUP:
 *   1. Open the sheet, go to Extensions > Apps Script
 *   2. Delete any existing code, paste this whole file
 *   3. Update PGA_API_KEY below if the current one has stopped working
 *      (see scripts/fetch-pga-player-stats.mjs in the repo for instructions
 *      on how to capture a fresh key — same process applies here)
 *   4. Save, then run `refreshPgaStatsMaster` once manually to authorize
 *      the script (Google will prompt for permissions)
 *   5. Set up a time-driven trigger: Triggers (clock icon) > Add Trigger
 *      > refreshPgaStatsMaster > Time-driven > Week timer > every Monday
 *
 * After this runs, the existing GitHub Action (sync-pga-data.yml) will
 * pick up the freshly-written sheet data automatically on its next run.
 */

const PGA_API_KEY = "da2-gsrx5bibzbb4njvhI7t37wqyl4"; // rotate here if it stops working
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const SEASON = new Date().getFullYear();
const TOUR_CODE = "R";
const SHEET_NAME = "PGA Stats Master";

// statId -> { column header, statName field to extract, transform fn }
const STAT_DEFS = [
  { id: "02675", header: "SG: Total", field: "Avg" },
  { id: "02567", header: "SG: Off the Tee", field: "Avg" },
  { id: "02568", header: "SG: Approach the Green", field: "Avg" },
  { id: "02569", header: "SG: Around the Green", field: "Avg" },
  { id: "02564", header: "SG: Putting", field: "Avg" },
  { id: "142", header: "Par 3 Scoring Average", field: "Avg" },
  { id: "143", header: "Par 4 Scoring Average", field: "Avg" },
  { id: "144", header: "Par 5 Scoring Average", field: "Avg" },
  { id: "357", header: "Birdie or Better 200+ yds", field: "%", isPercent: true },
  { id: "358", header: "Birdie or Better 175-200 yds", field: "%", isPercent: true },
  { id: "359", header: "Birdie or Better 150-175 yds", field: "%", isPercent: true },
  { id: "360", header: "Birdie or Better 125-150 yds", field: "%", isPercent: true },
  { id: "361", header: "Birdie or Better <125 yds", field: "%", isPercent: true },
  { id: "148", header: "Round 1 Scoring Average", field: "Avg" },
  { id: "149", header: "Round 2 Scoring Average", field: "Avg" },
  { id: "285", header: "Round 4 Scoring Average", field: "Avg" },
  { id: "02414", header: "Bogey Avoidance", field: "% Makes Bogey", isPercent: true },
  { id: "02415", header: "Birdie to Bogey Ratio", field: "Birdie to Bogey Ratio" },
  { id: "102", header: "Driving Accuracy %", field: "%", isPercent: true },
];

const QUERY = `
  query StatDetails($tourCode: TourCode!, $statId: String!, $year: Int!) {
    statDetails(tourCode: $tourCode, statId: $statId, year: $year) {
      rows {
        ... on StatDetailsPlayer {
          playerName
          country
          stats { statName statValue }
        }
      }
    }
  }
`;

function fetchStat_(statId) {
  const payload = {
    query: QUERY,
    variables: { tourCode: TOUR_CODE, statId: statId, year: SEASON },
  };
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": PGA_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  const response = UrlFetchApp.fetch(GRAPHQL_URL, options);
  const code = response.getResponseCode();
  const json = JSON.parse(response.getContentText());

  if (code !== 200 || json.errors) {
    throw new Error(
      "Stat " + statId + " failed (HTTP " + code + "): " +
      JSON.stringify(json.errors || json).substring(0, 300)
    );
  }
  return json.data.statDetails.rows || [];
}

function statValueFor_(row, fieldName) {
  const stat = (row.stats || []).filter(function (s) { return s.statName === fieldName; })[0];
  return stat ? stat.statValue : null;
}

function parsePercent_(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace("%", ""));
  return isNaN(n) ? null : n;
}

/**
 * Main entry point. Run this manually once to authorize, then set up
 * a weekly time-driven trigger to call it automatically.
 */
function refreshPgaStatsMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet tab "' + SHEET_NAME + '" not found.');
  }

  Logger.log("Fetching " + STAT_DEFS.length + " stat categories for season " + SEASON + "...");

  // playerName -> { country, statHeader: value, ... }
  const playerData = {};

  for (let i = 0; i < STAT_DEFS.length; i++) {
    const def = STAT_DEFS[i];
    Logger.log("Fetching " + def.header + " (statId " + def.id + ")...");
    const rows = fetchStat_(def.id);
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      const name = row.playerName;
      if (!name) continue;
      if (!playerData[name]) {
        playerData[name] = { country: row.country || "" };
      }
      const raw = statValueFor_(row, def.field);
      const value = def.isPercent ? parsePercent_(raw) : (raw !== null ? parseFloat(raw) : null);
      playerData[name][def.header] = value;
    }
    Utilities.sleep(150); // be polite to the API
  }

  const playerNames = Object.keys(playerData).sort();
  Logger.log("Collected data for " + playerNames.length + " players.");

  // Build the output grid matching the existing sheet layout:
  // Row 1: title with export timestamp
  // Row 2: headers
  // Row 3+: player data
  const headers = ["Player Name", "Country"].concat(STAT_DEFS.map(function (d) { return d.header; }));

  const now = new Date();
  const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const titleRow = ["PGA Tour Stats Export — " + timestamp + " — Season " + SEASON];

  const dataRows = playerNames.map(function (name) {
    const p = playerData[name];
    const row = [name, p.country];
    for (let i = 0; i < STAT_DEFS.length; i++) {
      const def = STAT_DEFS[i];
      const val = p[def.header];
      row.push(val === null || val === undefined ? "" : val);
    }
    return row;
  });

  // Clear existing content and write fresh data
  sheet.clear();
  sheet.getRange(1, 1, 1, 1).setValue(titleRow[0]);
  sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
  if (dataRows.length > 0) {
    sheet.getRange(3, 1, dataRows.length, headers.length).setValues(dataRows);
  }

  Logger.log("Wrote " + dataRows.length + " player rows to " + SHEET_NAME + ".");
  Logger.log("Done. The GitHub Action will pick this up on its next scheduled run.");
}
