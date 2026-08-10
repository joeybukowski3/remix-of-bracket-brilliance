import { CFB_TEAM_METADATA } from "./teamMetadata";

export type CfbExternalTeamMapping = {
  jkbTeamId: string;
  jkbSlug: string;
  cfbdName: string;
  espnId: number;
};

const CFBD_NAME_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  fiu: "Florida International",
  miss: "Ole Miss",
  ncsu: "NC State",
  uconn: "UConn",
  ulm: "UL Monroe",
  umass: "Massachusetts",
});

const CFBD_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "app state": "app",
  "appalachian st": "app",
  "connecticut huskies": "uconn",
  "hawai i": "haw",
  "la monroe": "ulm",
  "louisiana monroe": "ulm",
  "miami ohio": "miami-oh",
  "mississippi": "miss",
  "nc state": "ncsu",
  "north carolina state": "ncsu",
  "ole miss": "miss",
  "southern california": "usc",
  "texas a m": "tamu",
  "utsa roadrunners": "utsa",
});

export function normalizeCfbdTeamName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(state)\b/g, "state")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const CFB_EXTERNAL_TEAM_MAPPINGS: CfbExternalTeamMapping[] = CFB_TEAM_METADATA.map(
  (team) => ({
    jkbTeamId: team.id,
    jkbSlug: team.slug,
    cfbdName: CFBD_NAME_OVERRIDES[team.id] ?? team.name,
    espnId: team.espnId,
  }),
);

const JKB_ID_BY_CFBD_NAME = new Map<string, string>();
for (const mapping of CFB_EXTERNAL_TEAM_MAPPINGS) {
  JKB_ID_BY_CFBD_NAME.set(normalizeCfbdTeamName(mapping.cfbdName), mapping.jkbTeamId);
}
for (const [alias, teamId] of Object.entries(CFBD_ALIASES)) {
  JKB_ID_BY_CFBD_NAME.set(normalizeCfbdTeamName(alias), teamId);
}

export function getJkbTeamIdForCfbdName(name: string): string | null {
  return JKB_ID_BY_CFBD_NAME.get(normalizeCfbdTeamName(name)) ?? null;
}
