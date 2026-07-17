import teamsArtifact from "../../../public/data/nfl/teams.json";
import {
  NFL_NOTABLE_PLAYER_MOVES,
  NFL_OFFSEASON_DATA_VERIFIED_AT,
  getNflOffseasonProfile,
  type NflMoveMethod,
  type NflOffseasonProfile,
  type NflPlayerMove,
} from "@/data/nflOffseason2026";
import { WS_PROJECTED_QB_2026 } from "@/data/nflWarrenSharpAdvanced2026";
import {
  WS_TEAMS_2026,
  type WarrenSharpTeamProfile2026,
  type WsCoachingStaff,
  type WsDraftAddition,
  type WsPersonnelMove,
} from "@/lib/nfl/warrenSharpTeams2026";
import { NFL_VSIN_GUIDE_SOURCE, NFL_VSIN_GUIDE_TEAM_ABBRS } from "@/lib/nfl/vsinGuide2026";
import { WARREN_SHARP_SCHEDULE_SOURCE, WARREN_SHARP_SCHEDULE_TEAM_ABBRS } from "@/lib/nfl/warrenSharpSchedule2026";

export type NflEvidenceConfidence = "high" | "medium" | "low";

export type NflPersonnelEvidenceKind =
  | "returning_player"
  | "returning_from_injury"
  | "free_agent_addition"
  | "trade_addition"
  | "draft_addition"
  | "other_addition"
  | "free_agent_departure"
  | "trade_departure"
  | "retirement"
  | "other_departure";

export type NflCoachingEvidenceKind =
  | "returning_head_coach"
  | "new_head_coach"
  | "returning_offensive_coordinator"
  | "new_offensive_coordinator"
  | "returning_defensive_coordinator"
  | "new_defensive_coordinator"
  | "scheme_change";

export type NflEvidenceSource = {
  sourceId: string;
  sourceName: string;
  sourceType:
    | "repository_manual"
    | "warren_sharp"
    | "vsin"
    | "official_team"
    | "league"
    | "other";
  sourcePath: string;
  sourceUpdatedAt: string | null;
  sourcePage?: string | number | null;
  sourceUrl?: string | null;
  verified: boolean;
};

export type NflEvidenceStatus = "verified" | "partially_verified" | "unverified";

export type NflPersonnelEvidenceItem = {
  id: string;
  teamId: string;
  playerName: string;
  normalizedPlayerName: string;
  position: string | null;
  kind: NflPersonnelEvidenceKind;
  expectedRole: "starter" | "rotation" | "depth" | "developmental" | "unknown";
  significance: "major" | "notable" | "minor" | "unknown";
  evidenceStatus: NflEvidenceStatus;
  notes: string | null;
  source: NflEvidenceSource;
  sources: NflEvidenceSource[];
};

export type NflCoachingEvidenceItem = {
  id: string;
  teamId: string;
  coachName: string | null;
  normalizedCoachName: string | null;
  role: "head_coach" | "offensive_coordinator" | "defensive_coordinator" | "other";
  kind: NflCoachingEvidenceKind;
  continuityStatus: "returning" | "new" | "changed_role" | "unknown";
  evidenceStatus: NflEvidenceStatus;
  notes: string | null;
  source: NflEvidenceSource;
  sources: NflEvidenceSource[];
};

export type NflOffseasonEvidenceRecord = {
  teamId: string;
  abbr: string;
  slug: string;
  name: string;
  season: number;
  quarterbackContinuity: "returning_starter" | "new_starter" | "competition" | "unknown";
  personnel: NflPersonnelEvidenceItem[];
  coaching: NflCoachingEvidenceItem[];
  coverage: {
    additionsComplete: boolean;
    departuresComplete: boolean;
    returningPlayersComplete: boolean;
    injuryReturnsComplete: boolean;
    coachingComplete: boolean;
  };
  confidence: {
    level: NflEvidenceConfidence;
    missingReasons: string[];
    warnings: string[];
  };
  sources: NflEvidenceSource[];
};

export type NflOffseasonEvidenceValidation = {
  warnings: string[];
  errors: string[];
};

export type NflOffseasonEvidenceDatasetMetadata = {
  targetSeason: 2026;
  teamCount: number;
  assembledAt: "2026-07-17";
  sourceCutoffDates: Record<string, string | null>;
  sourcesUsed: NflEvidenceSource[];
  completenessSummary: {
    additionsComplete: number;
    departuresComplete: number;
    returningPlayersComplete: number;
    injuryReturnsComplete: number;
    coachingComplete: number;
  };
  teamConfidenceDistribution: Record<NflEvidenceConfidence, number>;
  unresolvedConflictCount: number;
  missingCategoryCounts: Record<string, number>;
};

export type NflOffseasonEvidenceDataset = {
  metadata: NflOffseasonEvidenceDatasetMetadata;
  records: NflOffseasonEvidenceRecord[];
  validation: NflOffseasonEvidenceValidation;
};

export type BuildNflOffseasonEvidenceDatasetInput = {
  teamsArtifact?: unknown;
  warrenSharpTeams?: readonly WarrenSharpTeamProfile2026[];
  manualProfiles?: readonly NflOffseasonProfile[];
  projectedQuarterbacks?: Readonly<Record<string, string>>;
};

