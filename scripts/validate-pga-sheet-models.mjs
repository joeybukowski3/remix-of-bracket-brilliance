import { createSign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertModelPayload,
  assertNoUnsafeRegression,
  buildScheduleContext,
  buildValidatedModelPayload,
  calculateFieldDiagnostics,
  normalizeModelKey,
  parseEmbeddedReferenceDate,
  validateSheetSource,
} from "./lib/pga-sheet-model-validation.mjs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SITE_OUTPUT_TAB_NAME = "SITE OUTPUT";
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(repoRoot, relativePath), "utf8"));
}

function writeJson(relativePath, payload) {
  writeFileSync(path.resolve(repoRoot, relativePath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth-grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth token request failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Google OAuth token response did not include an access token.");
  return data.access_token;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function fetchSiteOutputRows() {
  const fixture = process.env.PGA_SITE_OUTPUT_FIXTURE;
  if (fixture) return JSON.parse(readFileSync(path.resolve(fixture), "utf8"));

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID environment variable for sheet-source validation.");
  const rawServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (rawServiceAccount) {
    const serviceAccount = JSON.parse(rawServiceAccount);
    const token = await getAccessToken(serviceAccount);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(SITE_OUTPUT_TAB_NAME)}?majorDimension=ROWS`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Sheets request failed (${response.status}): ${await response.text()}`);
    const data = await response.json();
    return Array.isArray(data.values) ? data.values : [];
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SITE_OUTPUT_TAB_NAME)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Public Google Sheets CSV request failed (${response.status}): ${await response.text()}`);
  return parseCsv(await response.text());
}

function previousPayload(relativePath) {
  try {
    return JSON.parse(execFileSync("git", ["show", `HEAD:${relativePath}`], { cwd: repoRoot, encoding: "utf8" }));
  } catch {
    return null;
  }
}

function assertFieldMatchesExpected(field, expected) {
  if (!field?.tournament || !expected?.name) return;
  if (normalizeModelKey(field.tournament) !== normalizeModelKey(expected.name)) {
    throw new Error(`Official field is for ${field.tournament}, but today's schedule expects ${expected.name}.`);
  }
}

async function main() {
  const today = process.env.PGA_REFERENCE_DATE ?? new Date().toISOString().slice(0, 10);
  const generatedAt = new Date().toISOString();
  const schedule = readJson("public/data/pga/schedule.json");
  const field = readJson("public/data/pga/current-field.json");
  const rawCurrent = readJson("public/data/pga/current-tournament.json");
  const rawNext = readJson("public/data/pga/next-tournament.json");
  const sheetRows = await fetchSiteOutputRows();
  const sourceReferenceDate = parseEmbeddedReferenceDate(sheetRows);
  const expectedContext = buildScheduleContext(schedule, today);
  const sourceContext = sourceReferenceDate
    ? buildScheduleContext(schedule, sourceReferenceDate)
    : { currentUpcoming: null, nextWeek: null };

  assertFieldMatchesExpected(field, expectedContext.currentUpcoming);

  const sections = [
    ["current-tournament", "public/data/pga/current-tournament.json", rawCurrent],
    ["next-tournament", "public/data/pga/next-tournament.json", rawNext],
  ];

  for (const [section, relativePath, rawPayload] of sections) {
    const validation = validateSheetSource({
      section,
      expectedContext,
      sourceContext,
      sourceReferenceDate,
      today,
    });
    const diagnostics = section === "current-tournament"
      ? calculateFieldDiagnostics(rawPayload.rows, field.players)
      : null;
    const payload = buildValidatedModelPayload({
      section,
      rawPayload,
      validation,
      generatedAt,
      fieldDiagnostics: diagnostics,
    });

    assertModelPayload(payload);
    assertNoUnsafeRegression(previousPayload(relativePath), payload);
    writeJson(relativePath, payload);

    console.log(`[pga-sheet-source] ${section}`);
    console.log(`  Expected: ${validation.expected?.name ?? "none"}`);
    console.log(`  Sheet source: ${validation.source?.name ?? "untrusted"}`);
    console.log(`  Sheet reference date: ${sourceReferenceDate ?? "missing"}`);
    console.log(`  Source validated: ${payload.sourceValidated}`);
    console.log(`  Published rows: ${payload.rows.length}`);
    if (diagnostics) {
      console.log(`  Field overlap: ${diagnostics.matchedPlayerCount} matched, ${diagnostics.unmatchedModelPlayerCount} unmatched, ${diagnostics.missingOfficialPlayerCount} missing`);
    }
    if (payload.sourceValidationErrors.length > 0) {
      payload.sourceValidationErrors.forEach((error) => console.log(`  Withheld: ${error}`));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
