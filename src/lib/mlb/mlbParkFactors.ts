/**
 * Park factor lookup for MLB venues.
 *
 * Values are 100-indexed (100 = league average, >100 = hitter-friendly, <100 = pitcher-friendly).
 * HR-specific factors skew more extreme than overall run factors.
 * Sources: Baseball Savant, ESPN Stats, Baseball Reference multi-year averages.
 */

const PARK_FACTORS: Record<string, { runs: number; hr: number }> = {
  "American Family Field":       { runs: 108, hr: 110 },
  "Angel Stadium":               { runs: 100, hr: 102 },
  "Busch Stadium":               { runs: 94,  hr: 92  },
  "Chase Field":                 { runs: 102, hr: 101 },
  "Citi Field":                  { runs: 101, hr: 106 },
  "Citizens Bank Park":          { runs: 112, hr: 117 },
  "Comerica Park":               { runs: 96,  hr: 95  },
  "Coors Field":                 { runs: 118, hr: 140 },
  "Daikin Park":                 { runs: 102, hr: 104 },
  "Dodger Stadium":              { runs: 99,  hr: 110 },
  "Fenway Park":                 { runs: 103, hr: 95  },
  "Globe Life Field":            { runs: 101, hr: 99  },
  "Great American Ball Park":    { runs: 112, hr: 125 },
  "Guaranteed Rate Field":       { runs: 104, hr: 107 },
  "Kauffman Stadium":            { runs: 98,  hr: 96  },
  "loanDepot park":              { runs: 93,  hr: 88  },
  "Nationals Park":              { runs: 99,  hr: 98  },
  "Oracle Park":                 { runs: 92,  hr: 85  },
  "Oriole Park at Camden Yards": { runs: 106, hr: 110 },
  "Petco Park":                  { runs: 93,  hr: 89  },
  "PNC Park":                    { runs: 95,  hr: 90  },
  "Progressive Field":           { runs: 97,  hr: 91  },
  "Rate Field":                  { runs: 104, hr: 107 },
  "Rogers Centre":               { runs: 105, hr: 108 },
  "Sutter Health Park":          { runs: 98,  hr: 96  },
  "T-Mobile Park":               { runs: 96,  hr: 93  },
  "Target Field":                { runs: 98,  hr: 97  },
  "Truist Park":                 { runs: 101, hr: 103 },
  "Wrigley Field":               { runs: 102, hr: 100 },
  "Yankee Stadium":              { runs: 110, hr: 118 },
};

const PARK_ALIASES: Record<string, string> = {
  "angel stadium of anaheim":    "Angel Stadium",
  "camden yards":                "Oriole Park at Camden Yards",
  "guaranteed rate field":       "Rate Field",
  "loandepot park":              "loanDepot park",
  "marlins park":                "loanDepot park",
  "minute maid park":            "Daikin Park",
  "oriole park":                 "Oriole Park at Camden Yards",
  "rogers center":               "Rogers Centre",
  "tropicana field":             "Rate Field", // TB now at Steinbrenner/neutral; keep Rate as placeholder
  "u.s. cellular field":         "Rate Field",
  "us cellular field":           "Rate Field",
};

function normalizeVenue(venue: string): string {
  return venue.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getParkFactors(venue: string | null | undefined): { runs: number; hr: number } | null {
  if (!venue) return null;
  const key = normalizeVenue(venue);
  const canonical = PARK_ALIASES[key] ?? venue.trim();
  return PARK_FACTORS[canonical] ?? null;
}

export function getParkType(runFactor: number): string {
  if (runFactor >= 110) return "Hitter-friendly park";
  if (runFactor >= 105) return "Slight hitter's park";
  if (runFactor <= 90)  return "Pitcher-friendly park";
  if (runFactor <= 95)  return "Slight pitcher's park";
  return "Neutral park";
}