type UnknownRecord = Record<string, unknown>;

type CanonicalTeam = {
  id: string;
  slug: string;
  abbr: string;
  name: string;
};

type PersonnelDraft = Omit<NflPersonnelEvidenceItem, "id" | "source" | "sources"> & {
  sources: NflEvidenceSource[];
};

type CoachingDraft = Omit<NflCoachingEvidenceItem, "id" | "source" | "sources"> & {
  sources: NflEvidenceSource[];
};

const TARGET_SEASON = 2026 as const;
const TEAMS_ARTIFACT_PATH = "public/data/nfl/teams.json";
const MANUAL_OFFSEASON_PATH = "src/data/nflOffseason2026.ts";
const WARREN_SHARP_TEAMS_PATH = "src/data/nflWarrenSharpTeams2026.ts";
const WARREN_SHARP_ADVANCED_PATH = "src/data/nflWarrenSharpAdvanced2026.ts";
const VSIN_GUIDE_PATH = "src/data/nflVsinGuide2026.json";
const WARREN_SHARP_SCHEDULE_PATH = "src/data/nflWarrenSharpSchedule2026.json";

const PERSONNEL_KIND_RANK: Record<NflPersonnelEvidenceKind, number> = {
  returning_player: 0,
  returning_from_injury: 0,
  free_agent_addition: 4,
  trade_addition: 4,
  draft_addition: 4,
  other_addition: 1,
  free_agent_departure: 4,
  trade_departure: 4,
  retirement: 4,
  other_departure: 1,
};

const EVIDENCE_STATUS_RANK: Record<NflEvidenceStatus, number> = {
  verified: 3,
  partially_verified: 2,
  unverified: 1,
};

const SIGNIFICANCE_RANK: Record<NflPersonnelEvidenceItem["significance"], number> = {
  major: 4,
  notable: 3,
  minor: 2,
  unknown: 1,
};

