/**
 * mlb-k-production-projection.mjs
 *
 * THE canonical resolver for the production strikeout projection.
 *
 * Exactly one value ever reaches a public surface (website Proj K, edge,
 * OVER/UNDER direction, sorting, best-bet cards, social graphic, X selection,
 * X caption): `effectiveProjectedKs`. K Projection V2 is that value whenever
 * the V2 artifact, the matched V2 row, and the V2 confidence all pass their
 * integrity checks; otherwise the stored legacy projection is used as a
 * deterministic fail-safe. The two are NEVER blended -- a resolved row is
 * either fully V2 or fully legacy.
 *
 * Legacy `projectedKs` is preserved verbatim as `legacyProjectedKs` for the
 * fallback path and for debug comparison. It is never repurposed.
 *
 * Pure and side-effect free: no I/O, no clock, no randomness. Given the same
 * legacy row + artifact it always produces the same output, which is what
 * makes "the website, the frozen X edition plan, the rendered image and the
 * posted caption all agree" checkable rather than hopeful.
 */
import { buildStrikeoutPropDetailKey } from "./mlb-strikeout-prop-details-core.mjs";
import { validateV3ForProduction } from "./mlb-k-v3-projection-validator.mjs";

/** Which projection actually produced `effectiveProjectedKs`. */
export const K_PROJECTION_SOURCE = Object.freeze({
  V3: "v3",
  V2: "v2",
  LEGACY_FALLBACK: "legacy-fallback",
  UNAVAILABLE: "unavailable",
});

/**
 * The model that produced each source, published so a downstream surface can
 * say which model it is showing without re-deriving it from the source string.
 */
export const K_PROJECTION_MODEL_VERSION = Object.freeze({
  [K_PROJECTION_SOURCE.V3]: "mlb-k-projection-v3",
  [K_PROJECTION_SOURCE.V2]: "mlb-k-projection-v2-production",
});

/** Why V2 was not used (or, for `unavailable`, why nothing could be used). */
export const K_PROJECTION_FALLBACK_REASON = Object.freeze({
  MISSING_V2_ARTIFACT: "missing-v2-artifact",
  STALE_V2_ARTIFACT: "stale-v2-artifact",
  MISSING_V2_ROW: "missing-v2-row",
  STABLE_ID_MISMATCH: "stable-id-mismatch",
  INVALID_V2_PROJECTION: "invalid-v2-projection",
  LOW_V2_CONFIDENCE: "low-v2-confidence",
  INVALID_LEGACY_PROJECTION: "invalid-legacy-projection",
});

/** Only these confidence grades may promote V2 to production. */
export const V2_PRODUCTION_CONFIDENCE = Object.freeze(new Set(["high", "medium"]));

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TEAM_ALIASES = Object.freeze({
  ARZ: "ARI", AZ: "ARI", CHW: "CWS", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WSN: "WSH",
});

