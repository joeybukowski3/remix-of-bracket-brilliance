/**
 * Back-compatible re-export of the official AP rank map.
 *
 * The authoritative source is now the generated official-rankings artifact
 * (data/generated/cfb/2026-rankings.json) loaded by ./officialRankings — this
 * module is kept so existing importers (the market-anchor build script) keep
 * working unchanged. AP rank remains a comparison field, never a JKB input.
 */
export { CFB_AP_RANKS_2026 } from "./officialRankings";
