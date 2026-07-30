/**
 * Shared HR selection for the "Social Media Tables" surface -- extracted
 * verbatim from the previously inline filter/sort/slice inside
 * SocialTableHR (src/pages/MlbGameDetail.tsx), so the website and the live
 * daily-card generator (scripts/generate-social-card-live.ts) consume the
 * exact same ordering, just capped at a different `max`.
 */
import type { HrDashboardBatter } from '@/pages/MlbHrProps';

/**
 * Filters out batters with a barrel rate above 25% (already-elite contact
 * quality skews the model differently) or fewer than 50 at-bats (too small
 * a sample), then ranks by `hrScore` descending, capped at `max`.
 */
export function selectTopSocialHrRows(batters: HrDashboardBatter[], { max = 8 }: { max?: number } = {}): HrDashboardBatter[] {
  return batters
    .filter((b) => !(b.barrelRate != null && b.barrelRate > 25) && !(b.atBats != null && b.atBats < 50))
    .slice()
    .sort((a, b) => b.hrScore - a.hrScore)
    .slice(0, max);
}
