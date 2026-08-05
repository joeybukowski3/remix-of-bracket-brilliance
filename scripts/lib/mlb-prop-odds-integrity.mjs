/**
 * Post-ingestion integrity checks for published MLB prop odds.
 *
 * These exist to make a normalization regression loud instead of silent. They
 * detect *structural* faults -- an alternate/ladder rung published as a primary
 * line, a one-sided strikeout market, a home run threshold that disagrees with
 * the rest of the slate -- rather than encoding expectations about any player
 * or any maximum line value.
 */
import { isAmericanOdds, isValidPropLine } from "./mlb-prop-name-normalizer.mjs";

function violation(code, detail) {
  return { code, ...detail };
}

/** Most common value in a list, with a deterministic low-value tie-break. */
export function modalValue(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return ranked.length > 0 ? ranked[0][0] : null;
}

/**
 * A posted strikeout prop is two-sided. Anything published without both sides,
 * or explicitly flagged as an alternate market, is a ladder rung.
 */
export function checkStrikeoutOdds(kOdds) {
  const violations = [];
  const warnings = [];
  for (const [player, entry] of Object.entries(kOdds ?? {})) {
    if (!entry || !isValidPropLine(entry.line)) continue;
    if (entry.isAlternate === true) {
      violations.push(violation("alternate_market_published", { player, line: entry.line, market: "player_strikeouts" }));
    }
    if (!isAmericanOdds(entry.over) || !isAmericanOdds(entry.under)) {
      violations.push(violation("one_sided_strikeout_primary", { player, line: entry.line, over: entry.over ?? null, under: entry.under ?? null }));
    }
    if (Number.isInteger(Number(entry.line))) {
      warnings.push(violation("integer_strikeout_threshold", { player, line: entry.line }));
    }
  }
  return { violations, warnings };
}

/**
 * Home runs are priced Yes-only by many books, so one-sidedness is not a fault
 * here. The ladder is separated by threshold instead: the canonical
 * "to hit a home run" market is whichever threshold the slate agrees on, and a
 * player sitting above it is a 2+/3+ HR rung.
 */
export function checkHomeRunOdds(hrOdds) {
  const violations = [];
  const entries = Object.entries(hrOdds ?? {}).filter(([, entry]) => entry && isValidPropLine(entry.line));
  const canonicalLine = modalValue(entries.map(([, entry]) => Number(entry.line)));
  for (const [player, entry] of entries) {
    if (entry.isAlternate === true) {
      violations.push(violation("alternate_market_published", { player, line: entry.line, market: "player_home_runs" }));
    }
    if (canonicalLine != null && Number(entry.line) !== canonicalLine) {
      violations.push(violation("non_canonical_hr_threshold", { player, line: Number(entry.line), canonicalLine }));
    }
  }
  return { violations, warnings: [], canonicalLine };
}

/** Same structural checks applied to the model rows after odds injection. */
export function checkInjectedModelRows(raw) {
  const violations = [];
  const pitchers = Array.isArray(raw?.pitchers) ? raw.pitchers : [];
  const batters = Array.isArray(raw?.batters) ? raw.batters : [];

  for (const pitcher of pitchers) {
    if (!isValidPropLine(pitcher?.kLine)) continue;
    if (!isAmericanOdds(pitcher?.kOddsOver) || !isAmericanOdds(pitcher?.kOddsUnder)) {
      violations.push(violation("one_sided_strikeout_primary", {
        player: pitcher?.pitcher ?? null,
        line: pitcher.kLine,
        over: pitcher?.kOddsOver ?? null,
        under: pitcher?.kOddsUnder ?? null,
      }));
    }
  }

  const hrLines = batters.filter((batter) => isValidPropLine(batter?.hrLine)).map((batter) => Number(batter.hrLine));
  const canonicalLine = modalValue(hrLines);
  for (const batter of batters) {
    if (!isValidPropLine(batter?.hrLine)) continue;
    if (canonicalLine != null && Number(batter.hrLine) !== canonicalLine) {
      violations.push(violation("non_canonical_hr_threshold", {
        player: batter?.player ?? null,
        line: Number(batter.hrLine),
        canonicalLine,
      }));
    }
  }

  return { violations, canonicalHrLine: canonicalLine };
}

export function summarizeViolations(violations) {
  const counts = new Map();
  for (const item of violations) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([code, count]) => `${code}=${count}`);
}
