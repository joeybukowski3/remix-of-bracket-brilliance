/**
 * AI Picks v2 -- what the model is told when it runs on JKB/local data ONLY
 * (research mode "site-only", nfl-ai-v2-research-mode.ts).
 *
 * Everything here is a pure function of the already-built game-context packet:
 * no file read, no network, no model call.
 *
 * AVAILABILITY (injuries) is the one external-flavoured input the local packet
 * carries (public/data/nfl/matchup-injuries.json, from nflverse). It is shown to
 * the model only when it is demonstrably CURRENT; otherwise the model is told it
 * is unavailable and must make no specific injury claim. It never silently falls
 * back to web research, and a stale feed never masquerades as current.
 *
 * "Current" requires ALL of:
 *   - the packet's own freshness verdict is not stale/unavailable (it is stale when
 *     the feed is not this season's data, is flagged historical, or a lineup row
 *     flags the injury feed stale -- nfl-full-game-context.ts buildAvailabilitySection)
 *   - the artifact carries a parseable generatedAt, and
 *   - it is no older than SITE_INJURY_MAX_AGE_HOURS at run time.
 * A missing timestamp counts as unavailable: age is never assumed.
 *
 * WEATHER has no local provider (the packet's weather section is the constant
 * "not_available"), so site-only prompts omit weather entirely rather than send the
 * model off to research it.
 */
import type { EvidenceRecord } from "./nfl-evidence-types";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import type { ResearchMode } from "./nfl-ai-v2-research-mode";

/** The local injury feed is accepted only if generated within this many hours of the run. Game-week designations change daily; older than this is not "current". */
export const SITE_INJURY_MAX_AGE_HOURS = 48;

/** Quoted verbatim in the site-only prompts; the validator's existing injury-claim rule is what enforces it. */
export const SITE_INJURY_RULE = "If current injury data is unavailable or stale, do not make specific injury claims.";

export interface SiteInjuryEntry {
  name: string;
  team: string;
  position: string;
  status: "out" | "doubtful" | "questionable" | "probable";
}

export type SiteAvailabilityContext =
  | { status: "current"; sourceGeneratedAt: string; ageHours: number; injuries: SiteInjuryEntry[] }
  | { status: "unavailable"; reason: string; sourceGeneratedAt: string | null; ageHours: number | null };

const MS_PER_HOUR = 3_600_000;
const STATUS_ORDER: Record<SiteInjuryEntry["status"], number> = { out: 0, doubtful: 1, questionable: 2, probable: 3 };

export function assessSiteAvailability(packet: NflGameContextPacket, now: Date): SiteAvailabilityContext {
  const availability = packet.availability;
  const source = packet.provenance.sources.find((s) => s.logicalName === "matchup-injuries");
  const generatedAt = source?.generatedAt ?? null;
  const parsed = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const ageHours = Number.isFinite(parsed) ? (now.getTime() - parsed) / MS_PER_HOUR : null;
  const unavailable = (reason: string): SiteAvailabilityContext => ({ status: "unavailable", reason, sourceGeneratedAt: generatedAt, ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10 });

  if (availability.provenance_status === "unavailable") return unavailable("the local injury feed is missing");
  if (availability.feedStale || availability.provenance_status === "stale") {
    const asOf = availability.injuries.find((i) => i.asOf)?.asOf;
    return unavailable(`the local injury feed is stale${asOf ? ` (its newest data is ${asOf}, not this season's current report)` : " (it is not this season's current report)"}`);
  }
  if (ageHours == null) return unavailable("the local injury feed has no readable generation time, so its age cannot be established");
  if (ageHours < -1) return unavailable("the local injury feed's generation time is in the future, so it cannot be trusted");
  if (ageHours > SITE_INJURY_MAX_AGE_HOURS) return unavailable(`the local injury feed is ${Math.round(ageHours)} hours old (limit ${SITE_INJURY_MAX_AGE_HOURS})`);

  const injuries = availability.injuries
    .flatMap((i): SiteInjuryEntry[] => (i.status && i.status !== "active" ? [{ name: i.name, team: i.team, position: i.position, status: i.status }] : []))
    .sort((a, b) => a.team.localeCompare(b.team) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  return { status: "current", sourceGeneratedAt: generatedAt as string, ageHours: Math.round(Math.max(ageHours, 0) * 10) / 10, injuries };
}

/** The availability block printed after the football data in a site-only prompt. */
export function siteAvailabilityLines(context: SiteAvailabilityContext, teams: { home: string; away: string }): string[] {
  if (context.status === "unavailable") {
    return [
      `availability: UNAVAILABLE -- ${context.reason}${context.sourceGeneratedAt ? ` (feed generated ${context.sourceGeneratedAt})` : ""}. No current injury, participation, quarterback-status or inactive information is available to you. ${SITE_INJURY_RULE}`,
    ];
  }
  const side = (label: "away" | "home", team: string): string => {
    const entries = context.injuries.filter((i) => i.team === team);
    return `  ${label} (${team.toUpperCase()}): ${entries.length > 0 ? entries.map((e) => `${e.name} (${e.position}) ${e.status.toUpperCase()}`).join("; ") : "no designations listed"}`;
  };
  return [
    `availability (LOCAL JKB injury feed -- CURRENT: generated ${context.sourceGeneratedAt}, ${context.ageHours} hours old; game-status designations only, with no practice or reserve detail, as published and not confirmed against team reports):`,
    side("away", teams.away),
    side("home", teams.home),
    `This is the only availability information you have; it is deterministic site data, not external evidence -- cite it as the factRef availability.injuries, never as an evidence reference. ${SITE_INJURY_RULE}`,
  ];
}

/** What a site-only prompt carries on top of the shared football data. Its presence on a prompt input IS site-only mode. */
export interface SitePromptContext {
  availability: SiteAvailabilityContext;
}

export function buildSitePromptContext(packet: NflGameContextPacket, now: Date): SitePromptContext {
  return { availability: assessSiteAvailability(packet, now) };
}

/**
 * The evidence the handicap stages see. site-only: NONE, whatever evidence files exist on disk -- the research
 * artifact is not an input and need not exist. live: the provider's real (non-fixture) research evidence.
 */
export function selectHandicapEvidence(mode: ResearchMode, artifact: { evidence: readonly EvidenceRecord[]; fixture?: boolean } | null): EvidenceRecord[] {
  if (mode === "site-only") return [];
  return artifact && !artifact.fixture ? [...artifact.evidence] : [];
}
