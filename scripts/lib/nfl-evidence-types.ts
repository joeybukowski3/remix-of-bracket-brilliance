/**
 * WU2 (docs/nfl-grok-chatgpt-handicap-architecture.md §5) -- model-independent
 * external evidence schema. This is the deterministic contract that future
 * Grok/ChatGPT research adapters must satisfy before a raw research finding
 * is trusted anywhere near article generation.
 *
 * No AI/API code lives here. Pure types + the raw-candidate shape a future
 * adapter would hand to the normalizer (scripts/lib/nfl-evidence-normalizer.ts).
 */

export const EVIDENCE_SCHEMA_VERSION = "nfl-evidence-v1" as const;

/** The two isolated research namespaces. Never shared/merged in WU2. */
export type EvidenceModel = "grok" | "chatgpt";

export type EvidenceCategory =
  | "injury"
  | "availability"
  | "personnel"
  | "depth_chart"
  | "coaching"
  | "scheme"
  | "usage"
  | "matchup"
  | "news"
  | "weather"
  | "market"
  | "scheduling"
  | "travel"
  | "situational"
  | "quote"
  | "other";

export const EVIDENCE_CATEGORIES: readonly EvidenceCategory[] = [
  "injury",
  "availability",
  "personnel",
  "depth_chart",
  "coaching",
  "scheme",
  "usage",
  "matchup",
  "news",
  "weather",
  "market",
  "scheduling",
  "travel",
  "situational",
  "quote",
  "other",
];

export type EvidenceConfidence = "high" | "medium" | "low";

export const EVIDENCE_CONFIDENCE_LEVELS: readonly EvidenceConfidence[] = ["high", "medium", "low"];

/**
 * verified       -- tier-1 (official) source, or corroborated by a second
 *                    independent source within the same model's stream.
 * corroborated   -- at least two independent sources (within this model's
 *                    stream) support the same claim.
 * single_source  -- one acceptable source, not yet corroborated.
 * unverified     -- low-tier/unsupported source; not fact-checked.
 * rejected       -- fails source-quality policy (rumor/anonymous/tout/etc.);
 *                    the record is retained (never silently dropped) but is
 *                    structurally barred from ever reading "verified".
 */
export type EvidenceVerificationStatus = "verified" | "corroborated" | "single_source" | "unverified" | "rejected";

export const EVIDENCE_VERIFICATION_STATUSES: readonly EvidenceVerificationStatus[] = [
  "verified",
  "corroborated",
  "single_source",
  "unverified",
  "rejected",
];

export type EvidenceSourceType =
  | "official_team"
  | "official_nfl"
  | "injury_report"
  | "beat_reporter"
  | "national_reporter"
  | "sports_media"
  | "weather_provider"
  | "sportsbook"
  | "other";

export const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "official_team",
  "official_nfl",
  "injury_report",
  "beat_reporter",
  "national_reporter",
  "sports_media",
  "weather_provider",
  "sportsbook",
  "other",
];

export type EvidenceRelevanceArea =
  | "spread"
  | "total"
  | "passing"
  | "rushing"
  | "protection"
  | "pass_rush"
  | "coverage"
  | "run_defense"
  | "usage"
  | "pace"
  | "scheme"
  | "weather"
  | "market"
  | "scheduling"
  | "other";

export const EVIDENCE_RELEVANCE_AREAS: readonly EvidenceRelevanceArea[] = [
  "spread",
  "total",
  "passing",
  "rushing",
  "protection",
  "pass_rush",
  "coverage",
  "run_defense",
  "usage",
  "pace",
  "scheme",
  "weather",
  "market",
  "scheduling",
  "other",
];

/**
 * fresh   -- current for its category (see nfl-evidence-policy.ts thresholds).
 * aging   -- past the "fresh" window but still within a usable window.
 * stale   -- past the usable window; should not anchor a pick without a
 *            fresher corroborating record.
 * unknown -- no timestamp available to classify (never guessed as fresh).
 */
export type EvidenceFreshness = "fresh" | "aging" | "stale" | "unknown";