function normalizeTeam(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return TEAM_ALIASES[code] ?? code;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Published projections carry one decimal, matching the precision the legacy
 * pipeline has always emitted and every display/export surface assumes. The
 * raw V2 output is preserved separately at full precision.
 */
export const PUBLISHED_PROJECTION_DECIMALS = 1;

/**
 * A projection is usable only when it is a finite number strictly greater
 * than zero. Zero, negative, NaN and Infinity are all rejected rather than
 * passed through -- a fabricated 0 would read as an enormous UNDER edge.
 * Rounding happens here so the published value can never differ between two
 * surfaces that round it at different moments.
 */
/**
 * A projection fit to publish: finite and strictly positive, or null.
 *
 * FULL PRECISION IS PUBLISHED DELIBERATELY. This used to round to
 * PUBLISHED_PROJECTION_DECIMALS before publishing, which meant a projection of
 * 5.46 was stored as 5.5 and then compared against a 5.5 line as an exact tie --
 * turning a real UNDER edge into a "neutral" push, and inventing direction
 * flips that no model produced. Rounding is a PRESENTATION concern: every
 * display surface already formats to one decimal itself (`toFixed(1)`,
 * `numOrDash(x, 1)`), so publishing full precision changes nothing a reader
 * sees while letting side and edge logic compare the numbers the models
 * actually produced.
 *
 * PUBLISHED_PROJECTION_DECIMALS is retained and exported for callers that want
 * the display convention; it no longer gates what is stored.
 */
function toUsableProjection(value) {
  const parsed = toFiniteNumber(value);
  if (parsed == null || parsed <= 0) return null;
  return parsed;
}

/** The display convention, applied at presentation time rather than at write time. */
export function roundProjectionForDisplay(value, decimals = PUBLISHED_PROJECTION_DECIMALS) {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  const factor = 10 ** decimals;
  return Math.round(parsed * factor) / factor;
}

function isValidSlateDate(value) {
  return typeof value === "string" && DATE_PATTERN.test(value);
}

/**
 * Minimal structural gate on the artifact. The full schema validator
 * (mlb-k-props-v2-shadow-validator.mjs) runs in the workflow before this;
 * this is the runtime guard that keeps a truncated/garbage artifact from
 * silently producing V2-sourced rows.
 */
export function isUsableV2Artifact(artifact) {
  return (
    artifact != null
    && typeof artifact === "object"
    && !Array.isArray(artifact)
    && isValidSlateDate(artifact.slateDate)
    && Array.isArray(artifact.rows)
  );
}

function stableIdentityKey(slateDate, gameId, pitcherId) {
  return `${slateDate}|g${gameId}|p${pitcherId}`;
}

function matchupIdentityKey(slateDate, pitcherId, team, opponent) {
  return `${slateDate}|p${pitcherId}|${normalizeTeam(team)}|${normalizeTeam(opponent)}`;
}

function addToIndex(map, key, row, duplicates) {
  if (!key) return;
  if (map.has(key)) {
    duplicates.add(key);
    return;
  }
  map.set(key, row);
}

/**
 * Builds the three identity indexes used by `findV2Row`, in priority order:
 *   1. slateDate + gamePk + pitcherId
 *   2. slateDate + pitcherId + team + opponent
 *   3. the existing normalized legacy detail key
 *
 * Any key that resolves to more than one V2 row is recorded as ambiguous and
 * is refused at lookup time rather than resolved arbitrarily.
 */
export function buildV2RowIndex(artifact) {
  const byStableId = new Map();
  const byMatchup = new Map();
  const byLegacyKey = new Map();
  const duplicateStableIds = new Set();
  const duplicateMatchups = new Set();
  const duplicateLegacyKeys = new Set();

  if (!isUsableV2Artifact(artifact)) {
    return {
      slateDate: null,
      byStableId,
      byMatchup,
      byLegacyKey,
      duplicateStableIds,
      duplicateMatchups,
      duplicateLegacyKeys,
    };
  }

  for (const row of artifact.rows) {
    if (row == null || typeof row !== "object") continue;
    const slateDate = isValidSlateDate(row.slateDate) ? row.slateDate : artifact.slateDate;
    const gameId = toFiniteNumber(row?.game?.gameId);
    const pitcherId = toFiniteNumber(row?.pitcher?.id);
    const team = row?.pitcher?.team;
    const opponent = row?.pitcher?.opponent;

    if (gameId != null && pitcherId != null) {
      addToIndex(byStableId, stableIdentityKey(slateDate, gameId, pitcherId), row, duplicateStableIds);
    }
    if (pitcherId != null && normalizeTeam(team) && normalizeTeam(opponent)) {
      addToIndex(byMatchup, matchupIdentityKey(slateDate, pitcherId, team, opponent), row, duplicateMatchups);
    }
    if (typeof row.key === "string" && row.key) {
      addToIndex(byLegacyKey, `${slateDate}|${row.key}`, row, duplicateLegacyKeys);
    }
  }

  return {
    slateDate: artifact.slateDate,
    byStableId,
    byMatchup,
    byLegacyKey,
    duplicateStableIds,
    duplicateMatchups,
    duplicateLegacyKeys,
  };
}

/**
 * Resolves the V2 row for one legacy row through stable identity.
 *
 * Cross-date, cross-game, cross-team and cross-opponent matches are rejected
 * structurally: every identity key is namespaced by slateDate, and the two
 * strong keys carry gamePk or team+opponent, so a mismatch simply misses.
 * Name-only matching is never attempted; the legacy-key fallback (which does
 * encode the pitcher name) is used only when it is unambiguous AND the
 * resulting row's team/opponent agree with the legacy row.
 *
 * @returns {{ row: object|null, matchedBy: "stable-id"|"matchup"|"legacy-key"|null, reason: string|null }}
 */
export function findV2Row(index, legacyRow, slateDate) {
  if (!isValidSlateDate(slateDate)) {
    return { row: null, matchedBy: null, reason: K_PROJECTION_FALLBACK_REASON.STALE_V2_ARTIFACT };
  }

  const gameId = toFiniteNumber(legacyRow?.gameId);
  const pitcherId = toFiniteNumber(legacyRow?.pitcherId);
  const team = normalizeTeam(legacyRow?.team);
  const opponent = normalizeTeam(legacyRow?.opponent);

  if (pitcherId != null && gameId != null) {
    const key = stableIdentityKey(slateDate, gameId, pitcherId);
    if (index.duplicateStableIds.has(key)) {
      return { row: null, matchedBy: null, reason: K_PROJECTION_FALLBACK_REASON.STABLE_ID_MISMATCH };
    }
    const row = index.byStableId.get(key);
    if (row) return { row, matchedBy: "stable-id", reason: null };
  }

  if (pitcherId != null && team && opponent) {
    const key = matchupIdentityKey(slateDate, pitcherId, team, opponent);
    if (index.duplicateMatchups.has(key)) {
      return { row: null, matchedBy: null, reason: K_PROJECTION_FALLBACK_REASON.STABLE_ID_MISMATCH };
    }
    const row = index.byMatchup.get(key);
    if (row) return { row, matchedBy: "matchup", reason: null };
  }

  const legacyKey = buildStrikeoutPropDetailKey({
    pitcher: legacyRow?.pitcher,
    team: legacyRow?.team,
    opponent: legacyRow?.opponent,
    gameDate: slateDate,
  });
  if (legacyKey) {
    const namespaced = `${slateDate}|${legacyKey}`;
    if (index.duplicateLegacyKeys.has(namespaced)) {
      return { row: null, matchedBy: null, reason: K_PROJECTION_FALLBACK_REASON.STABLE_ID_MISMATCH };
    }
    const row = index.byLegacyKey.get(namespaced);
    if (row) {
      // The legacy key is name-derived, so re-verify the matchup rather than
      // trusting it: a same-named pitcher against a different opponent must
      // never resolve here.
      const rowTeam = normalizeTeam(row?.pitcher?.team);
      const rowOpponent = normalizeTeam(row?.pitcher?.opponent);
      if ((team && rowTeam && team !== rowTeam) || (opponent && rowOpponent && opponent !== rowOpponent)) {
        return { row: null, matchedBy: null, reason: K_PROJECTION_FALLBACK_REASON.STABLE_ID_MISMATCH };
      }
      // A pitcherId present on both sides that disagrees is a hard mismatch.
      const rowPitcherId = toFiniteNumber(row?.pitcher?.id);
      if (pitcherId != null && rowPitcherId != null && pitcherId !== rowPitcherId) {
        return { row: null, matchedBy: null, reason: K_PROJECTION_FALLBACK_REASON.STABLE_ID_MISMATCH };
      }
      return { row, matchedBy: "legacy-key", reason: null };
    }
  }

  return { row: null, matchedBy: null, reason: K_PROJECTION_FALLBACK_REASON.MISSING_V2_ROW };
}

/**
 * @typedef {object} ResolvedKProjection
 * @property {number|null} effectiveProjectedKs the ONE value every public surface uses
 * @property {number|null} legacyProjectedKs    stored legacy projection (fail-safe + debug)
 * @property {number|null} v2ProjectedKs        raw V2 projection, whether or not it was used
 * @property {"v2"|"legacy-fallback"|"unavailable"} source
 * @property {string|null} fallbackReason       why the effective value is not V2 (null when it is)
 * @property {string|null} v2RejectionReason    why V2 specifically was refused, retained even when
 *                                              the row ends up `unavailable` (debug/audit only)
 * @property {"high"|"medium"|"low"|"insufficient"|null} confidence
 * @property {string|null} modelVersion
 * @property {"stable-id"|"matchup"|"legacy-key"|null} matchedBy
 */

/**
 * Resolves the production projection for one legacy pitcher row.
 *
 * V2 is used only when EVERY one of these holds:
 *   - the artifact is structurally usable
 *   - the artifact slate matches the public slate
 *   - a V2 row matches through stable identity
 *   - `projectedStrikeouts` is finite and > 0
 *   - confidence is "high" or "medium"
 *
 * Otherwise the valid legacy projection is used. When neither is valid the
 * result is `unavailable` with a null effective value -- never 0, NaN or
 * Infinity.
 *
 * @param {object} params
 * @param {object} params.legacyRow          a pitcher row from hr-props-raw.json
 * @param {object|null} params.artifact      the parsed V2 artifact (or null when absent)
 * @param {object} [params.index]            a prebuilt index from buildV2RowIndex (perf only)
 * @param {string|null} params.publicSlateDate the slate the public payload is for
 * @param {boolean} [params.artifactValid]   false to force `missing-v2-artifact` (schema rejected upstream)
 * @returns {ResolvedKProjection}
 */
export function resolveKProjection({
  legacyRow,
  artifact = null,
  index = null,
  publicSlateDate = null,
  artifactValid = true,
} = {}) {
  const legacyProjectedKs = toUsableProjection(
    legacyRow?.legacyProjectedKs ?? legacyRow?.projectedKs,
  );

  const finish = (v2Row, v2RejectionReason, matchedBy) => {
    const v2ProjectedKs = toFiniteNumber(v2Row?.v2?.projectedStrikeouts);
    const confidence = typeof v2Row?.v2?.confidence === "string" ? v2Row.v2.confidence : null;
    const modelVersion = typeof v2Row?.v2?.modelVersion === "string" ? v2Row.v2.modelVersion : null;
    const v3ProjectedKs = toFiniteNumber(v2Row?.v3?.projectedKs);

    if (v2RejectionReason == null) {
      /**
       * V3 PROMOTION. V3 is preferred over V2 only when the whole V2 path has
       * already been accepted -- same artifact, same slate, same matched row --
       * AND the row's own v3 block passes the production gate. That ordering is
       * deliberate: every identity, staleness and slate check that protects V2
       * protects V3 too, and V3 adds one more gate on top rather than replacing
       * any of them.
       *
       * A rejected V3 is not a failure. Openers, relievers and pitchers with no
       * usable game log are refused BY DESIGN, because the model was validated
       * on starters only; those rows keep the V2 projection they have always
       * had, with `v3RejectionReason` recording why.
       */
      const v3Verdict = validateV3ForProduction(v2Row?.v3);
      if (v3Verdict.ok) {
        return {
          effectiveProjectedKs: toUsableProjection(v3ProjectedKs),
          legacyProjectedKs,
          v2ProjectedKs,
          v3ProjectedKs,
          /**
           * The workload the published strikeout number was actually built
           * from. Publishing V3's strikeouts on top of V2's innings would make
           * the row internally inconsistent -- projectedKs would no longer be
           * projectedKRate x projectedBF -- and `kPropStatus` and the game
           * top-props eligibility gate both read projectedIP, so the mismatch
           * would silently change which props qualify.
           */
          projectedInnings: toFiniteNumber(v2Row?.v3?.finalProjectedIP),
          projectedBattersFaced: toFiniteNumber(v2Row?.v3?.projectedBF),
          projectedKRate: toFiniteNumber(v2Row?.v3?.projectedKRate),
          workloadSource: K_PROJECTION_SOURCE.V3,
          source: K_PROJECTION_SOURCE.V3,
          fallbackReason: null,
          v2RejectionReason: null,
          v3RejectionReason: null,
          confidence,
          modelVersion: K_PROJECTION_MODEL_VERSION[K_PROJECTION_SOURCE.V3],
          v2ModelVersion: modelVersion,
          matchedBy,
        };
      }

      return {
        effectiveProjectedKs: toUsableProjection(v2ProjectedKs),
        legacyProjectedKs,
        v2ProjectedKs,
        v3ProjectedKs,
        // V2 was published, so V2's own workload travels with it.
        projectedInnings: toFiniteNumber(v2Row?.v2?.projectedInnings),
        projectedBattersFaced: toFiniteNumber(v2Row?.v2?.projectedBattersFaced),
        projectedKRate: toFiniteNumber(v2Row?.v2?.projectedKRate),
        workloadSource: K_PROJECTION_SOURCE.V2,
        source: K_PROJECTION_SOURCE.V2,
        fallbackReason: null,
        v2RejectionReason: null,
        v3RejectionReason: v3Verdict.reason,
        confidence,
        modelVersion,
        v2ModelVersion: modelVersion,
        matchedBy,
      };
    }

    if (legacyProjectedKs != null) {
      return {
        effectiveProjectedKs: legacyProjectedKs,
        legacyProjectedKs,
        v2ProjectedKs,
        v3ProjectedKs,
        // Legacy carries its own stored IP; nothing here overrides it.
        projectedInnings: null,
        projectedBattersFaced: null,
        projectedKRate: null,
        workloadSource: K_PROJECTION_SOURCE.LEGACY_FALLBACK,
        source: K_PROJECTION_SOURCE.LEGACY_FALLBACK,
        fallbackReason: v2RejectionReason,
        v2RejectionReason,
        // V3 was never reached: the V2 path failed first.
        v3RejectionReason: null,
        confidence,
        modelVersion,
        v2ModelVersion: modelVersion,
        matchedBy,
      };
    }

    return {
      effectiveProjectedKs: null,
      legacyProjectedKs: null,
      v2ProjectedKs,
      v3ProjectedKs,
      v3RejectionReason: null,
      v2ModelVersion: modelVersion,
      projectedInnings: null,
      projectedBattersFaced: null,
      projectedKRate: null,
      workloadSource: K_PROJECTION_SOURCE.UNAVAILABLE,
      source: K_PROJECTION_SOURCE.UNAVAILABLE,
      // Nothing is publishable because the last-resort legacy value is
      // itself unusable; `v2RejectionReason` still records why V2 was refused.
      fallbackReason: K_PROJECTION_FALLBACK_REASON.INVALID_LEGACY_PROJECTION,
      v2RejectionReason,
      confidence,
      modelVersion,
      matchedBy,
    };
  };

  if (!artifactValid || !isUsableV2Artifact(artifact)) {
    return finish(null, K_PROJECTION_FALLBACK_REASON.MISSING_V2_ARTIFACT, null);
  }
  if (!isValidSlateDate(publicSlateDate) || artifact.slateDate !== publicSlateDate) {
    return finish(null, K_PROJECTION_FALLBACK_REASON.STALE_V2_ARTIFACT, null);
  }

  const resolvedIndex = index ?? buildV2RowIndex(artifact);
  const { row, matchedBy, reason } = findV2Row(resolvedIndex, legacyRow, publicSlateDate);
  if (row == null) return finish(null, reason ?? K_PROJECTION_FALLBACK_REASON.MISSING_V2_ROW, null);

  // A matched row must still belong to the public slate. This is redundant
  // with the namespaced identity keys and kept deliberately: it is the check
  // that would catch a future index change that stopped namespacing by date.
  if (isValidSlateDate(row.slateDate) && row.slateDate !== publicSlateDate) {
    return finish(row, K_PROJECTION_FALLBACK_REASON.STABLE_ID_MISMATCH, matchedBy);
  }

  if (toUsableProjection(row?.v2?.projectedStrikeouts) == null) {
    return finish(row, K_PROJECTION_FALLBACK_REASON.INVALID_V2_PROJECTION, matchedBy);
  }
  if (!V2_PRODUCTION_CONFIDENCE.has(row?.v2?.confidence)) {
    return finish(row, K_PROJECTION_FALLBACK_REASON.LOW_V2_CONFIDENCE, matchedBy);
  }

  return finish(row, null, matchedBy);
}

/**
 * Serializes a resolved projection onto a legacy pitcher row.
 *
 * `projectedKs` becomes the resolved production value so that every existing
 * consumer (page table, sorting, best bets, status, DOM export attributes,
 * the X scrape, captions, renderers) reads the same number without a
 * migration that could leave some surfaces on legacy. The untouched legacy
 * projection stays available as `legacyProjectedKs`.
 *
 * `kAdjustment` is recomputed from the resolved value because it is derived
 * from the projection-vs-line gap; leaving it on the legacy number would
 * reintroduce exactly the blend this module exists to prevent.
 */
export function applyResolvedKProjection(legacyRow, resolved) {
  const kLine = toFiniteNumber(legacyRow?.kLine);
  const effective = resolved.effectiveProjectedKs;
  const kAdjustment = kLine != null && effective != null ? Math.round((effective - kLine) * 5) : 0;

  /**
   * The workload that belongs to the PUBLISHED projection.
   *
   * A model's strikeout number and its innings must travel together: several
   * downstream gates (`kPropStatus` INSUFFICIENT_DATA, the game top-props
   * `projectedIP > 3.0` eligibility rule) read projectedIP, so leaving V2's
   * innings under a V3 strikeout projection would change which props qualify
   * for reasons unrelated to either model.
   *
   * Only a model-sourced workload overrides the stored value. Legacy and
   * unavailable rows keep the innings the payload already carried, which is the
   * legacy projection's own -- overriding those with null would erase data the
   * legacy fail-safe depends on.
   */
  const storedIp = toFiniteNumber(legacyRow?.projectedIP);
  const resolvedIp = toFiniteNumber(resolved.projectedInnings);
  const resolvedBf = toFiniteNumber(resolved.projectedBattersFaced);
  const resolvedKRate = toFiniteNumber(resolved.projectedKRate);
  const usesModelWorkload =
    resolvedIp != null &&
    (resolved.workloadSource === K_PROJECTION_SOURCE.V3 || resolved.workloadSource === K_PROJECTION_SOURCE.V2);

  const projectedIP = usesModelWorkload ? resolvedIp : storedIp;
  const projectedIPSource = usesModelWorkload ? resolved.workloadSource : "legacy-stored";

  // The stored legacy number is written back exactly as it was found, not as
  // the resolver's "usable" reading of it: an unusable legacy value (0/NaN)
  // is still the honest record of what legacy produced, and re-running this
  // step must not erode it. `resolveKProjection` re-derives usability from
  // this same field, so the step stays idempotent.
  const storedLegacy = toFiniteNumber(legacyRow?.legacyProjectedKs ?? legacyRow?.projectedKs);

  return {
    ...legacyRow,
    projectedKs: effective,
    effectiveProjectedKs: effective,
    legacyProjectedKs: storedLegacy,
    v2ProjectedKs: resolved.v2ProjectedKs,
    v3ProjectedKs: resolved.v3ProjectedKs ?? null,

    // ---- workload that matches the published projection ----
    projectedIP,
    effectiveProjectedIP: projectedIP,
    projectedBF: usesModelWorkload ? resolvedBf : toFiniteNumber(legacyRow?.projectedBF),
    projectedKRate: usesModelWorkload ? resolvedKRate : toFiniteNumber(legacyRow?.projectedKRate),
    // Provenance, so a reader never has to infer which model an innings figure
    // came from. `legacy-stored` means the payload's own value was kept.
    resolvedProjectionModel: resolved.modelVersion ?? null,
    resolvedProjectedIPSource: projectedIPSource,
    resolvedProjectedBFSource: usesModelWorkload ? resolved.workloadSource : "legacy-stored",

    projectionSource: resolved.source,
    projectionFallbackReason: resolved.fallbackReason,
    v3RejectionReason: resolved.v3RejectionReason ?? null,
    v2Confidence: resolved.confidence,
    // Retains the historical field name and meaning: the model that produced
    // the PUBLISHED projection. `v2ModelVersion` is v3's version when v3 won.
    v2ModelVersion: resolved.modelVersion,
    projectionModelVersion: resolved.modelVersion,
    kAdjustment,
  };
}

/**
 * Resolves an entire payload of pitcher rows against one V2 artifact.
 * Returns the updated rows plus the counts the audit command reports.
 */
export function resolveKProjectionsForPayload({
  pitchers = [],
  artifact = null,
  publicSlateDate = null,
  artifactValid = true,
} = {}) {
  const index = buildV2RowIndex(artifact);
  const fallbackReasons = {};
  const confidenceCounts = {};
  const v3RejectionReasons = {};
  let v3Rows = 0;
  let v2Rows = 0;
  let legacyFallbackRows = 0;
  let unavailableRows = 0;

  const rows = pitchers.map((legacyRow) => {
    const resolved = resolveKProjection({ legacyRow, artifact, index, publicSlateDate, artifactValid });
    if (resolved.source === K_PROJECTION_SOURCE.V3) v3Rows += 1;
    else if (resolved.source === K_PROJECTION_SOURCE.V2) v2Rows += 1;
    else if (resolved.source === K_PROJECTION_SOURCE.LEGACY_FALLBACK) legacyFallbackRows += 1;
    else unavailableRows += 1;

    const reason = resolved.v2RejectionReason ?? resolved.fallbackReason;
    if (reason) fallbackReasons[reason] = (fallbackReasons[reason] ?? 0) + 1;
    // Why a V2-sourced row did not reach V3. Counted separately from the V2
    // fallback reasons so "V3 declined an opener" never reads as "V2 failed".
    if (resolved.v3RejectionReason) {
      v3RejectionReasons[resolved.v3RejectionReason] = (v3RejectionReasons[resolved.v3RejectionReason] ?? 0) + 1;
    }
    if (resolved.confidence) {
      confidenceCounts[resolved.confidence] = (confidenceCounts[resolved.confidence] ?? 0) + 1;
    }

    return { row: applyResolvedKProjection(legacyRow, resolved), resolved };
  });

  return {
    pitchers: rows.map((entry) => entry.row),
    resolutions: rows.map((entry) => entry.resolved),
    diagnostics: {
      totalRows: rows.length,
      v3Rows,
      v2Rows,
      legacyFallbackRows,
      unavailableRows,
      fallbackReasons,
      v3RejectionReasons,
      confidenceCounts,
      ambiguousStableIds: [...index.duplicateStableIds],
      ambiguousMatchups: [...index.duplicateMatchups],
      ambiguousLegacyKeys: [...index.duplicateLegacyKeys],
    },
  };
}
