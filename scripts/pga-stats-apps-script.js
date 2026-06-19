// ============================================================
// JoeKnowsBall - PGA Model Google Apps Script
// Paste this into: Google Sheet > Extensions > Apps Script
// ============================================================

const SHEETS = {
  PGA_STATS: 'PGA Stats Master',
  STAT_IDS: 'StatID-PGATOUR',
  TREND_DG: 'TrendTable DG',
  COURSE_HISTORY: 'Course History DG',
  PLAYER_RANKS: 'Player Ranks DG',
  COURSE_STATS: 'Course Stats DG',
  SCHEDULE: '2026 Schedule DG',
  POWER_RANKINGS: 'Power Rankings',
  CURRENT_WEEK: 'Tournament Model - Current',
  NEXT_WEEK: 'Tournament Model - Next Week',
  COURSE_WEIGHTS: 'Course Weights',
  SITE_OUTPUT: 'SITE OUTPUT'
};

// ============================================================
// PGA TOUR LIVE API CONFIG
// Used by refreshPgaStatsMaster() to pull fresh stats directly
// from PGA Tour's public GraphQL API — no DevTools key-capture
// or manual copy-paste needed anymore.
// ============================================================
const PGA_API_KEY = "da2-gsrx5bibzbb4njvhI7t37wqyl4"; // rotate here if it stops working
const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const TOUR_CODE = "R";

// statId -> { column header, statName field to extract, isPercent }
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

