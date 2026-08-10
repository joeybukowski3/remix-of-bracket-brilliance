export function assertCompleteCfbRatings(
  ratings: ReadonlyArray<{ teamId: string; status: "computed" | "insufficient-data" }>,
  expectedTeamCount = 138,
): void {
  const insufficient = ratings
    .filter((rating) => rating.status === "insufficient-data")
    .map((rating) => rating.teamId);
  const computed = ratings.length - insufficient.length;
  if (ratings.length !== expectedTeamCount || insufficient.length > 0) {
    throw new Error(
      `Expected ${expectedTeamCount} computed ratings; received ${computed}; ` +
        `insufficient-data teams: ${insufficient.join(", ") || "none"}`,
    );
  }
}
