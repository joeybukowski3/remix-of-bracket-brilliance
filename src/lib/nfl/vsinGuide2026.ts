import rawGuide from "../../data/nflVsinGuide2026.json";

export type NflVsinGuideStat = {
  key: string;
  label: string;
  displayValue: string;
  rank: number;
};

export type NflVsinGuideOdds = {
  superBowl: { label: "Super Bowl"; displayValue: string };
  conference: { label: string; displayValue: string };
  division: { label: string; displayValue: string };
};

export type NflVsinGuideTeam = {
  team: string;
  abbr: string;
  conference: string;
  division: string;
  sourcePage: number;
  odds: NflVsinGuideOdds;
  statistics: {
    offense: NflVsinGuideStat[];
    defense: NflVsinGuideStat[];
  };
};

type RawField = { key: string; label: string };
type RawStat = [string, number];
type RawTeam = {
  team: string;
  division: string;
  conference: string;
  sourcePage: number;
  odds: [string, string, string];
  offense: RawStat[];
  defense: RawStat[];
};

const offenseFields = rawGuide.offenseFields as RawField[];
const defenseFields = rawGuide.defenseFields as RawField[];
const rawTeams = rawGuide.teams as Record<string, RawTeam>;

function expandStats(fields: RawField[], values: RawStat[]): NflVsinGuideStat[] {
  if (fields.length !== values.length) {
    throw new Error(`VSiN guide stat shape mismatch: ${fields.length} fields and ${values.length} values`);
  }

  return fields.map((field, index) => ({
    ...field,
    displayValue: values[index][0],
    rank: values[index][1],
  }));
}

export function getNflVsinGuideTeam(abbr: string): NflVsinGuideTeam | null {
  const normalizedAbbr = abbr.trim().toLowerCase();
  const rawTeam = rawTeams[normalizedAbbr];
  if (!rawTeam) return null;

  return {
    team: rawTeam.team,
    abbr: normalizedAbbr,
    conference: rawTeam.conference,
    division: rawTeam.division,
    sourcePage: rawTeam.sourcePage,
    odds: {
      superBowl: { label: "Super Bowl", displayValue: rawTeam.odds[0] },
      conference: { label: rawTeam.conference, displayValue: rawTeam.odds[1] },
      division: { label: rawTeam.division, displayValue: rawTeam.odds[2] },
    },
    statistics: {
      offense: expandStats(offenseFields, rawTeam.offense),
      defense: expandStats(defenseFields, rawTeam.defense),
    },
  };
}

export const NFL_VSIN_GUIDE_TEAM_ABBRS = Object.freeze(Object.keys(rawTeams));

export const NFL_VSIN_GUIDE_SOURCE = Object.freeze({
  title: rawGuide.source.title,
  guideSeason: rawGuide.source.guideSeason,
  statsSeason: rawGuide.source.statsSeason,
});
