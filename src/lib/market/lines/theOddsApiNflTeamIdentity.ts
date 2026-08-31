/**
 * Deterministic mapping from a The Odds API NFL team name to the canonical
 * nflverse team code used by JKB's NFL schedule identity.
 *
 * The Odds API returns full club names ("San Francisco 49ers", "Washington
 * Commanders"). Those are resolved through an explicit, reviewed full-name table
 * (provider-neutral — no other provider's identity module is imported), then
 * folded to the canonical nflverse token by {@link normalizeNflTeamAbbr}. There
 * is no fuzzy matching — an unrecognised name returns `null` and the caller
 * reports the game unmatched.
 */

import { normalizeNflTeamAbbr } from "../../nfl/identity/identity";

/**
 * NFL full club name (lower-cased) → team abbreviation. The abbreviation is
 * normalised to the canonical nflverse token downstream by
 * {@link normalizeNflTeamAbbr}, so relocation / alias codes (WAS→wsh, LAR→lar,
 * JAX→jax, ARI→ari …) do not need to be pre-folded here.
 */
const NFL_NAME_TO_ABBR: Readonly<Record<string, string>> = {
  "arizona cardinals": "ARI",
  "atlanta falcons": "ATL",
  "baltimore ravens": "BAL",
  "buffalo bills": "BUF",
  "carolina panthers": "CAR",
  "chicago bears": "CHI",
  "cincinnati bengals": "CIN",
  "cleveland browns": "CLE",
  "dallas cowboys": "DAL",
  "denver broncos": "DEN",
  "detroit lions": "DET",
  "green bay packers": "GB",
  "houston texans": "HOU",
  "indianapolis colts": "IND",
  "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC",
  "las vegas raiders": "LV",
  "los angeles chargers": "LAC",
  "los angeles rams": "LAR",
  "miami dolphins": "MIA",
  "minnesota vikings": "MIN",
  "new england patriots": "NE",
  "new orleans saints": "NO",
  "new york giants": "NYG",
  "new york jets": "NYJ",
  "philadelphia eagles": "PHI",
  "pittsburgh steelers": "PIT",
  "san francisco 49ers": "SF",
  "seattle seahawks": "SEA",
  "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN",
  "washington commanders": "WAS",
};

export function resolveTheOddsApiNflTeamId(
  teamName: string | null | undefined,
): string | null {
  const raw = String(teamName ?? "").trim();
  if (raw === "") return null;
  const abbr = NFL_NAME_TO_ABBR[raw.toLowerCase()];
  if (abbr === undefined) return null;
  return normalizeNflTeamAbbr(abbr);
}
