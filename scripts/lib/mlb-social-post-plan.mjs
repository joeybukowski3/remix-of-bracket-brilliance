/**
 * mlb-social-post-plan.mjs
 *
 * Canonical Phase-1 social-post data contract. Defines the `SocialPostPlan` /
 * `PostRow` shapes produced by the social-composition layer (see
 * mlb-social-composition.mjs) and the deterministic row fingerprint used to
 * detect meaningful content changes between composition runs.
 *
 * Pure/side-effect-free: no network, no filesystem, no clock reads other than
 * echoing back a caller-supplied `generatedAt`.
 *
 * @typedef {"mlb-k-props" | "mlb-hr-props"} SocialProduct
 *
 * @typedef {object} KPostRowContent
 * @property {"k"} kind
 * @property {"OVER"|"UNDER"|null} side
 * @property {number|null} kLine
 * @property {number|null} projectedKs
 * @property {number|null} edge          signed (projectedKs - kLine), rounded to 2 decimals
 * @property {string|null} odds          American odds for `side` specifically
 *
 * @typedef {object} HrPostRowContent
 * @property {"hr"} kind
 * @property {number|null} hrScore
 * @property {string|null} odds          hrOddsYes (price for "hits a HR")
 * @property {string|null} opposingPitcher
 * @property {number|null} barrelRate
 * @property {number|null} hardHitRate
 * @property {number|null} last7HR
 * @property {number|null} last30HR
 *
 * @typedef {object} PostRow
 * @property {number|string|null} playerId
 * @property {string|null} playerName
 * @property {string|null} team
 * @property {string|null} opponent
 * @property {number|string|null} gameId
 * @property {number|null} gameNumber    null until acquisition reliably populates it (Phase 2)
 * @property {string|null} gameLabel     non-doubleheader label derived from team/opponent only
 * @property {KPostRowContent|HrPostRowContent} content
 *
 * @typedef {object} SocialPostPlanReadiness
 * @property {string} status
 * @property {string} generatedAt
 * @property {string[]} sourceSummary
 *
 * @typedef {object} SocialPostPlan
 * @property {SocialProduct} product
 * @property {string} slateDate
 * @property {PostRow[]} rows
 * @property {string} rowFingerprint
 * @property {string} title
 * @property {string|null} subtitle
 * @property {SocialPostPlanReadiness} readiness
 * @property {string} receiptKey         `${product}:${slateDate}` -- no morning/confirmed axis
 */

import { createHash } from "node:crypto";

/**
 * The exact fields that make up "visible content" for fingerprint purposes,
 * keyed off `content.kind` so K and HR rows never leak into each other's
 * field list. Deliberately excludes anything not shown on the eventual
 * graphic/caption (generatedAt, readiness metadata, internal ranking/backend
 * fields) so the fingerprint only changes when the public card would.
 */
function fingerprintPayloadForRow(row) {
  const base = {
    playerId: row?.playerId ?? null,
    gameId: row?.gameId ?? null,
    gameLabel: row?.gameLabel ?? null,
    kind: row?.content?.kind ?? null,
  };

  if (row?.content?.kind === "k") {
    return {
      ...base,
      side: row.content.side ?? null,
      kLine: row.content.kLine ?? null,
      projectedKs: row.content.projectedKs ?? null,
      edge: row.content.edge ?? null,
      odds: row.content.odds ?? null,
    };
  }

  if (row?.content?.kind === "hr") {
    return {
      ...base,
      hrScore: row.content.hrScore ?? null,
      odds: row.content.odds ?? null,
      opposingPitcher: row.content.opposingPitcher ?? null,
      barrelRate: row.content.barrelRate ?? null,
      hardHitRate: row.content.hardHitRate ?? null,
      last7HR: row.content.last7HR ?? null,
      last30HR: row.content.last30HR ?? null,
    };
  }

  return base;
}

/**
 * Deterministic hash of the ORDERED visible content of `rows`. Same input
 * order + same visible field values always produces the same fingerprint;
 * reordering rows, or changing any visible field, always changes it.
 *
 * @param {PostRow[]} rows
 * @returns {string} sha256 hex digest
 */
export function computeRowFingerprint(rows) {
  const payload = rows.map(fingerprintPayloadForRow);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Assemble the canonical SocialPostPlan. Pure -- does not read the clock;
 * `generatedAt` must be supplied by the caller.
 *
 * @param {object} params
 * @param {SocialProduct} params.product
 * @param {string} params.slateDate           ET slate date, e.g. "2026-08-18"
 * @param {PostRow[]} params.rows
 * @param {string} params.title
 * @param {string|null} [params.subtitle]
 * @param {string} params.generatedAt         ISO timestamp supplied by the caller
 * @param {string[]} [params.sourceSummary]
 * @returns {SocialPostPlan}
 */
export function buildSocialPostPlan({ product, slateDate, rows, title, subtitle = null, generatedAt, sourceSummary = [] }) {
  return {
    product,
    slateDate,
    rows,
    rowFingerprint: computeRowFingerprint(rows),
    title,
    subtitle,
    readiness: {
      status: "PLAN_READY",
      generatedAt,
      sourceSummary,
    },
    receiptKey: `${product}:${slateDate}`,
  };
}