const PGA_STATS_QUERY = `
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

// ============================================================
// MENU - Appears at top of Google Sheet automatically
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏌️ JoeKnowsBall')
    .addItem('1. Setup (Run First)', 'setupSheets')
    .addSeparator()
    .addItem('Refresh Player Stats from PGA Tour', 'refreshPgaStatsMaster')
    .addItem('Update ALL Models', 'updateAll')
    .addItem('Update Power Rankings', 'updatePowerRankings')
    .addItem('Update Current Tournament', 'updateCurrentTournament')
    .addItem('Update Next Week Tournament', 'updateNextTournament')
    .addSeparator()
    .addItem('Sync to SITE OUTPUT', 'updateSiteOutput')
    .addToUi();
}

// ============================================================
// SETUP - Run once to create new sheets
// ============================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const toCreate = [
    SHEETS.POWER_RANKINGS,
    SHEETS.CURRENT_WEEK,
    SHEETS.NEXT_WEEK,
    SHEETS.COURSE_WEIGHTS,
    SHEETS.SITE_OUTPUT
  ];

  toCreate.forEach(name => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });

  setupCourseWeightsSheet();
  setupSiteOutputHeader();
  SpreadsheetApp.getUi().alert('✅ Setup complete! Now click "Update ALL Models".');
}

// ============================================================
// COURSE WEIGHTS SHEET
// You can add a row per tournament and customize the weights.
// If no row exists for a tournament, DEFAULT weights are used.
// Weights should add up to 1.0
// ============================================================
function setupCourseWeightsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.COURSE_WEIGHTS);
  sheet.clearContents();

  const headers = [
    'Tournament Name', 'SG Total', 'SG Off Tee', 'SG Approach',
    'SG Around Green', 'SG Putting', 'Driving Accuracy', 'Bogey Avoidance',
    'Birdie/Bogey Ratio', 'Notes'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1a472a').setFontColor('white');

  // DEFAULT weights — edit these to adjust the baseline power ranking
  const defaultRow = [
    'DEFAULT', 0.30, 0.15, 0.20, 0.10, 0.15, 0.03, 0.04, 0.03,
    'Fallback weights when no tournament-specific row exists'
  ];
  sheet.getRange(2, 1, 1, defaultRow.length).setValues([defaultRow])
    .setBackground('#e8f5e9');

  // Example tournament-specific row — copy/paste and adjust as needed
  const exampleRow = [
    'The Masters', 0.20, 0.10, 0.25, 0.15, 0.20, 0.02, 0.04, 0.04,
    'Augusta favors approach play and putting'
  ];
  sheet.getRange(3, 1, 1, exampleRow.length).setValues([exampleRow])
    .setBackground('#fff9c4');

  sheet.autoResizeColumns(1, headers.length);
}

// ============================================================
// REFRESH PGA STATS MASTER (NEW)
// Pulls fresh player stats directly from PGA Tour's public
// GraphQL API and writes them into the PGA Stats Master tab,
// replacing the old manual DevTools-key-capture-and-paste process.
//
// Call this manually from the menu, or it runs automatically as
// part of "Update ALL Models" / mondayAutoUpdate (see below).
// ============================================================
function refreshPgaStatsMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.PGA_STATS);
  if (!sheet) {
    throw new Error('Sheet tab "' + SHEETS.PGA_STATS + '" not found.');
  }

  const season = new Date().getFullYear();
  Logger.log("Fetching " + STAT_DEFS.length + " stat categories for season " + season + "...");

  // playerName -> { country, statHeader: value, ... }
  const playerData = {};

  for (let i = 0; i < STAT_DEFS.length; i++) {
    const def = STAT_DEFS[i];
    Logger.log("Fetching " + def.header + " (statId " + def.id + ")...");
    const rows = fetchPgaStat_(def.id, season);
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
  const titleRow = "PGA Tour Stats Export — " + timestamp + " — Season " + season;

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
  sheet.getRange(1, 1, 1, 1).setValue(titleRow);
  sheet.getRange(2, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1a472a').setFontColor('white');
  if (dataRows.length > 0) {
    sheet.getRange(3, 1, dataRows.length, headers.length).setValues(dataRows);
  }
  sheet.autoResizeColumns(1, headers.length);

  Logger.log("Wrote " + dataRows.length + " player rows to " + SHEETS.PGA_STATS + ".");
}

function fetchPgaStat_(statId, season) {
  const payload = {
    query: PGA_STATS_QUERY,
    variables: { tourCode: TOUR_CODE, statId: statId, year: season },
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

// ============================================================
// POWER RANKINGS
// Normalizes all player stats 0-100, applies weights, ranks
// ============================================================
function updatePowerRankings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const statsSheet = ss.getSheetByName(SHEETS.PGA_STATS);
  const prSheet = ss.getSheetByName(SHEETS.POWER_RANKINGS);
  const weightsSheet = ss.getSheetByName(SHEETS.COURSE_WEIGHTS);

  if (!statsSheet || !prSheet) {
    SpreadsheetApp.getUi().alert('Missing sheets. Run Setup first.');
    return;
  }

  const weights = getWeightsForTournament('DEFAULT', weightsSheet.getDataRange().getValues());
  const { headers, players } = getPlayerStats(statsSheet);
  const scores = scoreAndRankPlayers(players, headers, weights);

  // Write output
  prSheet.clearContents();
  const outHeaders = ['Rank', 'Player', 'Power Score', 'SG Total', 'SG OTT', 'SG APP', 'SG ATG', 'SG PUTT'];
  prSheet.getRange(1, 1, 1, outHeaders.length).setValues([outHeaders])
    .setFontWeight('bold').setBackground('#1a472a').setFontColor('white');

  const rows = scores.map((p, i) => [
    i + 1, p.name, Math.round(p.score * 10) / 10,
    p.sgTotal, p.sgOTT, p.sgApp, p.sgAtG, p.sgPutt
  ]);
  prSheet.getRange(2, 1, rows.length, outHeaders.length).setValues(rows);
  prSheet.getRange(2, 1, Math.min(10, rows.length), outHeaders.length).setBackground('#d4edda');
  prSheet.autoResizeColumns(1, outHeaders.length);

  Logger.log('Power Rankings updated: ' + scores.length + ' players');
}

// ============================================================
// TOURNAMENT MODELS
// ============================================================
function updateCurrentTournament() {
  _buildTournamentModel(0, SHEETS.CURRENT_WEEK, 'CURRENT WEEK');
}

function updateNextTournament() {
  _buildTournamentModel(1, SHEETS.NEXT_WEEK, 'NEXT WEEK');
}

function _buildTournamentModel(weekOffset, sheetName, label) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = ss.getSheetByName(SHEETS.SCHEDULE);
  const statsSheet = ss.getSheetByName(SHEETS.PGA_STATS);
  const weightsSheet = ss.getSheetByName(SHEETS.COURSE_WEIGHTS);
  const modelSheet = ss.getSheetByName(sheetName);

  if (!scheduleSheet || !statsSheet || !modelSheet) {
    SpreadsheetApp.getUi().alert('Missing sheets for ' + label);
    return;
  }

  const tournament = getTournamentForWeek(scheduleSheet, weekOffset);
  if (!tournament) {
    SpreadsheetApp.getUi().alert('No tournament found for ' + label + '. Check 2026 Schedule DG tab.');
    return;
  }

  const allWeights = weightsSheet.getDataRange().getValues();
  const weights = getWeightsForTournament(tournament.name, allWeights);
  const { headers, players } = getPlayerStats(statsSheet);
  const scores = scoreAndRankPlayers(players, headers, weights);

  // Write output
  modelSheet.clearContents();

  const weightKeys = ['SG Total','SG Off Tee','SG Approach','SG Around Green','SG Putting'];
  const weightSummary = weightKeys.map(k => k + ': ' + Math.round((weights[k]||0)*100) + '%').join(' | ');

  modelSheet.getRange('A1').setValue(label + ': ' + tournament.name).setFontWeight('bold').setFontSize(14);
  modelSheet.getRange('A2').setValue('Course: ' + (tournament.course || 'TBD'));
  modelSheet.getRange('A3').setValue('Dates: ' + tournament.dates);
  modelSheet.getRange('A4').setValue('Weights → ' + weightSummary).setFontColor('#555555').setFontStyle('italic');
  modelSheet.getRange('A5').setValue('⚠️ To change weights for this tournament, add a row in "Course Weights" tab with exact tournament name.');
  modelSheet.getRange('A5').setFontColor('#cc0000');

  const outHeaders = ['Rank', 'Player', 'Model Score', 'SG Total', 'SG OTT', 'SG APP', 'SG ATG', 'SG PUTT'];
  modelSheet.getRange(7, 1, 1, outHeaders.length).setValues([outHeaders])
    .setFontWeight('bold').setBackground('#1a472a').setFontColor('white');

  const rows = scores.map((p, i) => [
    i + 1, p.name, Math.round(p.score * 10) / 10,
    p.sgTotal, p.sgOTT, p.sgApp, p.sgAtG, p.sgPutt
  ]);
  modelSheet.getRange(8, 1, rows.length, outHeaders.length).setValues(rows);
  modelSheet.getRange(8, 1, Math.min(10, rows.length), outHeaders.length).setBackground('#d4edda');
  modelSheet.autoResizeColumns(1, outHeaders.length);

  Logger.log(label + ' model updated: ' + tournament.name);
}

// ============================================================
// SITE OUTPUT
// This is the single sheet the GitHub Action reads.
// You can edit values here manually before syncing to site.
// ============================================================
function setupSiteOutputHeader() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SITE_OUTPUT);
  sheet.getRange('A1').setValue('⚠️ SITE OUTPUT — This tab is read directly by joeknowsball.com')
    .setFontWeight('bold').setFontColor('red');
  sheet.getRange('A2').setValue('Edit values here, then run "Sync to SITE OUTPUT". The GitHub Action will push changes to the site.');
  sheet.getRange('A3').setValue('Last Updated:');
  sheet.getRange('B3').setValue(new Date());
}

function updateSiteOutput() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const siteSheet = ss.getSheetByName(SHEETS.SITE_OUTPUT);
  const prSheet = ss.getSheetByName(SHEETS.POWER_RANKINGS);
  const currentSheet = ss.getSheetByName(SHEETS.CURRENT_WEEK);
  const nextSheet = ss.getSheetByName(SHEETS.NEXT_WEEK);

  siteSheet.clearContents();
  setupSiteOutputHeader();

  let nextRow = 5;

  // Power Rankings section
  if (prSheet && prSheet.getLastRow() > 1) {
    siteSheet.getRange(nextRow, 1).setValue('=== POWER RANKINGS ===')
      .setFontWeight('bold').setBackground('#e8f5e9');
    nextRow++;
    const prData = prSheet.getDataRange().getValues();
    siteSheet.getRange(nextRow, 1, prData.length, prData[0].length).setValues(prData);
    nextRow += prData.length + 2;
  }

  // Current tournament section
  if (currentSheet && currentSheet.getLastRow() > 1) {
    siteSheet.getRange(nextRow, 1).setValue('=== CURRENT TOURNAMENT MODEL ===')
      .setFontWeight('bold').setBackground('#e3f2fd');
    nextRow++;
    const ctData = currentSheet.getDataRange().getValues();
    siteSheet.getRange(nextRow, 1, ctData.length, ctData[0].length).setValues(ctData);
    nextRow += ctData.length + 2;
  }

  // Next week tournament section
  if (nextSheet && nextSheet.getLastRow() > 1) {
    siteSheet.getRange(nextRow, 1).setValue('=== NEXT WEEK TOURNAMENT MODEL ===')
      .setFontWeight('bold').setBackground('#fce4ec');
    nextRow++;
    const nwData = nextSheet.getDataRange().getValues();
    siteSheet.getRange(nextRow, 1, nwData.length, nwData[0].length).setValues(nwData);
  }

  siteSheet.getRange('B3').setValue(new Date());
  SpreadsheetApp.getUi().alert('✅ SITE OUTPUT updated! Now run the GitHub Action to push to joeknowsball.com');
}

// ============================================================
// UPDATE ALL
// Now refreshes raw player stats from PGA Tour's live API FIRST,
// then recomputes every downstream model from that fresh data.
// This is the fix for the staleness bug — previously this never
// refreshed PGA Stats Master, so every weekly run just recomputed
// rankings from the same old data, indefinitely.
// ============================================================
function updateAll() {
  refreshPgaStatsMaster();
  updatePowerRankings();
  updateCurrentTournament();
  updateNextTournament();
  updateSiteOutput();
  SpreadsheetApp.getUi().alert('✅ All models updated!');
}

// This runs automatically every Monday via a time trigger
function mondayAutoUpdate() {
  updateAll();
}

// ============================================================
// HELPERS
// ============================================================
function getPlayerStats(statsSheet) {
  const data = statsSheet.getDataRange().getValues();
  // Row 0: export label, Row 1: column headers, Row 2+: players
  const headers = data[1];
  const players = data.slice(2).filter(r => r[0]); // skip empty rows
  return { headers, players };
}

function scoreAndRankPlayers(players, headers, weights) {
  const colIdx = {
    name: 0,
    sgTotal: headers.indexOf('SG: Total'),
    sgOTT:   headers.indexOf('SG: Off the Tee'),
    sgApp:   headers.indexOf('SG: Approach the Green'),
    sgAtG:   headers.indexOf('SG: Around the Green'),
    sgPutt:  headers.indexOf('SG: Putting'),
    drvAcc:  headers.indexOf('Driving Accuracy %'),
    bogeyAv: headers.indexOf('Bogey Avoidance'),
    birdBog: headers.indexOf('Birdie to Bogey Ratio')
  };

  const statDefs = [
    { key: 'sgTotal', wKey: 'SG Total' },
    { key: 'sgOTT',   wKey: 'SG Off Tee' },
    { key: 'sgApp',   wKey: 'SG Approach' },
    { key: 'sgAtG',   wKey: 'SG Around Green' },
    { key: 'sgPutt',  wKey: 'SG Putting' },
    { key: 'drvAcc',  wKey: 'Driving Accuracy' },
    { key: 'bogeyAv', wKey: 'Bogey Avoidance' },
    { key: 'birdBog', wKey: 'Birdie/Bogey Ratio' }
  ];

  // Extract raw values
  const raw = {};
  statDefs.forEach(({ key }) => {
    raw[key] = players.map(p => parseFloat(String(p[colIdx[key]]).replace('%', '')) || 0);
  });

  // Normalize 0-100
  const norm = {};
  statDefs.forEach(({ key }) => {
    const vals = raw[key];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    norm[key] = vals.map(v => max === min ? 50 : ((v - min) / (max - min)) * 100);
  });

  // Score each player
  const scored = players.map((player, i) => {
    let score = 0;
    statDefs.forEach(({ key, wKey }) => {
      score += norm[key][i] * (weights[wKey] || 0);
    });
    return {
      name: player[colIdx.name],
      score,
      sgTotal: player[colIdx.sgTotal],
      sgOTT:   player[colIdx.sgOTT],
      sgApp:   player[colIdx.sgApp],
      sgAtG:   player[colIdx.sgAtG],
      sgPutt:  player[colIdx.sgPutt]
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

function getWeightsForTournament(tournamentName, weightsData) {
  const headers = weightsData[0];
  let row = weightsData.find(r =>
    String(r[0]).toLowerCase().trim() === String(tournamentName).toLowerCase().trim()
  );
  if (!row) {
    row = weightsData.find(r => String(r[0]).toUpperCase().trim() === 'DEFAULT');
  }
  if (!row) return {};

  const w = {};
  for (let i = 1; i < headers.length - 1; i++) {
    w[String(headers[i])] = parseFloat(row[i]) || 0;
  }
  return w;
}

function getTournamentForWeek(scheduleSheet, weekOffset) {
  const data = scheduleSheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find this Monday
  const dow = today.getDay();
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

  const targetMonday = new Date(thisMonday);
  targetMonday.setDate(thisMonday.getDate() + weekOffset * 7);

  const hdr = data[0].map(h => String(h).toLowerCase());
  const nameCol   = hdr.findIndex(h => h.includes('event') || h.includes('tournament') || h.includes('name'));
  const courseCol = hdr.findIndex(h => h.includes('course'));
  const dateCol   = hdr.findIndex(h => h.includes('date') || h.includes('start'));

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[nameCol]) continue;
    let d = row[dateCol];
    if (!(d instanceof Date)) d = new Date(d);
    if (isNaN(d)) continue;

    d.setHours(0, 0, 0, 0);
    const rowDow = d.getDay();
    const rowMonday = new Date(d);
    rowMonday.setDate(d.getDate() - (rowDow === 0 ? 6 : rowDow - 1));

    if (rowMonday.getTime() === targetMonday.getTime()) {
      return {
        name:   row[nameCol],
        course: courseCol >= 0 ? row[courseCol] : 'TBD',
        dates:  String(row[dateCol])
      };
    }
  }
  return null;
}
