export const NCAA_BASE_PATH = "/ncaa";
export const NCAA_SCHEDULE_PATH = `${NCAA_BASE_PATH}/schedule`;
export const NCAA_MATCHUP_PATH = `${NCAA_BASE_PATH}/matchup`;
export const NCAA_BETTING_EDGE_PATH = `${NCAA_BASE_PATH}/betting-edge`;
export const NCAA_BRACKET_PATH = `${NCAA_BASE_PATH}/bracket`;

export function getNcaaScheduleGamePath(gameId: string) {
  return `${NCAA_SCHEDULE_PATH}/${gameId}`;
}

export function getNcaaMatchupDetailPath(matchupId: string) {
  return `${NCAA_MATCHUP_PATH}/${matchupId}`;
}
