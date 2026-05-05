import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_COLUMNS = [
  { key: "rank", label: "Rank" },
  { key: "player", label: "Player" },
  { key: "modelScore", label: "Model Score" },
  { key: "sgTotal", label: "SG Total" },
  { key: "sgOtt", label: "SG OTT" },
  { key: "sgApp", label: "SG APP" },
  { key: "sgAtg", label: "SG ATG" },
  { key: "sgPutt", label: "SG PUTT" },
];

const SECTION_CONFIG = [
  {
    title: "POWER RANKINGS",
    slug: "power-rankings",
    outputPath: "public/data/pga/power-rankings.json",
  },
  {
    title: "CURRENT TOURNAMENT MODEL",
    slug: "current-tournament",
    outputPath: "public/data/pga/current-tournament.json",
  },
  {
    title: "NEXT WEEK TOURNAMENT MODEL",
    slug: "next-tournament",
    outputPath: "public/data/pga/next-tournament.json",
  },
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SITE_OUTPUT_TAB_NAME = "SITE OUTPUT";
const SCHEDULE_TAB_NAME = "2026 Schedule DG";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function normalizeCell(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeEventKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\[.*?\]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isBlankRow(row) {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buffer.toString("base64url");
}

function signJwt(unsignedToken, privateKey) {
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  return signer.sign(privateKey, "base64url");
}

async function getAccessToken(serviceAccount) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    exp: issuedAt + 3600,
    iat: issuedAt,
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const assertion = `${unsignedToken}.${signJwt(unsignedToken, serviceAccount.private_key)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google OAuth token request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Google OAuth token response did not include an access token.");
  }

  return data.access_token;
}

async function fetchSheetRowsViaApi(sheetId, tabName, accessToken) {
  const range = encodeURIComponent(tabName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return Array.isArray(data.values) ? data.values : [];
}

async function fetchSheetRowsViaPublicCsv(sheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Public Google Sheets CSV request failed (${response.status}): ${detail}`);
  }

  const csvText = await response.text();
  return parseCsv(csvText);
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

async function loadSheetRows(sheetId, tabName, serviceAccount) {
  if (serviceAccount) {
    const accessToken = await getAccessToken(serviceAccount);
    return fetchSheetRowsViaApi(sheetId, tabName, accessToken);
  }

  return fetchSheetRowsViaPublicCsv(sheetId, tabName);
}

function buildHeaderIndexMap(headerRow) {
  const normalizedHeader = headerRow.map((cell) => normalizeCell(cell));
  const indexMap = {};

  for (const column of REQUIRED_COLUMNS) {
    const index = normalizedHeader.findIndex((cell) => cell === normalizeCell(column.label));
    if (index === -1) {
      throw new Error(`Missing required column "${column.label}" in SITE OUTPUT.`);
    }
    indexMap[column.key] = index;
  }

  return indexMap;
}

function parseRank(value, fallbackRank) {
  const numeric = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(numeric) ? numeric : fallbackRank;
}

function findSectionStartIndexes(rows) {
  const startIndexBySlug = new Map();

  rows.forEach((row, index) => {
    const firstNonEmptyCell = row.find((cell) => String(cell ?? "").trim() !== "");
    const normalized = normalizeCell(firstNonEmptyCell);
    const section = SECTION_CONFIG.find((entry) => normalizeCell(entry.title) === normalized);
    if (section) {
      startIndexBySlug.set(section.slug, index);
    }
  });

  return startIndexBySlug;
}

function parseSectionFromExplicitHeaders(rows, section, sectionStartIndex, sectionEndIndex, metadataBySection) {
  const slice = rows.slice(sectionStartIndex, sectionEndIndex);
  if (slice.length === 0) {
    throw new Error(`Section "${section.title}" is empty.`);
  }

  const headerRowIndex = slice.findIndex((row) => {
    const normalized = row.map((cell) => normalizeCell(cell));
    return REQUIRED_COLUMNS.every((column) => normalized.includes(normalizeCell(column.label)));
  });

  if (headerRowIndex === -1) {
    throw new Error(`Could not find the column header row for "${section.title}".`);
  }

  const headerRow = slice[headerRowIndex];
  const indexMap = buildHeaderIndexMap(headerRow);
  const dataRows = slice.slice(headerRowIndex + 1).filter((row) => !isBlankRow(row));
  const metadata = metadataBySection[section.slug] ?? {};

  const rowsOut = dataRows
    .map((row, rowIndex) => {
      const player = String(row[indexMap.player] ?? "").trim();
      const modelScore = String(row[indexMap.modelScore] ?? "").trim();

      if (!player && !modelScore) {
        return null;
      }

      return {
        rank: parseRank(row[indexMap.rank], rowIndex + 1),
        player,
        modelScore,
        sgTotal: String(row[indexMap.sgTotal] ?? "").trim(),
        sgOtt: String(row[indexMap.sgOtt] ?? "").trim(),
        sgApp: String(row[indexMap.sgApp] ?? "").trim(),
        sgAtg: String(row[indexMap.sgAtg] ?? "").trim(),
        sgPutt: String(row[indexMap.sgPutt] ?? "").trim(),
      };
    })
    .filter(Boolean);

  return {
    section: section.slug,
    title: section.title,
    tournamentName: metadata.tournamentName ?? "",
    courseName: metadata.courseName ?? "",
    generatedAt: new Date().toISOString(),
    rows: rowsOut,
  };
}

