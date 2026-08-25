const PLAYER_SUFFIX = /^(?:jr\.?|sr\.?|ii|iii|iv)$/i;

export function mobilePlayerLastName(playerName: string): string {
  const parts = playerName.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && PLAYER_SUFFIX.test(parts.at(-1)!)) parts.pop();
  return parts.at(-1) ?? playerName.trim();
}
