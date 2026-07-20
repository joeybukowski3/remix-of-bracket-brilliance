/**
 * Pure, browser-safe transformation from a numerology daily card (see
 * mlb-numerology-tracking.mjs's buildDailyNumerologyCard) into the compact,
 * human-readable shape the X post graphic and caption are built from.
 *
 * No Node-only imports here on purpose: this module is imported directly by
 * both the Node generator script and the React export component/tests, so a
 * table row can never drift out of sync with what the graphic renders.
 */

const MAX_OTHERS_DISPLAYED = 10;

// Maps a numerology signal's raw `field` to the casual vocabulary the task
// spec asks for. Anything not in this map falls back to a generic label
// rather than inventing a category for a field this repo's model doesn't
// currently produce.
const FIELD_LABELS = {
  age: "Age Match",
  birthDay: "Birth Day Alignment",
  jersey: "Jersey Match",
  lifePath: "Root Match",
  expression: "Expression Match",
  personalDay: "Personal Day Match",
  playerId: "Player ID Match",
  gameKey: "Contextual Echo",
  team: "Team Number Match",
  opponent: "Opponent Number Match",
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** One human-readable chip for a single numerology signal, e.g. "Birth Day Alignment — Born on day 26". Never fabricates a label the source data didn't provide. */
export function describeSignalChip(signal) {
  const category = FIELD_LABELS[signal?.field] ?? "Numerology Match";
  const detail = normalizeText(signal?.label) || normalizeText(signal?.detail);
  return detail ? `${category} — ${detail}` : category;
}

/** Up to `limit` chip strings for a play, most-informative signals first (as already ordered by the model). */
export function buildSignalChips(play, limit = 5) {
  const signals = Array.isArray(play?.numerologySignals) ? play.numerologySignals : [];
  return signals.slice(0, limit).map(describeSignalChip);
}

function roundOrNull(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

/** Trims a play down to only the fields the graphic/caption actually render. */
export function buildPlayCardSummary(play, { chipLimit = 5 } = {}) {
  if (!play) return null;
  const team = normalizeText(play.team).toUpperCase();
  const opponent = normalizeText(play.opponent).toUpperCase();
  return {
    player: normalizeText(play.player),
    team,
    opponent,
    matchup: team && opponent ? `${team} vs ${opponent}` : "",
    numerologyScore: roundOrNull(play.numerologyScore, 0),
    modelRating: roundOrNull(play.modelRating ?? play.baseballScore, 0),
    matchType: normalizeText(play.matchType) || "Numerology Match",
    chips: buildSignalChips(play, chipLimit),
  };
}

function formatDayNumberLabel(dailyProfile) {
  const compound = dailyProfile?.universalDayCompound;
  const root = dailyProfile?.universalDayRoot;
  if (compound == null && root == null) return null;
  if (compound == null) return String(root);
  if (root == null || compound === root) return String(compound);
  return `${compound}/${root}`;
}

/**
 * Builds the full, clean data shape the X export graphic and caption
 * script consume from a numerology daily card and an explicit qualified-
 * plays list. Top 3 = the 3 highest-ranked qualifying plays; everything
 * else goes into othersOver50 (display-capped at MAX_OTHERS_DISPLAYED, with
 * the true remaining count preserved so nothing is silently dropped).
 * Shared by buildXPostPreview (score-threshold policy, `qualified` =
 * card.allQualifiedPlaysOver50) and buildXPostPreviewFromArtifact
 * (confirmed-lineup policy, `qualified` = the shared delivery artifact's
 * rows) so the output shape can never drift between the two policies.
 */
function buildXPostPreviewFromPlays(card, qualified) {
  const topThree = qualified.slice(0, 3).map((play) => buildPlayCardSummary(play, { chipLimit: 5 }));
  const remaining = qualified.slice(3);
  const othersOver50 = remaining.slice(0, MAX_OTHERS_DISPLAYED).map((play) => {
    const team = normalizeText(play.team).toUpperCase();
    const opponent = normalizeText(play.opponent).toUpperCase();
    return {
      player: normalizeText(play.player),
      team,
      matchup: team && opponent ? `${team} vs ${opponent}` : "",
      numerologyScore: roundOrNull(play.numerologyScore, 0),
      matchType: normalizeText(play.matchType) || "Numerology Match",
      reason: buildSignalChips(play, 1)[0] ?? null,
    };
  });

  const dailyProfile = card?.dailyProfile ?? null;

  return {
    date: normalizeText(card?.date),
    generatedAt: new Date().toISOString(),
    scoreThreshold: card?.scoreThreshold ?? null,
    livePageUrl: normalizeText(card?.livePageUrl) || "https://www.joeknowsball.com/mlb/numerology",
    dayNumbers: {
      universalDayLabel: formatDayNumberLabel(dailyProfile),
      universalDayCompound: dailyProfile?.universalDayCompound ?? null,
      universalDayRoot: dailyProfile?.universalDayRoot ?? null,
      primaryFamily: Array.isArray(dailyProfile?.primaryFamily) ? dailyProfile.primaryFamily : [],
      secondaryFamily: Array.isArray(dailyProfile?.secondaryFamily) ? dailyProfile.secondaryFamily : [],
      balancingComplement: dailyProfile?.balancingComplement ?? null,
      countercurrent: dailyProfile?.countercurrent ?? null,
    },
    topPlay: topThree[0] ?? null,
    secondPlay: topThree[1] ?? null,
    thirdPlay: topThree[2] ?? null,
    othersOver50,
    othersOver50TotalCount: remaining.length,
    othersOver50TruncatedCount: Math.max(0, remaining.length - othersOver50.length),
    totalQualifiedCount: qualified.length,
  };
}

/** Original score-threshold policy: qualified = every play over the card's score threshold, independent of lineup confirmation. */
export function buildXPostPreview(card) {
  const qualified = Array.isArray(card?.allQualifiedPlaysOver50) ? card.allQualifiedPlaysOver50 : [];
  return buildXPostPreviewFromPlays(card, qualified);
}

/**
 * Confirmed-lineup policy: qualified = the shared delivery artifact's rows
 * (already confirmed-lineup-only, already ranked, already capped to 1-5 --
 * see mlb-numerology-x-selection-core.mjs / plan-mlb-numerology-delivery.mjs).
 * This is what the automated X delivery path uses, so its preview can never
 * diverge from what the email delivery used for the same slate.
 *
 * Throws if the artifact's slate date doesn't match the card's -- posting
 * against a stale/mismatched artifact must fail loudly, never silently.
 */
export function buildXPostPreviewFromArtifact(card, artifact) {
  if (!artifact || !Array.isArray(artifact.rows)) {
    throw new Error("Numerology delivery artifact is missing or malformed (no rows[]).");
  }
  if (artifact.slateDate !== card?.date) {
    throw new Error(`Numerology delivery artifact slate date ${artifact.slateDate} does not match card date ${card?.date}.`);
  }
  return buildXPostPreviewFromPlays(card, artifact.rows);
}

/** Checks the preview is genuinely today's data with a real top play -- mirrors the freshness/readiness gate used by the HR props X poster. */
export function validatePreviewReady(preview, todayEt) {
  if (!preview?.date) return "Skipping: numerology preview has no slate date.";
  if (todayEt && preview.date !== todayEt) return `Skipping: numerology preview slate date is ${preview.date}, expected ${todayEt}.`;
  if (!preview.topPlay) return "Skipping: no qualifying numerology play (score over threshold) for today's slate.";
  if (preview.topPlay.numerologyScore == null) return "Skipping: top play is missing a numerology score.";
  return "";
}

function formatDateLabel(dateValue) {
  const raw = normalizeText(dateValue);
  if (!raw) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Builds the X caption: lead with the top play, mention the daily number,
 * list the top 3, link to the live board. Falls back to a shorter form if
 * the full caption would exceed X's 280-character limit, matching the
 * pattern used by the HR props X caption builder.
 */
export function buildCaption(preview) {
  if (!preview?.topPlay) return { skipped: true, reason: "No qualifying numerology play to post today.", caption: "" };

  const dateLabel = formatDateLabel(preview.date);
  const dayLabel = preview.dayNumbers?.universalDayLabel;
  const plays = [preview.topPlay, preview.secondPlay, preview.thirdPlay].filter(Boolean);
  const top = preview.topPlay;

  const lead = `Today's MLB Numerology slate is led by ${top.player} (${top.numerologyScore})${dayLabel ? ` on a strong ${dayLabel} day.` : "."}`;
  const topLines = plays.map((play, index) => `${index + 1}. ${play.player} — ${play.numerologyScore}`);

  const caption = [
    lead,
    "",
    "Top 3:",
    ...topLines,
    "",
    `See full board: ${preview.livePageUrl}`,
    "",
    "#MLB #Numerology #MLBPicks",
  ].join("\n");

  if (caption.length <= 280) return { skipped: false, reason: "", caption };

  const shortCaption = [
    `MLB Numerology ${dateLabel} — led by ${top.player} (${top.numerologyScore})`,
    ...topLines,
    "",
    `Full board: ${preview.livePageUrl}`,
    "#MLB #Numerology",
  ].join("\n");

  if (shortCaption.length <= 280) return { skipped: false, reason: "", caption: shortCaption };
  return { skipped: true, reason: `Skipping: generated caption is ${caption.length} characters; expected 280 or fewer.`, caption: "" };
}