const ROLE_RANK: Record<NflPersonnelEvidenceItem["expectedRole"], number> = {
  starter: 5,
  rotation: 4,
  depth: 3,
  developmental: 2,
  unknown: 1,
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string`);
  return value;
}

function canonicalTeamsFromArtifact(artifact: unknown): CanonicalTeam[] {
  if (!isRecord(artifact) || !Array.isArray(artifact.teams)) throw new Error(`${TEAMS_ARTIFACT_PATH}.teams must be an array`);
  const seenIds = new Set<string>();
  const seenAbbrs = new Set<string>();

  return artifact.teams.map((row, index) => {
    if (!isRecord(row)) throw new Error(`${TEAMS_ARTIFACT_PATH}.teams[${index}] must be an object`);
    const team = {
      id: requireString(row.id, `${TEAMS_ARTIFACT_PATH}.teams[${index}].id`),
      slug: requireString(row.slug, `${TEAMS_ARTIFACT_PATH}.teams[${index}].slug`),
      abbr: requireString(row.abbr, `${TEAMS_ARTIFACT_PATH}.teams[${index}].abbr`).toLowerCase(),
      name: requireString(row.fullName ?? row.name, `${TEAMS_ARTIFACT_PATH}.teams[${index}].fullName`),
    };
    if (seenIds.has(team.id)) throw new Error(`duplicate canonical team ID ${team.id}`);
    if (seenAbbrs.has(team.abbr)) throw new Error(`duplicate canonical team abbreviation ${team.abbr}`);
    seenIds.add(team.id);
    seenAbbrs.add(team.abbr);
    return team;
  });
}

export function normalizeNflPersonName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[A-Z]{1,3}\s+-\s+/i, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?$/i, "")
    .replace(/[' -]+/g, " ")
    .trim();
}

function sourceKey(source: NflEvidenceSource): string {
  return [
    source.sourceId,
    source.sourcePath,
    source.sourceUpdatedAt ?? "undated",
    source.sourcePage ?? "no-page",
  ].join("|");
}

function mergeSources(sources: readonly NflEvidenceSource[]): NflEvidenceSource[] {
  const byKey = new Map<string, NflEvidenceSource>();
  for (const source of sources) byKey.set(sourceKey(source), source);
  return [...byKey.values()].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
}

function primarySource(sources: readonly NflEvidenceSource[]): NflEvidenceSource {
  const merged = mergeSources(sources);
  return [...merged].sort((a, b) => Number(b.verified) - Number(a.verified) || sourceKey(a).localeCompare(sourceKey(b)))[0];
}

function stableId(parts: readonly string[]): string {
  return parts
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSource(source: NflEvidenceSource): NflEvidenceSource {
  return source;
}

function warrenSharpTeamsSource(sourcePage: number | null): NflEvidenceSource {
  return buildSource({
    sourceId: "warren-sharp-2026-team-profiles",
    sourceName: "Warren Sharp 2026 Football Preview team profiles",
    sourceType: "warren_sharp",
    sourcePath: WARREN_SHARP_TEAMS_PATH,
    sourceUpdatedAt: null,
    sourcePage,
    sourceUrl: null,
    verified: true,
  });
}

function warrenSharpAdvancedSource(sourcePage: number | null): NflEvidenceSource {
  return buildSource({
    sourceId: "warren-sharp-2026-advanced",
    sourceName: "Warren Sharp 2026 Football Preview advanced tables",
    sourceType: "warren_sharp",
    sourcePath: WARREN_SHARP_ADVANCED_PATH,
    sourceUpdatedAt: null,
    sourcePage,
    sourceUrl: null,
    verified: true,
  });
}

function manualOffseasonSource(): NflEvidenceSource {
  return buildSource({
    sourceId: "jkb-manual-offseason-2026",
    sourceName: "JKB manual 2026 offseason snapshot",
    sourceType: "repository_manual",
    sourcePath: MANUAL_OFFSEASON_PATH,
    sourceUpdatedAt: NFL_OFFSEASON_DATA_VERIFIED_AT,
    sourcePage: null,
    sourceUrl: null,
    verified: true,
  });
}

function vsinSource(): NflEvidenceSource {
  return buildSource({
    sourceId: "vsin-2026-guide",
    sourceName: NFL_VSIN_GUIDE_SOURCE.title,
    sourceType: "vsin",
    sourcePath: VSIN_GUIDE_PATH,
    sourceUpdatedAt: null,
    sourcePage: null,
    sourceUrl: null,
    verified: true,
  });
}

function warrenSharpScheduleSource(): NflEvidenceSource {
  return buildSource({
    sourceId: "warren-sharp-2026-schedule",
    sourceName: WARREN_SHARP_SCHEDULE_SOURCE.title,
    sourceType: "warren_sharp",
    sourcePath: WARREN_SHARP_SCHEDULE_PATH,
    sourceUpdatedAt: null,
    sourcePage: WARREN_SHARP_SCHEDULE_SOURCE.strengthOfSchedulePage,
    sourceUrl: null,
    verified: true,
  });
}

function moveKind(method: NflMoveMethod, direction: "addition" | "departure"): NflPersonnelEvidenceKind {
  if (method === "Trade") return direction === "addition" ? "trade_addition" : "trade_departure";
  return direction === "addition" ? "free_agent_addition" : "free_agent_departure";
}

function wsAdditionKind(move: WsPersonnelMove): NflPersonnelEvidenceKind {
  return move.contractNote ? "free_agent_addition" : "other_addition";
}

function notesFromParts(parts: Array<string | null | undefined>): string | null {
  const filtered = parts.filter((part): part is string => Boolean(part && part.trim()));
  return filtered.length ? filtered.join(" · ") : null;
}

function createPersonnelDraft(args: {
  teamId: string;
  playerName: string;
  position: string | null;
  kind: NflPersonnelEvidenceKind;
  expectedRole: NflPersonnelEvidenceItem["expectedRole"];
  significance: NflPersonnelEvidenceItem["significance"];
  evidenceStatus: NflEvidenceStatus;
  notes: string | null;
  sources: NflEvidenceSource[];
}): PersonnelDraft {
  return {
    teamId: args.teamId,
    playerName: args.playerName.trim(),
    normalizedPlayerName: normalizeNflPersonName(args.playerName),
    position: args.position,
    kind: args.kind,
    expectedRole: args.expectedRole,
    significance: args.significance,
    evidenceStatus: args.evidenceStatus,
    notes: args.notes,
    sources: mergeSources(args.sources),
  };
}

function createCoachingDraft(args: {
  teamId: string;
  coachName: string | null;
  role: NflCoachingEvidenceItem["role"];
  kind: NflCoachingEvidenceKind;
  continuityStatus: NflCoachingEvidenceItem["continuityStatus"];
  evidenceStatus: NflEvidenceStatus;
  notes: string | null;
  sources: NflEvidenceSource[];
}): CoachingDraft {
  return {
    teamId: args.teamId,
    coachName: args.coachName,
    normalizedCoachName: args.coachName ? normalizeNflPersonName(args.coachName) : null,
    role: args.role,
    kind: args.kind,
    continuityStatus: args.continuityStatus,
    evidenceStatus: args.evidenceStatus,
    notes: args.notes,
    sources: mergeSources(args.sources),
  };
}

function evidenceCategory(kind: NflPersonnelEvidenceKind): "addition" | "departure" | "returning" | "injury_return" {
  if (kind.endsWith("_addition")) return "addition";
  if (kind === "returning_player") return "returning";
  if (kind === "returning_from_injury") return "injury_return";
  return "departure";
}

function strongerPersonnelKind(a: NflPersonnelEvidenceKind, b: NflPersonnelEvidenceKind): NflPersonnelEvidenceKind {
  return PERSONNEL_KIND_RANK[b] > PERSONNEL_KIND_RANK[a] ? b : a;
}

function strongerStatus(a: NflEvidenceStatus, b: NflEvidenceStatus): NflEvidenceStatus {
  return EVIDENCE_STATUS_RANK[b] > EVIDENCE_STATUS_RANK[a] ? b : a;
}

function strongerSignificance(
  a: NflPersonnelEvidenceItem["significance"],
  b: NflPersonnelEvidenceItem["significance"],
): NflPersonnelEvidenceItem["significance"] {
  return SIGNIFICANCE_RANK[b] > SIGNIFICANCE_RANK[a] ? b : a;
}

function strongerRole(
  a: NflPersonnelEvidenceItem["expectedRole"],
  b: NflPersonnelEvidenceItem["expectedRole"],
): NflPersonnelEvidenceItem["expectedRole"] {
  return ROLE_RANK[b] > ROLE_RANK[a] ? b : a;
}

function mergeNotes(a: string | null, b: string | null): string | null {
  const notes = [a, b].filter((note): note is string => Boolean(note));
  return notes.length ? [...new Set(notes)].join(" · ") : null;
}

export function deduplicateNflEvidence(items: readonly NflPersonnelEvidenceItem[]): NflPersonnelEvidenceItem[] {
  const drafts: PersonnelDraft[] = items.map((item) => ({
    ...item,
    sources: item.sources?.length ? item.sources : [item.source],
  }));
  return finalizePersonnel(drafts).items;
}

function finalizePersonnel(drafts: readonly PersonnelDraft[]): { items: NflPersonnelEvidenceItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const grouped = new Map<string, PersonnelDraft>();

  for (const draft of drafts) {
    const category = evidenceCategory(draft.kind);
    const key = [
      draft.teamId,
      category,
      draft.normalizedPlayerName,
      draft.position ?? "unknown-position",
    ].join("|");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...draft, sources: mergeSources(draft.sources) });
      continue;
    }

    grouped.set(key, {
      ...existing,
      kind: strongerPersonnelKind(existing.kind, draft.kind),
      playerName: existing.playerName.length >= draft.playerName.length ? existing.playerName : draft.playerName,
      expectedRole: strongerRole(existing.expectedRole, draft.expectedRole),
      significance: strongerSignificance(existing.significance, draft.significance),
      evidenceStatus: strongerStatus(existing.evidenceStatus, draft.evidenceStatus),
      notes: mergeNotes(existing.notes, draft.notes),
      sources: mergeSources([...existing.sources, ...draft.sources]),
    });
  }

  const byPlayerCategory = new Map<string, PersonnelDraft[]>();
  for (const item of grouped.values()) {
    const key = [item.teamId, evidenceCategory(item.kind), item.normalizedPlayerName].join("|");
    byPlayerCategory.set(key, [...(byPlayerCategory.get(key) ?? []), item]);
  }
  for (const [key, group] of byPlayerCategory) {
    const positions = new Set(group.map((item) => item.position ?? "unknown"));
    if (group.length > 1 && positions.size > 1) {
      warnings.push(`possible same-name personnel duplicate with different positions: ${key}`);
    }
  }

  const items = [...grouped.values()]
    .map((item) => {
      const sources = mergeSources(item.sources);
      return {
        ...item,
        id: stableId([item.teamId, "personnel", item.kind, item.normalizedPlayerName, item.position ?? "unknown"]),
        source: primarySource(sources),
        sources,
      };
    })
    .sort((a, b) => a.teamId.localeCompare(b.teamId) || a.kind.localeCompare(b.kind) || a.normalizedPlayerName.localeCompare(b.normalizedPlayerName) || (a.position ?? "").localeCompare(b.position ?? ""));

  return { items, warnings };
}

function finalizeCoaching(drafts: readonly CoachingDraft[]): NflCoachingEvidenceItem[] {
  const grouped = new Map<string, CoachingDraft>();
  for (const draft of drafts) {
    const key = [draft.teamId, draft.role, draft.kind, draft.normalizedCoachName ?? "unknown"].join("|");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...draft, sources: mergeSources(draft.sources) });
      continue;
    }
    grouped.set(key, {
      ...existing,
      evidenceStatus: strongerStatus(existing.evidenceStatus, draft.evidenceStatus),
      notes: mergeNotes(existing.notes, draft.notes),
      sources: mergeSources([...existing.sources, ...draft.sources]),
    });
  }
  return [...grouped.values()]
    .map((item) => {
      const sources = mergeSources(item.sources);
      return {
        ...item,
        id: stableId([item.teamId, "coaching", item.role, item.kind, item.normalizedCoachName ?? "unknown"]),
        source: primarySource(sources),
        sources,
      };
    })
    .sort((a, b) => a.teamId.localeCompare(b.teamId) || a.role.localeCompare(b.role) || a.kind.localeCompare(b.kind) || (a.normalizedCoachName ?? "").localeCompare(b.normalizedCoachName ?? ""));
}

function validateSourceTeams(
  sourceName: string,
  sourceAbbrs: readonly string[],
  canonicalByAbbr: ReadonlyMap<string, CanonicalTeam>,
): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const abbr of sourceAbbrs) {
    const normalized = abbr.toLowerCase();
    if (seen.has(normalized)) warnings.push(`${sourceName} contains duplicate team ${normalized}`);
    seen.add(normalized);
    if (!canonicalByAbbr.has(normalized)) warnings.push(`${sourceName} contains orphan team ${normalized}`);
  }
  return warnings;
}

function roleKind(role: "head_coach" | "offensive_coordinator" | "defensive_coordinator", isNew: boolean): NflCoachingEvidenceKind {
  if (role === "head_coach") return isNew ? "new_head_coach" : "returning_head_coach";
  if (role === "offensive_coordinator") return isNew ? "new_offensive_coordinator" : "returning_offensive_coordinator";
  return isNew ? "new_defensive_coordinator" : "returning_defensive_coordinator";
}

function addWarrenSharpCoaching(team: CanonicalTeam, coaching: WsCoachingStaff, drafts: CoachingDraft[]) {
  const source = warrenSharpTeamsSource(coaching.sourcePage);
  drafts.push(
    createCoachingDraft({
      teamId: team.id,
      coachName: coaching.headCoach,
      role: "head_coach",
      kind: roleKind("head_coach", coaching.headCoachNew),
      continuityStatus: coaching.headCoachNew ? "new" : "returning",
      evidenceStatus: "verified",
      notes: `Prior years with team before 2026: ${coaching.headCoachPriorYears}`,
      sources: [source],
    }),
    createCoachingDraft({
      teamId: team.id,
      coachName: coaching.offensiveCoordinator,
      role: "offensive_coordinator",
      kind: roleKind("offensive_coordinator", coaching.offensiveCoordinatorNew),
      continuityStatus: coaching.offensiveCoordinatorNew ? "new" : "returning",
      evidenceStatus: "verified",
      notes: `Prior years with team before 2026: ${coaching.offensiveCoordinatorPriorYears}`,
      sources: [source],
    }),
    createCoachingDraft({
      teamId: team.id,
      coachName: coaching.defensiveCoordinator,
      role: "defensive_coordinator",
      kind: roleKind("defensive_coordinator", coaching.defensiveCoordinatorNew),
      continuityStatus: coaching.defensiveCoordinatorNew ? "new" : "returning",
      evidenceStatus: "verified",
      notes: `Prior years with team before 2026: ${coaching.defensiveCoordinatorPriorYears}`,
      sources: [source],
    }),
  );
}

function addManualCoaching(team: CanonicalTeam, profile: NflOffseasonProfile, drafts: CoachingDraft[]) {
  drafts.push(
    createCoachingDraft({
      teamId: team.id,
      coachName: profile.headCoach2026,
      role: "head_coach",
      kind: profile.status === "Changed" ? "new_head_coach" : "returning_head_coach",
      continuityStatus: profile.status === "Changed" ? "new" : "returning",
      evidenceStatus: "verified",
      notes: profile.note,
      sources: [manualOffseasonSource()],
    }),
  );
}

function addWsPersonnel(team: CanonicalTeam, profile: WarrenSharpTeamProfile2026, drafts: PersonnelDraft[]) {
  for (const move of profile.keyAdditions) {
    drafts.push(
      createPersonnelDraft({
        teamId: team.id,
        playerName: move.player,
        position: move.position || null,
        kind: wsAdditionKind(move),
        expectedRole: "unknown",
        significance: "notable",
        evidenceStatus: move.contractNote || move.previousTeam ? "verified" : "partially_verified",
        notes: notesFromParts([
          "Warren Sharp key addition",
          move.previousTeam ? `previous team ${move.previousTeam}` : null,
          move.contractNote ? `contract note ${move.contractNote}` : null,
        ]),
        sources: [warrenSharpTeamsSource(profile.chapterStartPage)],
      }),
    );
  }

  for (const move of profile.keyDepartures) {
    drafts.push(
      createPersonnelDraft({
        teamId: team.id,
        playerName: move.player,
        position: move.position || null,
        kind: "other_departure",
        expectedRole: "unknown",
        significance: "notable",
        evidenceStatus: move.newTeam ? "verified" : "partially_verified",
        notes: notesFromParts(["Warren Sharp key departure", move.newTeam ? `new team ${move.newTeam}` : null]),
        sources: [warrenSharpTeamsSource(profile.chapterStartPage)],
      }),
    );
  }

  for (const pick of profile.draftAdditions) {
    drafts.push(createDraftPersonnel(team, pick, profile.chapterStartPage));
  }
}

function createDraftPersonnel(team: CanonicalTeam, pick: WsDraftAddition, sourcePage: number): PersonnelDraft {
  return createPersonnelDraft({
    teamId: team.id,
    playerName: pick.player,
    position: pick.position || null,
    kind: "draft_addition",
    expectedRole: "developmental",
    significance: "unknown",
    evidenceStatus: "verified",
    notes: `Draft addition: round ${pick.round}, pick ${pick.pick}, ${pick.college}. Rookie remains unproven by default.`,
    sources: [warrenSharpTeamsSource(sourcePage)],
  });
}

function addManualMoves(team: CanonicalTeam, profile: NflOffseasonProfile, drafts: PersonnelDraft[]) {
  for (const move of profile.additions) drafts.push(createManualMove(team, move, "addition"));
  for (const move of profile.departures) drafts.push(createManualMove(team, move, "departure"));
}

function createManualMove(team: CanonicalTeam, move: NflPlayerMove, direction: "addition" | "departure"): PersonnelDraft {
  return createPersonnelDraft({
    teamId: team.id,
    playerName: move.player,
    position: move.position || null,
    kind: moveKind(move.method, direction),
    expectedRole: "unknown",
    significance: "notable",
    evidenceStatus: "verified",
    notes: `Manual notable ${direction}: ${move.method.toLowerCase()} ${direction === "addition" ? `from ${move.from}` : `to ${move.to}`}`,
    sources: [manualOffseasonSource()],
  });
}

function quarterbackContinuity(
  team: CanonicalTeam,
  personnel: readonly NflPersonnelEvidenceItem[],
  projectedQuarterbacks: Readonly<Record<string, string>>,
): NflOffseasonEvidenceRecord["quarterbackContinuity"] {
  const qb = projectedQuarterbacks[team.abbr];
  if (!qb) return "unknown";
  const normalizedQb = normalizeNflPersonName(qb);
  const qbEvidence = personnel.filter((item) => item.normalizedPlayerName === normalizedQb && item.position === "QB");
  if (qbEvidence.some((item) => item.kind === "draft_addition")) return "new_starter";
  if (qbEvidence.some((item) => evidenceCategory(item.kind) === "addition")) return "new_starter";
  if (qbEvidence.some((item) => evidenceCategory(item.kind) === "departure")) return "unknown";
  return "returning_starter";
}

function addQuarterbackEvidence(
  team: CanonicalTeam,
  projectedQuarterbacks: Readonly<Record<string, string>>,
  personnelDrafts: PersonnelDraft[],
) {
  const qb = projectedQuarterbacks[team.abbr];
  if (!qb) return;
  const normalizedQb = normalizeNflPersonName(qb);
  const existingNonDeparture = personnelDrafts.some(
    (item) =>
      item.teamId === team.id &&
      item.normalizedPlayerName === normalizedQb &&
      item.position === "QB" &&
      evidenceCategory(item.kind) !== "departure",
  );
  if (existingNonDeparture) return;
  personnelDrafts.push(
    createPersonnelDraft({
      teamId: team.id,
      playerName: qb,
      position: "QB",
      kind: "returning_player",
      expectedRole: "starter",
      significance: "notable",
      evidenceStatus: "partially_verified",
      notes: "Projected 2026 starting quarterback from Warren Sharp advanced table; no addition evidence found in bundled offseason sources.",
      sources: [warrenSharpAdvancedSource(42)],
    }),
  );
}

function validateRecord(record: NflOffseasonEvidenceRecord): NflOffseasonEvidenceValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  const byPlayer = new Map<string, NflPersonnelEvidenceItem[]>();

  for (const item of record.personnel) {
    byPlayer.set(item.normalizedPlayerName, [...(byPlayer.get(item.normalizedPlayerName) ?? []), item]);
  }

  for (const [name, items] of byPlayer) {
    const categories = new Set(items.map((item) => evidenceCategory(item.kind)));
    const additionKinds = new Set(items.filter((item) => evidenceCategory(item.kind) === "addition").map((item) => item.kind));
    const departureKinds = new Set(items.filter((item) => evidenceCategory(item.kind) === "departure").map((item) => item.kind));
    if (categories.has("addition") && categories.has("departure")) {
      errors.push(`${record.abbr}: ${name} listed as both addition and departure`);
    }
    if (categories.has("returning") && categories.has("departure")) {
      errors.push(`${record.abbr}: ${name} listed as returning and departing`);
    }
    if (additionKinds.size > 1) warnings.push(`${record.abbr}: ${name} appears across multiple addition kinds`);
    if (departureKinds.size > 1) warnings.push(`${record.abbr}: ${name} appears across multiple departure kinds`);
  }

  for (const role of ["head_coach", "offensive_coordinator", "defensive_coordinator"] as const) {
    const rows = record.coaching.filter((item) => item.role === role);
    const returning = rows.filter((item) => item.continuityStatus === "returning");
    const incoming = rows.filter((item) => item.continuityStatus === "new");
    const names = new Set(rows.map((item) => item.normalizedCoachName ?? "unknown"));
    if (returning.length > 0 && incoming.length > 0) warnings.push(`${record.abbr}: ${role} has both returning and new evidence`);
    if (role === "head_coach" && names.size > 1) errors.push(`${record.abbr}: multiple head coaches without explicit transition`);
    if (names.size > 1 && role !== "head_coach") warnings.push(`${record.abbr}: multiple ${role} names found`);
  }

  const ids = new Set<string>();
  for (const item of [...record.personnel, ...record.coaching]) {
    if (ids.has(item.id)) warnings.push(`${record.abbr}: duplicate evidence id ${item.id}`);
    ids.add(item.id);
  }

  return { warnings, errors };
}

export function validateNflOffseasonEvidence(records: readonly NflOffseasonEvidenceRecord[]): NflOffseasonEvidenceValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  const teamIds = new Set<string>();
  const abbrs = new Set<string>();

  for (const record of records) {
    if (teamIds.has(record.teamId)) errors.push(`duplicate team record ${record.teamId}`);
    if (abbrs.has(record.abbr)) errors.push(`duplicate team abbreviation ${record.abbr}`);
    teamIds.add(record.teamId);
    abbrs.add(record.abbr);
    const validation = validateRecord(record);
    warnings.push(...validation.warnings);
    errors.push(...validation.errors);
  }

  return { warnings: [...new Set(warnings)].sort(), errors: [...new Set(errors)].sort() };
}

function confidenceForRecord(
  record: Omit<NflOffseasonEvidenceRecord, "confidence">,
  validation: NflOffseasonEvidenceValidation,
): NflOffseasonEvidenceRecord["confidence"] {
  const missingReasons: string[] = [];
  if (record.quarterbackContinuity === "unknown") missingReasons.push("quarterback continuity unknown");
  if (!record.coverage.additionsComplete) missingReasons.push("additions source coverage incomplete");
  if (!record.coverage.departuresComplete) missingReasons.push("departures source coverage incomplete");
  if (!record.coverage.returningPlayersComplete) missingReasons.push("structured returning-player source coverage unavailable");
  if (!record.coverage.injuryReturnsComplete) missingReasons.push("player-level injury-return source coverage unavailable");
  if (!record.coverage.coachingComplete) missingReasons.push("coaching source coverage incomplete");
  if (record.sources.some((source) => source.sourceUpdatedAt === null)) missingReasons.push("one or more source dates unavailable");

  const warnings = [...validation.warnings, ...validation.errors];
  let level: NflEvidenceConfidence = "high";
  if (missingReasons.length > 0 || warnings.length > 0) level = "medium";
  if (
    record.quarterbackContinuity === "unknown" ||
    !record.coverage.coachingComplete ||
    !record.coverage.additionsComplete ||
    !record.coverage.departuresComplete ||
    validation.errors.length > 0
  ) {
    level = "low";
  }

  return {
    level,
    missingReasons: [...new Set(missingReasons)].sort(),
    warnings: [...new Set(warnings)].sort(),
  };
}

function buildNflOffseasonEvidenceRecordInternal(args: {
  team: CanonicalTeam;
  wsProfile: WarrenSharpTeamProfile2026 | null;
  manualProfile: NflOffseasonProfile | null;
  projectedQuarterbacks: Readonly<Record<string, string>>;
}): NflOffseasonEvidenceRecord {
  const personnelDrafts: PersonnelDraft[] = [];
  const coachingDrafts: CoachingDraft[] = [];

  if (args.wsProfile) {
    addWarrenSharpCoaching(args.team, args.wsProfile.coaching, coachingDrafts);
    addWsPersonnel(args.team, args.wsProfile, personnelDrafts);
  }
  if (args.manualProfile) {
    addManualCoaching(args.team, args.manualProfile, coachingDrafts);
    addManualMoves(args.team, args.manualProfile, personnelDrafts);
  }
  addQuarterbackEvidence(args.team, args.projectedQuarterbacks, personnelDrafts);

  const personnelResult = finalizePersonnel(personnelDrafts);
  const personnel = personnelResult.items;
  const coaching = finalizeCoaching(coachingDrafts);
  const coverage = {
    additionsComplete: Boolean(args.wsProfile),
    departuresComplete: Boolean(args.wsProfile),
    returningPlayersComplete: false,
    injuryReturnsComplete: false,
    coachingComplete: coaching.some((item) => item.role === "head_coach") && coaching.some((item) => item.role === "offensive_coordinator") && coaching.some((item) => item.role === "defensive_coordinator"),
  };
  const sources = mergeSources([
    ...personnel.flatMap((item) => item.sources),
    ...coaching.flatMap((item) => item.sources),
  ]);
  const base = {
    teamId: args.team.id,
    abbr: args.team.abbr,
    slug: args.team.slug,
    name: args.team.name,
    season: TARGET_SEASON,
    quarterbackContinuity: quarterbackContinuity(args.team, personnel, args.projectedQuarterbacks),
    personnel,
    coaching,
    coverage,
    sources,
  };
  const validation = validateRecord(base);
  validation.warnings.push(...personnelResult.warnings);
  return {
    ...base,
    confidence: confidenceForRecord(base, validation),
  };
}

export function buildNflOffseasonEvidenceRecord(
  teamIdOrAbbr: string,
  input: BuildNflOffseasonEvidenceDatasetInput = {},
): NflOffseasonEvidenceRecord {
  const teams = canonicalTeamsFromArtifact(input.teamsArtifact ?? teamsArtifact);
  const canonicalByAbbr = new Map(teams.map((team) => [team.abbr, team]));
  const canonicalById = new Map(teams.map((team) => [team.id, team]));
  const key = teamIdOrAbbr.trim().toLowerCase();
  const team = canonicalById.get(key) ?? canonicalByAbbr.get(key);
  if (!team) throw new Error(`unknown canonical NFL team ${teamIdOrAbbr}`);
  const wsProfiles = new Map((input.warrenSharpTeams ?? WS_TEAMS_2026).map((profile) => [profile.abbr.toLowerCase(), profile]));
  const manualProfiles = new Map((input.manualProfiles ?? teams.map((row) => getNflOffseasonProfile(row.abbr))).map((profile) => [profile.abbr.toLowerCase(), profile]));
  return buildNflOffseasonEvidenceRecordInternal({
    team,
    wsProfile: wsProfiles.get(team.abbr) ?? null,
    manualProfile: manualProfiles.get(team.abbr) ?? null,
    projectedQuarterbacks: input.projectedQuarterbacks ?? WS_PROJECTED_QB_2026,
  });
}

function metadata(records: readonly NflOffseasonEvidenceRecord[], validation: NflOffseasonEvidenceValidation): NflOffseasonEvidenceDatasetMetadata {
  const confidenceDistribution: Record<NflEvidenceConfidence, number> = { high: 0, medium: 0, low: 0 };
  const missingCategoryCounts: Record<string, number> = {};
  const completenessSummary = {
    additionsComplete: 0,
    departuresComplete: 0,
    returningPlayersComplete: 0,
    injuryReturnsComplete: 0,
    coachingComplete: 0,
  };

  for (const record of records) {
    confidenceDistribution[record.confidence.level] += 1;
    for (const key of Object.keys(completenessSummary) as Array<keyof typeof completenessSummary>) {
      if (record.coverage[key]) completenessSummary[key] += 1;
      else missingCategoryCounts[key] = (missingCategoryCounts[key] ?? 0) + 1;
    }
    for (const reason of record.confidence.missingReasons) {
      missingCategoryCounts[reason] = (missingCategoryCounts[reason] ?? 0) + 1;
    }
  }

  return {
    targetSeason: TARGET_SEASON,
    teamCount: records.length,
    assembledAt: "2026-07-17",
    sourceCutoffDates: {
      [MANUAL_OFFSEASON_PATH]: NFL_OFFSEASON_DATA_VERIFIED_AT,
      [WARREN_SHARP_TEAMS_PATH]: null,
      [WARREN_SHARP_ADVANCED_PATH]: null,
      [VSIN_GUIDE_PATH]: null,
      [WARREN_SHARP_SCHEDULE_PATH]: null,
    },
    sourcesUsed: mergeSources([
      manualOffseasonSource(),
      warrenSharpTeamsSource(null),
      warrenSharpAdvancedSource(null),
      vsinSource(),
      warrenSharpScheduleSource(),
    ]),
    completenessSummary,
    teamConfidenceDistribution: confidenceDistribution,
    unresolvedConflictCount: validation.errors.length,
    missingCategoryCounts: Object.fromEntries(Object.entries(missingCategoryCounts).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function buildNflOffseasonEvidenceDataset(input: BuildNflOffseasonEvidenceDatasetInput = {}): NflOffseasonEvidenceDataset {
  const teams = canonicalTeamsFromArtifact(input.teamsArtifact ?? teamsArtifact);
  if (teams.length !== 32) throw new Error(`expected 32 canonical NFL teams, received ${teams.length}`);
  const canonicalByAbbr = new Map(teams.map((team) => [team.abbr, team]));
  const wsTeams = input.warrenSharpTeams ?? WS_TEAMS_2026;
  const manualProfiles = input.manualProfiles ?? teams.map((team) => getNflOffseasonProfile(team.abbr));
  const preflightWarnings = [
    ...validateSourceTeams("Warren Sharp team profiles", wsTeams.map((team) => team.abbr), canonicalByAbbr),
    ...validateSourceTeams("manual offseason profiles", manualProfiles.map((team) => team.abbr), canonicalByAbbr),
    ...validateSourceTeams("VSiN guide", NFL_VSIN_GUIDE_TEAM_ABBRS, canonicalByAbbr),
    ...validateSourceTeams("Warren Sharp schedule", WARREN_SHARP_SCHEDULE_TEAM_ABBRS, canonicalByAbbr),
  ];
  if (preflightWarnings.some((warning) => warning.includes("orphan"))) throw new Error(preflightWarnings.join("; "));

  const wsProfiles = new Map(wsTeams.map((profile) => [profile.abbr.toLowerCase(), profile]));
  const manualByAbbr = new Map(manualProfiles.map((profile) => [profile.abbr.toLowerCase(), profile]));
  const projectedQuarterbacks = input.projectedQuarterbacks ?? WS_PROJECTED_QB_2026;

  const records = teams.map((team) =>
    buildNflOffseasonEvidenceRecordInternal({
      team,
      wsProfile: wsProfiles.get(team.abbr) ?? null,
      manualProfile: manualByAbbr.get(team.abbr) ?? null,
      projectedQuarterbacks,
    }),
  );

  const validation = validateNflOffseasonEvidence(records);
  validation.warnings.push(...preflightWarnings.filter((warning) => !warning.includes("orphan")));
  validation.warnings.sort();
  return {
    metadata: metadata(records, validation),
    records,
    validation,
  };
}

export const NFL_OFFSEASON_EVIDENCE_DATASET = buildNflOffseasonEvidenceDataset();
export const NFL_OFFSEASON_EVIDENCE_METADATA = NFL_OFFSEASON_EVIDENCE_DATASET.metadata;

export function getNflOffseasonEvidenceRecord(
  teamIdOrAbbr: string,
  dataset: NflOffseasonEvidenceDataset = NFL_OFFSEASON_EVIDENCE_DATASET,
): NflOffseasonEvidenceRecord | null {
  const key = teamIdOrAbbr.trim().toLowerCase();
  return dataset.records.find((record) => record.teamId === key || record.abbr === key) ?? null;
}
