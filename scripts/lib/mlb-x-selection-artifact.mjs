/**
 * mlb-x-selection-artifact.mjs
 *
 * The ONE immutable per-attempt selection artifact. After the readiness gate
 * decides a post is ready, the poster freezes the exact selected rows into
 * this artifact and EVERYTHING downstream -- the bare export route that gets
 * screenshotted AND the caption -- is built from it. Nothing re-selects or
 * re-scrapes a live table afterward, which is what prevents time-of-check /
 * time-of-use drift (the screenshot can never show a different set of players
 * than the gate confirmed).
 *
 * The artifact travels to the export route as a URL-safe base64 query param
 * (`?d=`), so the render is a pure function of the artifact -- no committed or
 * deployed selection file, no shared mutable state. encode/decode work in both
 * Node (poster) and the browser (export route): a single module both import.
 *
 * Before any X API call the poster calls assertArtifactConsistency() to prove
 * the rendered rows and the caption rows are exactly the artifact rows, in the
 * same order, with matching side/odds. Any divergence fails closed with
 * finalStatus=FAILED_ARTIFACT_SELECTION_MISMATCH and no post occurs.
 */

export const ARTIFACT_MISMATCH_STATUS = "FAILED_ARTIFACT_SELECTION_MISMATCH";
export const DEFAULT_MAX_CONFIRMATION_AGE_MINUTES = 20;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// base64url encode/decode (works in Node and the browser)
// ---------------------------------------------------------------------------

