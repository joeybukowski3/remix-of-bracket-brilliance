// Phase 7 — raw CFBD provider shapes for the three bounded data extensions
// (QB usage, coaching, transfer portal). Kept local to Phase 7 rather than
// added to the shared research/types.ts so Phase 0-6 files are never
// touched by this work (Section 28 production safety).

export type CfbdResearchPlayerUsageRaw = {
  season: number;
  id: string;
  name: string;
  position: string;
  team: string;
  conference?: string | null;
  usage: {
    overall: number;
    pass: number;
    rush: number;
    firstDown: number;
    secondDown: number;
    thirdDown: number;
    standardDowns: number;
    passingDowns: number;
  };
};

export type CfbdResearchCoachSeasonRaw = {
  teamId: number;
  school: string;
  conference?: string | null;
  year: number;
  games?: number | null;
  wins?: number | null;
  losses?: number | null;
};

export type CfbdResearchCoachRaw = {
  id: number;
  firstName: string;
  lastName: string;
  hireDate: string | null;
  seasons: CfbdResearchCoachSeasonRaw[];
};

export type CfbdResearchTransferPortalRaw = {
  season: number;
  firstName: string;
  lastName: string;
  position: string | null;
  origin: string | null;
  destination: string | null;
  transferDate: string | null;
  rating: number | null;
  stars: number | null;
  eligibility: string | null;
};