function extractRepeatedTables(rows) {
  const tables = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const firstNonEmptyCell = row.find((cell) => String(cell ?? "").trim() !== "");
    if (normalizeCell(firstNonEmptyCell) !== "PLAYER") continue;

    const tableRows = [];
    for (let dataIndex = index + 1; dataIndex < rows.length; dataIndex += 1) {
      const dataRow = rows[dataIndex];
      const nextFirstNonEmpty = dataRow.find((cell) => String(cell ?? "").trim() !== "");
      const normalizedNext = normalizeCell(nextFirstNonEmpty);

      if (normalizedNext === "PLAYER") {
        index = dataIndex - 1;
        break;
      }

      if (isBlankRow(dataRow)) {
        continue;
      }

      const rankValue = String(dataRow[0] ?? "").trim();
      const playerValue = String(dataRow[1] ?? "").trim();
      const modelScoreValue = String(dataRow[2] ?? "").trim();

      if (!rankValue && !playerValue && !modelScoreValue) {
        continue;
      }

      const rank = Number.parseInt(rankValue, 10);
      if (!Number.isFinite(rank) || !playerValue) {
        continue;
      }

      tableRows.push({
        rank,
        player: playerValue,
        modelScore: modelScoreValue,
        sgTotal: String(dataRow[3] ?? "").trim(),
        sgOtt: String(dataRow[4] ?? "").trim(),
        sgApp: String(dataRow[5] ?? "").trim(),
        sgAtg: String(dataRow[6] ?? "").trim(),
        sgPutt: String(dataRow[7] ?? "").trim(),
      });
    }

    if (tableRows.length > 0) {
      tables.push(tableRows);
    }
  }

  return tables;
}

