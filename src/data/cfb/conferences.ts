import type { CfbConferenceId, CfbConferenceMeta } from "./types";

/** Display order for conference cards (roughly power-conference first, then alphabetical group). */
export const CFB_CONFERENCE_ORDER: CfbConferenceId[] = [
  "sec",
  "big-ten",
  "big-12",
  "acc",
  "american",
  "pac-12",
  "mountain-west",
  "sun-belt",
  "mac",
  "conference-usa",
  "independents",
];

export const CFB_CONFERENCES: Record<CfbConferenceId, CfbConferenceMeta> = {
  acc: { id: "acc", slug: "acc", name: "ACC", shortName: "ACC", fullName: "Atlantic Coast Conference" },
  american: {
    id: "american",
    slug: "american",
    name: "American",
    shortName: "AAC",
    fullName: "American Athletic Conference",
  },
  "big-12": {
    id: "big-12",
    slug: "big-12",
    name: "Big 12",
    shortName: "Big 12",
    fullName: "Big 12 Conference",
  },
  "big-ten": {
    id: "big-ten",
    slug: "big-ten",
    name: "Big Ten",
    shortName: "Big Ten",
    fullName: "Big Ten Conference",
  },
  "conference-usa": {
    id: "conference-usa",
    slug: "conference-usa",
    name: "Conference USA",
    shortName: "CUSA",
    fullName: "Conference USA",
  },
  mac: { id: "mac", slug: "mac", name: "MAC", shortName: "MAC", fullName: "Mid-American Conference" },
  "mountain-west": {
    id: "mountain-west",
    slug: "mountain-west",
    name: "Mountain West",
    shortName: "MW",
    fullName: "Mountain West Conference",
  },
  "pac-12": {
    id: "pac-12",
    slug: "pac-12",
    name: "Pac-12",
    shortName: "Pac-12",
    fullName: "Pac-12 Conference",
  },
  sec: { id: "sec", slug: "sec", name: "SEC", shortName: "SEC", fullName: "Southeastern Conference" },
  "sun-belt": {
    id: "sun-belt",
    slug: "sun-belt",
    name: "Sun Belt",
    shortName: "Sun Belt",
    fullName: "Sun Belt Conference",
  },
  independents: {
    id: "independents",
    slug: "independents",
    name: "Independents",
    shortName: "IND",
    fullName: "FBS Independents",
  },
};

export function getConferenceMeta(id: CfbConferenceId): CfbConferenceMeta {
  return CFB_CONFERENCES[id];
}

export function getConferenceBySlug(slug: string): CfbConferenceMeta | undefined {
  return Object.values(CFB_CONFERENCES).find((c) => c.slug === slug);
}