function toBase64Url(text) {
  let b64;
  if (typeof Buffer !== "undefined") {
    b64 = Buffer.from(text, "utf8").toString("base64");
  } else {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    b64 = btoa(binary);
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded) {
  const b64 = String(encoded).replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeArtifact(artifact) {
  return toBase64Url(JSON.stringify(artifact));
}

export function decodeArtifact(encoded) {
  const artifact = JSON.parse(fromBase64Url(encoded));
  if (!artifact || typeof artifact !== "object" || !Array.isArray(artifact.rows)) {
    throw new Error("Decoded artifact is malformed (missing rows[]).");
  }
  return artifact;
}

// ---------------------------------------------------------------------------
// Row identity (stable, used by consistency assertions)
// ---------------------------------------------------------------------------

/** Stringify an id/value that may be a number (artifact) or a string (scraped DOM attr). */
function idPart(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).trim();
}

/** Stable identity for a row: id-based where possible so render/caption can be matched deterministically. */
export function getRowIdentity(contentType, row) {
  const gameId = idPart(row?.gameId) || "?";
  if (contentType === "k") {
    const pid = idPart(row?.pitcherId) || idPart(row?.pitcher).toLowerCase();
    return `${pid}|${gameId}|${idPart(row?.side).toUpperCase()}`;
  }
  const pid = idPart(row?.playerId) || idPart(row?.player).toLowerCase();
  return `${pid}|${gameId}`;
}

// ---------------------------------------------------------------------------
// Artifact builders
// ---------------------------------------------------------------------------

function baseArtifact({ contentType, slateDate, snapshot, selectionStatus }) {
  const timing = snapshot?.timing ?? {};
  return {
    contentType,
    slateDate,
    generatedAt: new Date().toISOString(),
    confirmationAsOf: snapshot?.asOf ?? null,
    earliestFirstPitch: timing.earliestGameTime ?? null,
    minutesUntilFirstPitch: timing.minutesUntilFirstPitch ?? null,
    phase: timing.phase ?? null,
    selectionStatus,
    rows: [],
  };
}

/** HR artifact rows carry everything the export table + caption + verification need. */
export function buildHrArtifact({ slateDate, snapshot, selectedRows = [], selectionStatus }) {
  const artifact = baseArtifact({ contentType: "hr", slateDate, snapshot, selectionStatus });
  artifact.rows = selectedRows.map((row, index) => ({
    rank: index + 1,
    playerId: row.playerId ?? null,
    gameId: row.gameId ?? null,
    player: normalizeText(row.player),
    team: normalizeText(row.team).toUpperCase(),
    opponent: normalizeText(row.opponent).toUpperCase(),
    battingOrder: toFiniteNumber(row.battingOrder),
    hrScore: toFiniteNumber(row.hrScore),
    hrOddsYes: normalizeText(row.hrOddsYes) || null,
    opposingPitcher: normalizeText(row.opposingPitcher) || null,
  }));
  return artifact;
}

/** K artifact rows carry the favored side + the side-correct odds. */
export function buildKArtifact({ slateDate, snapshot, selectedRows = [], selectionStatus }) {
  const artifact = baseArtifact({ contentType: "k", slateDate, snapshot, selectionStatus });
  artifact.rows = selectedRows.map((row, index) => {
    const side = normalizeText(row.direction || row.side).toUpperCase();
    const odds = side === "UNDER" ? normalizeText(row.oddsUnder) : normalizeText(row.oddsOver);
    return {
      rank: index + 1,
      pitcherId: row.pitcherId ?? null,
      gameId: row.gameId ?? null,
      pitcher: normalizeText(row.pitcher),
      team: normalizeText(row.team).toUpperCase(),
      opponent: normalizeText(row.opponent).toUpperCase(),
      side,
      kLine: toFiniteNumber(row.kLine),
      odds: odds || null,
      projectedKs: toFiniteNumber(row.projectedKs),
      projectionEdge: toFiniteNumber(row.projectionEdge),
      bookmaker: normalizeText(row.bookmaker) || null,
    };
  });
  return artifact;
}

// ---------------------------------------------------------------------------
// Validation + consistency
// ---------------------------------------------------------------------------

/** Structural/freshness validation of the artifact itself. Returns "" when OK. */
export function validateArtifact(artifact, { slateDate, now = new Date(), maxAgeMinutes = DEFAULT_MAX_CONFIRMATION_AGE_MINUTES } = {}) {
  if (!artifact || typeof artifact !== "object") return "Artifact is missing.";
  if (!Array.isArray(artifact.rows)) return "Artifact rows are missing.";
  if (slateDate && artifact.slateDate !== slateDate) {
    return `Artifact slate date ${artifact.slateDate} does not match expected ${slateDate}.`;
  }

  // Duplicate identities are never allowed -- a row can only appear once.
  const seen = new Set();
  for (const row of artifact.rows) {
    const id = getRowIdentity(artifact.contentType, row);
    if (seen.has(id)) return `Artifact contains duplicate row identity ${id}.`;
    seen.add(id);
  }

  // Stale confirmation snapshot fails closed.
  const asOfMs = artifact.confirmationAsOf ? new Date(artifact.confirmationAsOf).getTime() : NaN;
  if (!Number.isFinite(asOfMs)) return "Artifact confirmationAsOf is missing or invalid.";
  const ageMinutes = (new Date(now).getTime() - asOfMs) / 60_000;
  if (ageMinutes > maxAgeMinutes) {
    return `Artifact confirmation is stale: ${ageMinutes.toFixed(1)} min old (max ${maxAgeMinutes}).`;
  }
  return "";
}

function identityList(contentType, rows) {
  return rows.map((row) => getRowIdentity(contentType, row));
}

/**
 * Prove the rendered screenshot rows and the caption rows are EXACTLY the
 * artifact rows -- same set, same order, matching side/odds. Any divergence
 * returns an error string (the caller maps it to FAILED_ARTIFACT_SELECTION_
 * MISMATCH and refuses to post).
 *
 * @param {object} params
 * @param {object} params.artifact
 * @param {Array<object>} params.renderedRows  scraped from the export DOM (data-* attrs)
 * @param {Array<object>} params.captionRows   rows the caption was built from
 */
export function assertArtifactConsistency({ artifact, renderedRows = [], captionRows = [] }) {
  const contentType = artifact?.contentType;
  const artifactIds = identityList(contentType, artifact.rows);

  if (renderedRows.length !== artifact.rows.length) {
    return `Rendered row count ${renderedRows.length} != selected ${artifact.rows.length}.`;
  }
  if (captionRows.length !== artifact.rows.length) {
    return `Caption row count ${captionRows.length} != selected ${artifact.rows.length}.`;
  }

  const renderedIds = identityList(contentType, renderedRows);
  const captionIds = identityList(contentType, captionRows);

  // Order-identical comparison (also guarantees the same set + no extras).
  for (let i = 0; i < artifactIds.length; i++) {
    if (renderedIds[i] !== artifactIds[i]) {
      return `Rendered row ${i + 1} identity ${renderedIds[i]} != selected ${artifactIds[i]} (order/content mismatch).`;
    }
    if (captionIds[i] !== artifactIds[i]) {
      return `Caption row ${i + 1} identity ${captionIds[i]} != selected ${artifactIds[i]} (order/content mismatch).`;
    }
  }

  // Side + odds must match for K (direction/odds correctness is safety-critical).
  if (contentType === "k") {
    for (let i = 0; i < artifact.rows.length; i++) {
      const sel = artifact.rows[i];
      const rendered = renderedRows[i];
      if (normalizeText(rendered.side).toUpperCase() !== normalizeText(sel.side).toUpperCase()) {
        return `Rendered row ${i + 1} side ${rendered.side} != selected ${sel.side}.`;
      }
      if (normalizeText(rendered.odds) !== normalizeText(sel.odds)) {
        return `Rendered row ${i + 1} odds ${rendered.odds} != selected ${sel.odds}.`;
      }
    }
  }

  return "";
}
