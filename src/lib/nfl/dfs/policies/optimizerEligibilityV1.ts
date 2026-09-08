/** Downstream selection policy, never a fantasy projection adjustment. */
export const OPTIMIZER_ELIGIBILITY_V1 = {
  version: "nfl-dfs-optimizer-eligibility-v1",
  maxUsageAgeHours: 48,
  maxAvailabilityAgeHours: 48,
  positions: {
    QB: { points: 8, carries: null, targets: null, roleDepth: 1 },
    RB: { points: 3, carries: 4, targets: 2, roleDepth: 2 },
    WR: { points: 3, carries: null, targets: 2, roleDepth: 1 },
    TE: { points: 2, carries: null, targets: 1.5, roleDepth: 2 },
  },
} as const;
