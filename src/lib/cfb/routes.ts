export const CFB_BASE_PATH = "/college-football";
export const CFB_RANKINGS_PATH = `${CFB_BASE_PATH}/rankings`;
export const CFB_SCHEDULE_PATH = `${CFB_BASE_PATH}/schedule`;
export const CFB_TEAM_PATH = `${CFB_BASE_PATH}/team`;
export const CFB_MATCHUP_PATH = `${CFB_BASE_PATH}/matchup`;
export const CFB_CONFERENCE_PATH = `${CFB_BASE_PATH}/conference`;

export function getCfbTeamPath(teamSlug: string): string {
  return `${CFB_TEAM_PATH}/${teamSlug}`;
}

export function getCfbMatchupPath(gameId: string): string {
  return `${CFB_MATCHUP_PATH}/${gameId}`;
}

export function getCfbConferencePath(conferenceSlug: string): string {
  return `${CFB_CONFERENCE_PATH}/${conferenceSlug}`;
}
