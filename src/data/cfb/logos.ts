/**
 * Centralized College Football logo mapping.
 * Uses ESPN NCAA logo CDN with consistent sizing. Components should only call
 * getCfbTeamLogoUrl / resolveCfbLogo — never hardcode external logo URLs.
 */

import type { CfbConferenceId } from "./types";

const ESPN_NCAA_LOGO = (espnId: number) =>
  `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;

const ESPN_NCAA_CONFERENCE_LOGO = (slug: string) =>
  `https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${slug}.png`;

/**
 * ESPN conference-logo CDN slugs, verified against ESPN's college-football
 * groups API (season 2026, FBS group 80 children) — each entry below 200'd
 * as image/png at fetch time. Independents included; no conference in
 * CFB_CONFERENCE_ORDER is intentionally omitted.
 */
const CFB_CONFERENCE_LOGO_SLUGS: Record<CfbConferenceId, string> = {
  acc: "acc",
  american: "american",
  "big-12": "big_12",
  "big-ten": "big_ten",
  "conference-usa": "conference_usa",
  mac: "mid_american",
  "mountain-west": "mountain_west",
  "pac-12": "pac_12",
  sec: "sec",
  "sun-belt": "sun_belt",
  independents: "fbs_independents",
};

export function getCfbConferenceLogoUrl(id: CfbConferenceId): string | null {
  const slug = CFB_CONFERENCE_LOGO_SLUGS[id];
  return slug ? ESPN_NCAA_CONFERENCE_LOGO(slug) : null;
}

/** Optional overrides when ESPN id mapping needs a different asset. */
const LOGO_OVERRIDES: Record<string, string> = {
  // Keep empty by default; add teamId -> url when a CDN asset is broken.
};

export function getCfbTeamLogoUrl(espnId: number, teamId?: string): string {
  if (teamId && LOGO_OVERRIDES[teamId]) return LOGO_OVERRIDES[teamId];
  return ESPN_NCAA_LOGO(espnId);
}

export function resolveCfbLogo(input: {
  espnId?: number | null;
  teamId?: string;
  logo?: string | null;
}): string | null {
  if (input.logo) return input.logo;
  if (input.espnId != null && input.espnId > 0) {
    return getCfbTeamLogoUrl(input.espnId, input.teamId);
  }
  return null;
}
