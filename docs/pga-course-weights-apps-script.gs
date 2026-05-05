function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("JoeKnowsBall")
    .addItem("Rebuild Course Weights Table", "setupCourseWeightsSheet")
    .addToUi();
}

function calculateCourseWeights(courseName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const courseStatsSheet = spreadsheet.getSheetByName("Course Stats DG");
  const courseWeightsSheet = spreadsheet.getSheetByName("Course Weights");

  if (!courseStatsSheet || !courseWeightsSheet) {
    throw new Error("Missing Course Stats DG or Course Weights tab.");
  }

  const statsValues = courseStatsSheet.getDataRange().getDisplayValues();
  const weightValues = courseWeightsSheet.getDataRange().getDisplayValues();
  const statsHeader = buildHeaderMap_(statsValues[0]);
  const weightsHeader = buildHeaderMap_(weightValues[0]);

  const defaultRow = weightValues
    .slice(1)
    .find((row) => normalizeKey_(row[weightsHeader["Tournament Name"]]) === "default");

  const defaults = {
    sgTotal: parseNumber_(defaultRow?.[weightsHeader["SG Total"]], 0.3),
    sgOTT: parseNumber_(defaultRow?.[weightsHeader["SG Off Tee"]], 0.15),
    sgApp: parseNumber_(defaultRow?.[weightsHeader["SG Approach"]], 0.2),
    sgAtG: parseNumber_(defaultRow?.[weightsHeader["SG Around Green"]], 0.1),
    sgPutt: parseNumber_(defaultRow?.[weightsHeader["SG Putting"]], 0.15),
    drivingAccuracy: parseNumber_(defaultRow?.[weightsHeader["Driving Accuracy"]], 0.03),
    bogeyAvoidance: 0.03,
    birdieBogeyRatio: 0.03,
  };

  const statsRows = statsValues.slice(1).map((row) => ({
    course: decodeHtml_(row[statsHeader.course]),
    puttSg: parseNumber_(row[statsHeader.putt_sg], 0),
    argSg: parseNumber_(row[statsHeader.arg_sg], 0),
    appSg: parseNumber_(row[statsHeader.app_sg], 0),
    ottSg: parseNumber_(row[statsHeader.ott_sg], 0),
    drivingAccuracy: parseNumber_(row[statsHeader.adj_driving_accuracy], 0),
  }));

  const matched = findBestCourseMatch_(courseName, statsRows);
  if (!matched) {
    return {
      "SG Total": defaults.sgTotal,
      "SG Off Tee": defaults.sgOTT,
      "SG Approach": defaults.sgApp,
      "SG Around Green": defaults.sgAtG,
      "SG Putting": defaults.sgPutt,
      "Driving Accuracy": defaults.drivingAccuracy,
      "Bogey Avoidance": defaults.bogeyAvoidance,
      "Birdie/Bogey Ratio": defaults.birdieBogeyRatio,
    };
  }

  const rawComponents = normalizeVector_({
    sgOTT: Math.abs(matched.ottSg),
    sgApp: Math.abs(matched.appSg),
    sgAtG: Math.abs(matched.argSg),
    sgPutt: Math.abs(matched.puttSg),
  });

  const rawBlock = normalizeVector_({
    sgTotal: (rawComponents.sgOTT + rawComponents.sgApp + rawComponents.sgAtG + rawComponents.sgPutt) / 4,
    sgOTT: rawComponents.sgOTT,
    sgApp: rawComponents.sgApp,
    sgAtG: rawComponents.sgAtG,
    sgPutt: rawComponents.sgPutt,
  });

  const defaultBlock = normalizeVector_({
    sgTotal: defaults.sgTotal,
    sgOTT: defaults.sgOTT,
    sgApp: defaults.sgApp,
    sgAtG: defaults.sgAtG,
    sgPutt: defaults.sgPutt,
  });

  const blendedBlock = normalizeVector_({
    sgTotal: rawBlock.sgTotal * 0.6 + defaultBlock.sgTotal * 0.4,
    sgOTT: rawBlock.sgOTT * 0.6 + defaultBlock.sgOTT * 0.4,
    sgApp: rawBlock.sgApp * 0.6 + defaultBlock.sgApp * 0.4,
    sgAtG: rawBlock.sgAtG * 0.6 + defaultBlock.sgAtG * 0.4,
    sgPutt: rawBlock.sgPutt * 0.6 + defaultBlock.sgPutt * 0.4,
  });

  const accuracyValues = statsRows
    .map((row) => row.drivingAccuracy)
    .filter((value) => Number.isFinite(value));
  const accuracyMin = Math.min.apply(null, accuracyValues);
  const accuracyMax = Math.max.apply(null, accuracyValues);
  const drivingAccuracy = normalizeToRange_(matched.drivingAccuracy, accuracyMin, accuracyMax, 0.02, 0.06);
  const bogeyAvoidance = 0.03;
  const birdieBogeyRatio = 0.03;
  const sgBudget = 1 - drivingAccuracy - bogeyAvoidance - birdieBogeyRatio;

  return {
    "SG Total": roundWeight_(blendedBlock.sgTotal * sgBudget),
    "SG Off Tee": roundWeight_(blendedBlock.sgOTT * sgBudget),
    "SG Approach": roundWeight_(blendedBlock.sgApp * sgBudget),
    "SG Around Green": roundWeight_(blendedBlock.sgAtG * sgBudget),
    "SG Putting": roundWeight_(blendedBlock.sgPutt * sgBudget),
    "Driving Accuracy": roundWeight_(drivingAccuracy),
    "Bogey Avoidance": roundWeight_(bogeyAvoidance),
    "Birdie/Bogey Ratio": roundWeight_(birdieBogeyRatio),
  };
}

function setupCourseWeightsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const courseStatsSheet = spreadsheet.getSheetByName("Course Stats DG");
  const courseWeightsSheet = spreadsheet.getSheetByName("Course Weights");

  if (!courseStatsSheet || !courseWeightsSheet) {
    throw new Error("Missing Course Stats DG or Course Weights tab.");
  }

  const weightValues = courseWeightsSheet.getDataRange().getDisplayValues();
  const header = weightValues[0] || [
    "Tournament Name",
    "SG Total",
    "SG Off Tee",
    "SG Approach",
    "SG Around Green",
    "SG Putting",
    "Driving Accuracy",
    "Bogey Avoidance",
    "Birdie/Bogey Ratio",
    "Notes",
  ];

  const notesIndex = header.indexOf("Notes");
  const preservedRows = weightValues
    .slice(1)
    .filter((row) => String(row[notesIndex] || "").trim().toUpperCase() !== "AUTO");

  const statsValues = courseStatsSheet.getDataRange().getDisplayValues();
  const courseHeader = buildHeaderMap_(statsValues[0]);
  const courseNames = statsValues
    .slice(1)
    .map((row) => decodeHtml_(row[courseHeader.course]))
    .filter(Boolean);

  const generatedRows = courseNames.map((courseName) => {
    const weights = calculateCourseWeights(courseName);
    return [
      courseName,
      weights["SG Total"],
      weights["SG Off Tee"],
      weights["SG Approach"],
      weights["SG Around Green"],
      weights["SG Putting"],
      weights["Driving Accuracy"],
      weights["Bogey Avoidance"],
      weights["Birdie/Bogey Ratio"],
      "AUTO",
    ];
  });

  courseWeightsSheet.clearContents();
  courseWeightsSheet.getRange(1, 1, 1, header.length).setValues([header]);
  if (preservedRows.length) {
    courseWeightsSheet.getRange(2, 1, preservedRows.length, header.length).setValues(preservedRows);
  }
  if (generatedRows.length) {
    courseWeightsSheet
      .getRange(2 + preservedRows.length, 1, generatedRows.length, header.length)
      .setValues(generatedRows);
  }
}

function getTournamentForWeek(dateOverride) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const scheduleSheet = spreadsheet.getSheetByName("2026 Schedule DG");
  if (!scheduleSheet) {
    throw new Error("Missing 2026 Schedule DG tab.");
  }

  const values = scheduleSheet.getDataRange().getDisplayValues();
  const header = buildHeaderMap_(values[0]);
  const referenceDate = dateOverride ? new Date(dateOverride) : new Date();
  const isoReference = Utilities.formatDate(referenceDate, "UTC", "yyyy-MM-dd");

  const upcoming = values
    .slice(1)
    .map((row) => ({
      startDate: row[header.start_date],
      tour: row[header.tour],
      name: row[header.event_name],
      course: row[header.course],
      status: row[header.status],
    }))
    .filter((row) => /pga|major/i.test(row.tour))
    .filter((row) => row.startDate >= isoReference)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  return upcoming
    ? { name: upcoming.name, course: upcoming.course, startDate: upcoming.startDate }
    : null;
}

function _buildTournamentModel() {
  const tournament = getTournamentForWeek();
  if (!tournament) {
    throw new Error("No upcoming tournament found in 2026 Schedule DG.");
  }

  const weights = calculateCourseWeights(tournament.course);

  return {
    tournamentName: tournament.name,
    course: tournament.course,
    weights: weights,
  };
}

function buildHeaderMap_(headerRow) {
  const header = {};
  headerRow.forEach((value, index) => {
    header[String(value).trim()] = index;
  });
  return header;
}

function parseNumber_(value, fallback) {
  const numeric = parseFloat(String(value || "").trim());
  return Number.isFinite(numeric) ? numeric : fallback;
}

function decodeHtml_(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ");
}

function normalizeKey_(value) {
  return decodeHtml_(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findBestCourseMatch_(courseName, rows) {
  const target = normalizeKey_(courseName);
  let bestRow = null;
  let bestScore = 0;

  rows.forEach((row) => {
    const candidate = normalizeKey_(row.course);
    let score = 0;
    if (candidate === target) {
      score = 100;
    } else if (candidate.indexOf(target) > -1 || target.indexOf(candidate) > -1) {
      score = 80;
    } else {
      const targetTokens = target.split(" ");
      const candidateTokens = candidate.split(" ");
      const overlap = targetTokens.filter((token) => candidateTokens.indexOf(token) > -1).length;
      score = overlap / Math.max(targetTokens.length, candidateTokens.length, 1);
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  });

  return bestScore >= 0.4 ? bestRow : null;
}

function normalizeVector_(vector) {
  const total = Object.keys(vector).reduce((sum, key) => sum + vector[key], 0);
  if (total <= 0) {
    return vector;
  }

  const nextVector = {};
  Object.keys(vector).forEach((key) => {
    nextVector[key] = vector[key] / total;
  });
  return nextVector;
}

function normalizeToRange_(value, min, max, nextMin, nextMax) {
  if (max === min) {
    return (nextMin + nextMax) / 2;
  }
  const ratio = (value - min) / (max - min);
  return nextMin + ratio * (nextMax - nextMin);
}

function roundWeight_(value) {
  return Math.round(value * 1000000) / 1000000;
}
