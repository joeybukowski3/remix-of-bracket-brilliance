export const CFB_PRESEASON_MARKET_BASELINE_SOURCE = "vsin-makinen-2026" as const;

export type CfbPreseasonMarketBaseline = {
  teamId: string;
  sourcePowerRating: number;
  source: typeof CFB_PRESEASON_MARKET_BASELINE_SOURCE;
  sourceStatus: "verified-guide";
  mappedAt: "2026-08-10";
  version: "2026-v1";
};

const ratings: ReadonlyArray<readonly [string, number]> = [
  ["af", 37], ["akron", 25], ["ala", 61], ["app", 30], ["arz", 52.5],
  ["asu", 49.5], ["ark", 45.5], ["arst", 33.5], ["army", 40], ["aub", 52.5],
  ["ball", 20], ["baylor", 47], ["bsu", 50.5], ["bc", 37.5], ["bg", 26.5],
  ["buff", 28], ["byu", 57.5], ["cmu", 30.5], ["cal", 45.5], ["char", 20.5],
  ["cin", 44.5], ["clem", 54], ["ccu", 28], ["colo", 43], ["csu", 32.5],
  ["uconn", 31.5], ["del", 31], ["duke", 46.5], ["emu", 28], ["ecu", 40.5],
  ["fau", 33.5], ["fiu", 28.5], ["fla", 55.5], ["fsu", 50], ["fres", 42.5],
  ["gaso", 33.5], ["uga", 67.5], ["gast", 23], ["gt", 49], ["haw", 38.5],
  ["hou", 53], ["ill", 51], ["ind", 66], ["iowa", 55.5], ["isu", 41.5],
  ["jvst", 34], ["jmu", 41.5], ["ku", 46], ["ksu", 51], ["kennesaw", 31.5],
  ["kent", 23.5], ["uk", 47], ["ul", 32.5], ["ulm", 22], ["lib", 34.5],
  ["lt", 33], ["lou", 53.5], ["lsu", 60.5], ["mrsh", 34], ["md", 45.5],
  ["umass", 16], ["mem", 41], ["mia", 63], ["miami-oh", 36], ["mich", 59],
  ["msu", 42.5], ["mtsu", 21], ["minn", 49], ["msst", 47], ["mizz", 54.5],
  ["most", 25], ["ndsu", 37], ["niu", 21.5], ["nav", 44], ["ncsu", 48],
  ["neb", 50.5], ["nev", 28], ["unm", 42], ["nmsu", 25], ["unc", 44.5],
  ["northtx", 34.5], ["nw", 45.5], ["nd", 68.5], ["osu", 71], ["ohio", 31.5],
  ["ou", 61], ["okst", 46.5], ["odu", 37], ["miss", 60.5], ["ore", 68.5],
  ["orst", 32], ["psu", 57], ["pitt", 50.5], ["pur", 39], ["rice", 27.5],
  ["rut", 42.5], ["usa", 29], ["sac", 21.5], ["shsu", 18.5], ["sdsu", 43],
  ["sjsu", 27], ["smu", 55.5], ["sc", 54], ["usf", 41], ["usm", 25.5],
  ["stan", 39], ["syr", 42], ["tcu", 51], ["temple", 34], ["tenn", 57],
  ["tex", 66], ["tamu", 62.5], ["txst", 37.5], ["ttu", 61.5], ["tolu", 35.5],
  ["troy", 36], ["tulane", 42.5], ["tulsa", 32.5], ["utsa", 41], ["uab", 26],
  ["ucf", 44.5], ["ucla", 48], ["unlv", 44], ["usc", 60], ["utah", 54.5],
  ["usu", 36.5], ["ute", 22.5], ["van", 51.5], ["uva", 50.5], ["vt", 51],
  ["wku", 36.5], ["wmu", 37.5], ["wake", 46.5], ["uw", 56.5], ["wsu", 38],
  ["wvu", 45], ["wisc", 47.5], ["wyo", 30.5],
];

/** Internal model input transcribed from the verified 2026 guide power-rating table. */
export const CFB_PRESEASON_MARKET_BASELINE_2026: readonly CfbPreseasonMarketBaseline[] =
  Object.freeze(ratings.map(([teamId, sourcePowerRating]) => Object.freeze({
    teamId,
    sourcePowerRating,
    source: CFB_PRESEASON_MARKET_BASELINE_SOURCE,
    sourceStatus: "verified-guide" as const,
    mappedAt: "2026-08-10" as const,
    version: "2026-v1" as const,
  })));
