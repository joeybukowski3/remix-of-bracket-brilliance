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
  acc: { id: "acc", slug: "acc", name: "ACC", shortName: "ACC" },
  american: { id: "american", slug: "american", name: "American", shortName: "AAC" },
  "big-12": { id: "big-12", slug: "big-12", name: "Big 12", shortName: "Big 12" },
  "big-ten": { id: "big-ten", slug: "big-ten", name: "Big Ten", shortName: "Big Ten" },
  "conference-usa": {
    id: "conference-usa",
    slug: "conference-usa",
    name: "Conference USA",
    shortName: "CUSA",
  },
  mac: { id: "mac", slug: "mac", name: "MAC", shortName: "MAC" },
  "mountain-west": {
    id: "mountain-west",
    slug: "mountain-west",
    name: "Mountain West",
    shortName: "MW",
  },
  "pac-12": { id: "pac-12", slug: "pac-12", name: "Pac-12", shortName: "Pac-12" },
  sec: { id: "sec", slug: "sec", name: "SEC", shortName: "SEC" },
  "sun-belt": { id: "sun-belt", slug: "sun-belt", name: "Sun Belt", shortName: "Sun Belt" },
  independents: {
    id: "independents",
    slug: "independents",
    name: "Independents",
    shortName: "IND",
  },
};

export function getConferenceMeta(id: CfbConferenceId): CfbConferenceMeta {
  return CFB_CONFERENCES[id];
}

export function getConferenceBySlug(slug: string): CfbConferenceMeta | undefined {
  return Object.values(CFB_CONFERENCES).find((c) => c.slug === slug);
}