function parseReferenceDate(rows) {
  const datePattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const match = String(cell ?? "").match(datePattern);
      if (!match) continue;

      const month = match[1].padStart(2, "0");
      const day = match[2].padStart(2, "0");
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function mapRepeatedTablesToSections(rows, scheduleContext) {
  const tables = extractRepeatedTables(rows);
  if (tables.length < 3) {
    throw new Error(`Expected 3 repeated player tables in SITE OUTPUT, found ${tables.length}.`);
  }

  return SECTION_CONFIG.map((section, index) => {
    const metadata =
      section.slug === "next-tournament"
        ? scheduleContext.nextWeek
        : scheduleContext.currentUpcoming;

    return {
      section: section.slug,
      title: section.title,
      tournamentName: metadata?.name ?? "",
      courseName: metadata?.courseName ?? "",
      generatedAt: new Date().toISOString(),
      rows: tables[index] ?? [],
    };
  });
}

function parseSiteOutputRows(rows, scheduleContext) {
  const sectionStartIndexes = findSectionStartIndexes(rows);

  if (sectionStartIndexes.size === SECTION_CONFIG.length) {
    const metadataBySection = {
      "power-rankings": {
        tournamentName: scheduleContext.currentUpcoming?.name ?? "",
        courseName: scheduleContext.currentUpcoming?.courseName ?? "",
      },
      "current-tournament": {
        tournamentName: scheduleContext.currentUpcoming?.name ?? "",
        courseName: scheduleContext.currentUpcoming?.courseName ?? "",
      },
      "next-tournament": {
        tournamentName: scheduleContext.nextWeek?.name ?? "",
        courseName: scheduleContext.nextWeek?.courseName ?? "",
      },
    };

    return SECTION_CONFIG.map((section, index) => {
      const sectionStartIndex = sectionStartIndexes.get(section.slug);
      const nextSection = SECTION_CONFIG[index + 1];
      const sectionEndIndex = nextSection ? sectionStartIndexes.get(nextSection.slug) : rows.length;

      if (typeof sectionStartIndex !== "number" || typeof sectionEndIndex !== "number") {
        throw new Error(`Could not determine bounds for "${section.title}".`);
      }

      return parseSectionFromExplicitHeaders(rows, section, sectionStartIndex, sectionEndIndex, metadataBySection);
    });
  }

  return mapRepeatedTablesToSections(rows, scheduleContext);
}

function toSlug(value) {
  return normalizeEventKey(value).replace(/\s+/g, "-");
}

function buildLocalScheduleLookup() {
  const localSchedulePath = path.resolve(repoRoot, "src/data/pga/schedule.json");
  const localSchedule = JSON.parse(readFileSync(localSchedulePath, "utf8"));

  return new Map(
    localSchedule.map((entry) => [normalizeEventKey(entry.name), entry]),
  );
}

function parseScheduleRows(rows) {
  if (rows.length < 2) {
    throw new Error(`The "${SCHEDULE_TAB_NAME}" tab returned no schedule rows.`);
  }

  const headers = rows[0].map((cell) => String(cell ?? "").trim());
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const localScheduleLookup = buildLocalScheduleLookup();

  const scheduleRows = rows
    .slice(1)
    .map((row) => ({
      startDate: String(row[headerIndex.start_date] ?? "").trim(),
      season: Number.parseInt(String(row[headerIndex.season] ?? "0"), 10),
      tour: String(row[headerIndex.tour] ?? "").trim(),
      eventName: String(row[headerIndex.event_name] ?? "").trim().replace(/\u00a0/g, " "),
      country: String(row[headerIndex.country] ?? "").trim(),
      course: String(row[headerIndex.course] ?? "").trim(),
      status: String(row[headerIndex.status] ?? "").trim(),
      winner: String(row[headerIndex.winner] ?? "").trim(),
    }))
    .filter((row) => row.startDate && row.eventName)
    .filter((row) => row.tour.includes("pga") || row.tour === "major")
    .sort((left, right) => left.startDate.localeCompare(right.startDate));

  return scheduleRows.map((row) => {
    const localEntry = localScheduleLookup.get(normalizeEventKey(row.eventName)) ?? null;
    const eventType = localEntry?.eventType ?? deriveEventType(row);

    return {
      id: localEntry?.id ?? toSlug(row.eventName),
      slug: localEntry?.slug ?? toSlug(row.eventName),
      name: localEntry?.name ?? row.eventName,
      shortName: localEntry?.shortName ?? row.eventName,
      courseName: localEntry?.courseName ?? row.course,
      location: localEntry?.location ?? row.country,
      startDate: row.startDate,
      endDate: localEntry?.endDate ?? row.startDate,
      dateLabel: formatScheduleDateLabel(row.startDate, localEntry?.endDate ?? row.startDate),
      eventType,
      category: mapEventTypeToCategory(eventType),
      status: row.status,
      winner: row.winner,
      dataFile: localEntry?.dataFile ?? "",
      sourceTour: row.tour,
      sourceCountry: row.country,
    };
  });
}

function deriveEventType(row) {
  if (row.tour === "major") return "Major Championship";
  if (normalizeEventKey(row.eventName).includes("cadillac championship")) return "WGC";
  return "PGA TOUR Event";
}

function mapEventTypeToCategory(eventType) {
  if (eventType === "Major Championship") return "major";
  if (eventType === "WGC") return "wgc";
  if (eventType === "Signature Event") return "signature";
  return "standard";
}

function formatScheduleDateLabel(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  const startMonth = start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = end.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }

  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

function buildScheduleContext(scheduleRows, referenceDate) {
  const currentUpcoming = scheduleRows.find((entry) => entry.startDate >= referenceDate) ?? scheduleRows.at(-1) ?? null;
  const nextWeek = currentUpcoming
    ? scheduleRows.find((entry) => entry.startDate > currentUpcoming.startDate) ?? null
    : null;

  return {
    currentUpcoming,
    nextWeek,
  };
}

async function writeJsonFile(relativePath, payload) {
  const targetPath = path.resolve(repoRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const rawServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID environment variable.");
  }

  const serviceAccount = rawServiceAccount ? JSON.parse(rawServiceAccount) : null;
  const siteOutputRows = await loadSheetRows(sheetId, SITE_OUTPUT_TAB_NAME, serviceAccount);
  const scheduleRowsRaw = await loadSheetRows(sheetId, SCHEDULE_TAB_NAME, serviceAccount);

  if (siteOutputRows.length === 0) {
    throw new Error(`The "${SITE_OUTPUT_TAB_NAME}" tab returned no rows.`);
  }

  const referenceDate = parseReferenceDate(siteOutputRows);
  const scheduleRows = parseScheduleRows(scheduleRowsRaw);
  const scheduleContext = buildScheduleContext(scheduleRows, referenceDate);
  const parsedSections = parseSiteOutputRows(siteOutputRows, scheduleContext);

  await Promise.all([
    ...SECTION_CONFIG.map((section) => {
      const payload = parsedSections.find((entry) => entry.section === section.slug);
      if (!payload) {
        throw new Error(`Missing parsed payload for ${section.slug}.`);
      }
      return writeJsonFile(section.outputPath, payload);
    }),
    writeJsonFile("public/data/pga/schedule.json", scheduleRows),
  ]);

  for (const section of parsedSections) {
    console.log(`Wrote ${section.rows.length} rows to ${section.section}`);
  }
  console.log(`Wrote ${scheduleRows.length} schedule rows to public/data/pga/schedule.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
