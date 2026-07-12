const MINIMUM_EXPECTED_HTML_LENGTH = 4000;
const REGRESSION_PLAYER_NAMES = new Set(["avg", "obp", "slg", "ops", "nym", "lad", "sd", "tor"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMarker(html, marker) {
  return (html.match(new RegExp(`${escapeRegExp(marker)}="true"`, "g")) ?? []).length;
}

function countPlayerMarker(html, marker, playerName) {
  const escapedName = escapeRegExp(escapeHtml(playerName));
  return (html.match(new RegExp(`${escapeRegExp(marker)}="true"[^>]*data-player-name="${escapedName}"`, "g")) ?? []).length;
}

function countMappedMarker(html, marker, play) {
  const playerName = escapeRegExp(escapeHtml(play.player));
  const opposingPitcher = escapeRegExp(escapeHtml(play.opposingPitcher || ""));
  const score = escapeRegExp(escapeHtml(play.numerologyScore));
  return (html.match(new RegExp(`${escapeRegExp(marker)}="true"[^>]*data-player-name="${playerName}"[^>]*data-opposing-pitcher="${opposingPitcher}"[^>]*data-numerology-score="${score}"`, "g")) ?? []).length;
}

export function validateNumerologyEmailHtml(html, card, { minimumLength = MINIMUM_EXPECTED_HTML_LENGTH } = {}) {
  const errors = [];
  const selected = Array.isArray(card?.emailSelectedPlays) ? card.emailSelectedPlays : [];
  const source = String(html ?? "");
  const summaryCount = countMarker(source, "data-numerology-summary-entry");
  const detailedCount = countMarker(source, "data-numerology-play-card");

  if (!source.trim()) errors.push("Email HTML is empty.");
  if (source.length < minimumLength) errors.push(`Email HTML is unexpectedly small (${source.length} characters; minimum ${minimumLength}).`);
  if (!source.includes('data-numerology-header="true"') || !source.includes("Joe Knows Ball") || !source.includes(`MLB Numerology Plays — ${escapeHtml(card?.date)}`)) {
    errors.push("Branded Numerology header is missing.");
  }
  if (summaryCount !== selected.length) errors.push(`Summary-card count ${summaryCount} does not match selected-play count ${selected.length}.`);
  if (detailedCount !== selected.length) errors.push(`Detailed-card count ${detailedCount} does not match selected-play count ${selected.length}.`);

  for (const play of selected) {
    if (!source.includes(escapeHtml(play.player))) errors.push(`Selected player is absent from HTML: ${play.player}.`);
    if (countPlayerMarker(source, "data-numerology-summary-entry", play.player) !== 1) errors.push(`Selected player must appear exactly once in the summary: ${play.player}.`);
    if (countPlayerMarker(source, "data-numerology-play-card", play.player) !== 1) errors.push(`Selected player must appear exactly once in detailed cards: ${play.player}.`);
    if (countMappedMarker(source, "data-numerology-summary-entry", play) !== 1) errors.push(`Summary field mapping is malformed for ${play.player}.`);
    if (countMappedMarker(source, "data-numerology-play-card", play) !== 1) errors.push(`Detailed field mapping is malformed for ${play.player}.`);
  }

  if (/Opposing pitcher:\s*OPS\b/i.test(source)) errors.push("Malformed mapping detected: Opposing pitcher: OPS.");
  if (/data-opposing-pitcher="OPS"/i.test(source)) errors.push("Malformed mapping detected: OPS rendered as an opposing pitcher.");
  const renderedPlayerNames = Array.from(source.matchAll(/data-player-name="([^"]*)"/g), (match) => match[1].trim().toLowerCase());
  if (renderedPlayerNames.some((name) => REGRESSION_PLAYER_NAMES.has(name))) errors.push("Malformed mapping detected in a rendered player identity.");

  const detailsIndex = source.indexOf('data-numerology-details="true"');
  const trackingIndex = source.indexOf('data-numerology-tracking="true"');
  const footerIndex = source.indexOf('data-numerology-footer="true"');
  if (detailsIndex < 0 || trackingIndex < 0 || footerIndex < 0 || !(detailsIndex < trackingIndex && trackingIndex < footerIndex)) {
    errors.push("Email section order must be player details, Tracking Snapshot, then footer.");
  }
  const trackingEnd = trackingIndex >= 0 ? source.indexOf("</tbody>", trackingIndex) : -1;
  if (trackingEnd < 0 || trackingEnd > footerIndex) errors.push("Tracking Snapshot must end before the footer begins.");
  const footerEnd = footerIndex >= 0 ? source.indexOf("</tbody>", footerIndex) : -1;
  const footerHtml = footerIndex >= 0 && footerEnd > footerIndex ? source.slice(footerIndex, footerEnd) : "";
  if (/Previous Day|All tracked slates|All Qualifying Plays|data-numerology-tracking/i.test(footerHtml)) {
    errors.push("Footer contains tracking results or performance buckets.");
  }

  return { valid: errors.length === 0, errors, summaryCount, detailedCount };
}

export function assertValidNumerologyEmailHtml(html, card, options) {
  const result = validateNumerologyEmailHtml(html, card, options);
  if (!result.valid) throw new Error(`Numerology email validation failed:\n- ${result.errors.join("\n- ")}`);
  return result;
}
