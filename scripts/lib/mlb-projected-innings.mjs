/**
 * mlb-projected-innings.mjs
 *
 * Shared pure projected-innings-per-appearance logic for a pitcher. Used by:
 *  - scripts/generate-mlb-hr-props.mjs (K-prop projected-K model, pre-existing)
 *  - scripts/lib/mlb-ml-projected-ip-shadow.mjs (Phase 2.1 Moneyline shadow, new)
 *
 * PER PHASE 2 SCOPE: this is a MECHANICAL EXTRACTION of the projected-innings
 * formula that already lived inline in generate-mlb-hr-props.mjs as
 * classifyPitcherRole() / getAverageIPForRole() / calculateProjectedInnings().
 * The formula and bounds below are UNCHANGED from that pre-existing logic --
 * this file only moves it to a shared location so a second, inconsistent
 * copy is never created (Phase 2 roadmap, "2.1 Starter projected-innings
 * scaling": "Do not create a second inconsistent formula"). If this formula
 * ever needs to change, change it here once -- do not re-inline a variant
 * in either caller.
 *
 * Input contract for calculateProjectedInnings/classifyPitcherRole:
 *   { seasonIP: number|null, seasonGS: number|null }
 * (decimal innings pitched, integer games started) -- the same shape
 * generate-mlb-hr-props.mjs already builds its `pitcher` objects with.
 */

export const PROJECTED_INNINGS_BOUNDS = {
  starter: { min: 3.0, max: 8.0, roleDefault: 5.5 },
  reliever: { min: 0.5, max: 3.0, roleDefault: 1.5 },
};

/**
 * Classify a pitcher as "starter" or "reliever" based on season games
 * started. Unchanged from the original generate-mlb-hr-props.mjs logic:
 * any pitcher with seasonGS === 0 is treated as a reliever; everyone else
 * (including a probable/confirmed starter with no season data loaded yet)
 * defaults to "starter".
 *
 * @param {{ seasonGS?: number|null }} pitcher
 * @returns {"starter"|"reliever"}
 */
export function classifyPitcherRole(pitcher) {
  if (pitcher?.seasonGS != null && pitcher.seasonGS === 0) return "reliever";
  return "starter";
}

/**
 * @param {"starter"|"reliever"} role
 * @returns {number} average IP for the role when no season data is available
 */
export function getAverageIPForRole(role) {
  return PROJECTED_INNINGS_BOUNDS[role]?.roleDefault ?? PROJECTED_INNINGS_BOUNDS.starter.roleDefault;
}

function roundNumber(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Whether calculateProjectedInnings() will use real season data (true) or
 * fall back to the role-based default (false), for the SAME pitcher input.
 * Callers use this to set data-quality/source fields without re-deriving
 * the same branch condition.
 *
 * @param {{ seasonIP?: number|null, seasonGS?: number|null }} pitcher
 * @returns {boolean}
 */
export function hasRealProjectedInningsData(pitcher) {
  return pitcher?.seasonIP != null && pitcher?.seasonGS != null && pitcher.seasonGS > 0;
}

/**
 * Calculate a pitcher's projected innings for their next appearance from
 * real season IP / games-started, clamped to role-appropriate bounds.
 * Falls back to a role-based default when season data isn't available.
 * Openers and short-stint relievers are bounded to the "reliever" range
 * (0.5-3.0 IP) via classifyPitcherRole(), so they are never treated like a
 * full-workload starter.
 *
 * @param {{ seasonIP?: number|null, seasonGS?: number|null }} pitcher
 * @returns {number} projected innings pitched
 */
export function calculateProjectedInnings(pitcher) {
  const role = classifyPitcherRole(pitcher);
  const bounds = PROJECTED_INNINGS_BOUNDS[role];

  if (hasRealProjectedInningsData(pitcher)) {
    const avgIP = pitcher.seasonIP / pitcher.seasonGS;
    return Math.max(bounds.min, Math.min(bounds.max, roundNumber(avgIP, 1)));
  }

  return getAverageIPForRole(role);
}

/**
 * Parse an MLB StatsAPI innings-pitched string ("142.1" = 142 and 1/3
 * innings, since StatsAPI encodes partial innings as outs-past-the-decimal,
 * not decimal fractions) into a plain decimal number.
 *
 * Same algorithm as parseInningsPitched() in generate-mlb-hr-props.mjs and
 * parseIp() in mlb-ml-edge-core.mjs. Duplicated here intentionally, per the
 * existing repo convention where each pipeline keeps its own local copy of
 * this exact three-line parse (see mlb-ml-edge-core.mjs's own parseIp) --
 * this copy exists for callers that only have the raw StatsAPI string and
 * need it converted into the { seasonIP, seasonGS } shape this module's
 * other functions expect.
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
export function parseInningsPitchedString(value) {
  if (value == null) return null;
  const str = String(value);
  const [whole, fraction] = str.split(".");
  const innings = Number(whole);
  const outs = Number(fraction || 0);
  if (!Number.isFinite(innings) || !Number.isFinite(outs)) return null;
  return innings + outs / 3;
}
