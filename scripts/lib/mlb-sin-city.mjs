/**
 * mlb-sin-city.mjs
 *
 * Plain-JS mirror of src/lib/mlb/mlbHrFilter.ts's Sin City evaluation, for
 * use by node scripts (which cannot import .ts files directly). The
 * thresholds, wind classification, and pass/fail logic here MUST stay in
 * lockstep with the TS source -- this file does not change or reinterpret
 * the qualification rules, it only re-expresses them for the backfill/
 * persistence scripts. If mlbHrFilter.ts changes, update
 * SIN_CITY_RULESET_VERSION and this file together.
 */

export const SIN_CITY_RULESET_VERSION = "mlbHrFilter-2026.1";

export const CF_BEARING = {
  "Truist Park": 35,
  "Oriole Park at Camden Yards": 55,
  "Fenway Park": 95,
  "Wrigley Field": 45,
  "Guaranteed Rate Field": 5,
  "Rate Field": 5,
  "Great American Ball Park": 20,
  "Progressive Field": 30,
  "Coors Field": 15,
  "Comerica Park": 330,
  "Minute Maid Park": 25,
  "Kauffman Stadium": 10,
  "Dodger Stadium": 330,
  "Angel Stadium": 30,
  "loanDepot park": 20,
  "American Family Field": 5,
  "Target Field": 350,
  "Citi Field": 5,
  "Yankee Stadium": 25,
  "Oakland Coliseum": 350,
  "Citizens Bank Park": 40,
  "PNC Park": 355,
  "Petco Park": 340,
  "Oracle Park": 310,
  "T-Mobile Park": 350,
  "Busch Stadium": 5,
  "Tropicana Field": 0,
  "Globe Life Field": 350,
  "Rogers Centre": 15,
  "Nationals Park": 5,
  "Chase Field": 350,
};

const RETRACTABLE_PARKS = new Set([
  "Minute Maid Park", "loanDepot park", "American Family Field", "T-Mobile Park",
  "Globe Life Field", "Rogers Centre", "Chase Field", "Tropicana Field",
]);

const COMPASS = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export function classifyWind(stadium, roofType, windDirection, windSpeed) {
  if (roofType === "Dome") return "unknown";
  if (RETRACTABLE_PARKS.has(stadium) && roofType !== "Open") return "unknown";
  const speed = windSpeed ?? 0;
  if (speed < 4) return "calm";
  const cfBearing = CF_BEARING[stadium];
  const windDeg = COMPASS[(windDirection ?? "").toUpperCase()];
  if (cfBearing == null || windDeg == null) return "unknown";
  const diff = Math.abs(((windDeg - cfBearing) + 540) % 360 - 180);
  if (diff <= 60) return "out";
  if (diff >= 120) return "in";
  return "cross";
}

export const SIN_CITY_THRESHOLDS = {
  barrelRate: 12,
  pullRate: 20,
  hardHitRate: 45,
  exitVelo: 92,
  windSpeed: 8,
};

function numericCriterion(name, value, threshold) {
  const resolved = value ?? null;
  return { name, value: resolved, threshold, pass: resolved !== null && resolved >= threshold };
}

/** @returns {{ factors: Array<{name:string,value:number|null,threshold:number,pass:boolean}>, matchCount: number }} */
export function evaluateSinCityHitter(input) {
  const windSignal = classifyWind(
    input.stadium ?? "",
    input.roofType ?? "Unknown",
    input.windDirection ?? "",
    input.windSpeed ?? null,
  );
  const windSpeed = input.windSpeed ?? null;
  const windPass = windSignal === "out" && windSpeed !== null && windSpeed >= SIN_CITY_THRESHOLDS.windSpeed;

  const factors = [
    numericCriterion("Barrel%", input.barrelRate, SIN_CITY_THRESHOLDS.barrelRate),
    numericCriterion("Pull%", input.pullRate, SIN_CITY_THRESHOLDS.pullRate),
    numericCriterion("Hard Hit%", input.hardHitRate, SIN_CITY_THRESHOLDS.hardHitRate),
    numericCriterion("Exit Velo", input.exitVelo, SIN_CITY_THRESHOLDS.exitVelo),
    { name: "Wind Out", value: windSpeed, threshold: SIN_CITY_THRESHOLDS.windSpeed, pass: windPass },
  ];

  return { factors, matchCount: factors.filter((f) => f.pass).length };
}
