/**
 * Centralized College Football logo mapping.
 * Uses ESPN NCAA logo CDN with consistent sizing. Components should only call
 * getCfbTeamLogoUrl / resolveCfbLogo — never hardcode external logo URLs.
 */

const ESPN_NCAA_LOGO = (espnId: number) =>
  `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;

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