/**
 * Derived, not stored authoritatively: see resolveEvidenceAuthority() in
 * nfl-evidence-store.ts. The field on EvidenceRecord itself is always
 * "current" at write time -- evidence is append-only/immutable, so
 * supersession/conflict is computed fresh from the whole stream rather than
 * mutating a past record.
 */
export type EvidenceSupersessionStatus = "current" | "superseded" | "conflicting";

export interface EvidenceSource {
  name: string;
  url: string | null;
  sourceType: EvidenceSourceType;
  author: string | null;
  publishedAt: string | null; // source's own timestamp, ISO-8601, if known
  retrievedAt: string; // when the research pass fetched it, ISO-8601
}

export interface EvidenceSubjects {
  teams: string[]; // teams.json abbr, lowercase -- must be this game's two teams only
  players: string[]; // free-form player identifiers, resolved where possible
  coaches: string[]; // free-form coach identifiers
}

export interface EvidenceRelevance {
  summary: string; // one sentence: why this matters to the handicap
  areas: EvidenceRelevanceArea[];
}

/**
 * Present only when category === "quote". exactText must be verbatim
 * source language, never a synthesized/paraphrased approximation -- the
 * normalizer requires rawExcerpt to contain exactText as a mechanical proxy
 * for "this was actually said," since an LLM cannot be trusted to self-report
 * verbatim-ness.
 */
export interface EvidenceQuote {
  speaker: string;
  exactText: string;
}

export interface EvidenceProvenance {
  candidateHash: string; // content hash of the raw candidate that produced this record
  normalizerVersion: string;
  contextVersionAtNormalization: string | null; // ties evidence to a Game Context Packet version, if known
}

export interface EvidenceRecord {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  evidenceId: string; // deterministic, see nfl-evidence-normalizer.ts
  model: EvidenceModel;
  gameId: string;
  season: number;
  week: number;
  claim: string; // one atomic, materially testable factual statement
  category: EvidenceCategory;
  source: EvidenceSource;
  subjects: EvidenceSubjects;
  subjectValidation: EvidenceSubjectValidation;
  confidence: EvidenceConfidence;
  verificationStatus: EvidenceVerificationStatus;
  pregameSafe: boolean;
  relevance: EvidenceRelevance;
  quote: EvidenceQuote | null;
  rawExcerpt: string | null;
  freshness: EvidenceFreshness;
  supersessionStatus: EvidenceSupersessionStatus; // always "current" as stored; see resolveEvidenceAuthority()
  supersedesEvidenceId: string | null; // set when this candidate self-declares it supersedes a prior claim
  normalizedAt: string;
  provenance: EvidenceProvenance;
}

/**
 * What a future Grok/ChatGPT research adapter hands to
 * normalizeExternalEvidence(). Intentionally decoupled from any API
 * response shape -- an adapter maps its own provider payload into this
 * before normalization ever runs.
 */
export interface RawEvidenceCandidate {
  model: EvidenceModel;
  gameId: string;
  claim: string;
  category: EvidenceCategory;
  source: {
    name: string;
    url: string | null;
    sourceType: EvidenceSourceType;
    author?: string | null;
    publishedAt?: string | null;
    retrievedAt: string;
  };
  subjects?: {
    teams?: string[];
    players?: string[];
    coaches?: string[];
  };
  confidence?: EvidenceConfidence;
  relevance?: {
    summary?: string;
    areas?: EvidenceRelevanceArea[];
  };
  quote?: EvidenceQuote | null;
  rawExcerpt?: string | null;
  supersedesEvidenceId?: string | null;
}

/**
 * WU2.1 -- one authoritative roster/coach entry the normalizer can match a
 * free-text evidence subject against. Deliberately minimal: an id, a
 * canonical display name, and the team the entry is current for. Callers
 * derive these from existing repo sources (nflverse weekly rosters/depth
 * charts, coaching-ratings.json) -- this module never fetches or parses a
 * source itself.
 */
export interface SubjectRosterEntry {
  playerId: string;
  canonicalName: string;
  team: string; // teams.json abbr, lowercase
  /** WU2.2 -- optional enrichment. Absent when a caller builds a minimal source by hand. */
  position?: string | null;
  /** Roster status as reported by the source (e.g. ACT/RES/DEV/RET) -- never used to exclude a subject, only to inform consumers. */
  rosterStatus?: string | null;
  sourceRecord?: "weekly_roster" | "depth_chart";
  /** The roster week this entry was observed for, when known. */
  week?: number | null;
}

export interface SubjectCoachEntry {
  coachId: string;
  canonicalName: string;
  team: string; // teams.json abbr, lowercase
  /** WU2.2 -- optional enrichment. Only "head_coach" is populated by the current loader -- no coordinator/staff data exists in an authoritative repo source. */
  role?: string | null;
  season?: number | null;
}

/** WU2.2 -- coarse status a consumer can branch on without inspecting every meta field. */
export type SubjectIdentitySourceStatus = "available" | "partial" | "stale" | "unavailable";

/**
 * WU2.2 -- provenance/freshness metadata for a loader-built SubjectIdentitySource.
 * Optional: hand-built sources (WU2.1 fixtures/tests) may omit it entirely.
 */
export interface SubjectIdentitySourceMeta {
  status: SubjectIdentitySourceStatus;
  season: number;
  requestedWeek: number;
  rosterWeekUsed: number | null; // null when no pregame-safe roster week was available
  rosterIsCurrentWeek: boolean; // true only when rosterWeekUsed === requestedWeek
  rosterSource: "weekly_roster" | "none";
  depthChartSource: "depth_chart" | "none";
  coachSeasonUsed: number | null;
  coachIsCurrentSeason: boolean;
  coachSource: "coaching_ratings" | "none";
  generatedAt: string; // ISO -- when the loader produced this source
  notes: readonly string[];
}

/**
 * Canonical subject-identity data for ONE game's two teams, supplied by the
 * caller. Absence (context.subjectIdentity is null/undefined) means "no
 * authoritative source was available" -- every subject resolves to
 * "unresolved", never fabricated as "confirmed". See
 * nfl-evidence-subject-identity.ts.
 */
export interface SubjectIdentitySource {
  players: readonly SubjectRosterEntry[];
  coaches: readonly SubjectCoachEntry[];
  /** WU2.2 -- present when built by nfl-evidence-subject-identity-loader(-core).ts. */
  meta?: SubjectIdentitySourceMeta;
}

/**
 * confirmed    -- subject matched a roster/coach entry on one of this game's
 *                  two teams.
 * unresolved   -- no authoritative source was available, or the subject was
 *                  not found in an available source. Never treated as a
 *                  rejection -- absence of proof is not proof of absence.
 * conflicting  -- the subject matched more than one of this game's two teams
 *                  (name collision within the game) and cannot be resolved
 *                  to a single side.
 * rejected     -- the subject conclusively matched a roster/coach entry on a
 *                  team OTHER than this game's two teams -- a real identity
 *                  assigned to the wrong game.
 */
export type SubjectValidationStatus = "confirmed" | "unresolved" | "conflicting" | "rejected";

export interface PlayerSubjectValidation {
  input: string; // the raw subjects.players entry, as supplied by the candidate
  status: SubjectValidationStatus;
  canonicalPlayerId: string | null;
  canonicalName: string | null;
  team: string | null; // resolved roster team when known (including the unrelated team for "rejected")
  reason: string; // short machine-readable reason code
}

export interface CoachSubjectValidation {
  input: string; // the raw subjects.coaches entry, as supplied by the candidate
  status: SubjectValidationStatus;
  canonicalCoachId: string | null;
  canonicalName: string | null;
  team: string | null;
  reason: string;
}

/** Per-candidate identity-validation outcome, attached to every EvidenceRecord. */
export interface EvidenceSubjectValidation {
  players: PlayerSubjectValidation[];
  coaches: CoachSubjectValidation[];
}

/** Deterministic game facts the normalizer validates each candidate against. */
export interface EvidenceNormalizationContext {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string; // teams.json abbr, lowercase
  awayTeam: string;
  kickoffUtc: string;
  contextVersion: string | null;
  knownTeamAbbrs: ReadonlySet<string>;
  /**
   * WU2.1 -- optional canonical player/coach identity data for this game.
   * Omit (or pass null) when no authoritative source is available; the
   * normalizer degrades every subject to "unresolved" rather than guessing.
   */
  subjectIdentity?: SubjectIdentitySource | null;
}
