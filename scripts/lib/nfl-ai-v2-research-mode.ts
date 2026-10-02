/**
 * AI Picks v2 -- research mode.
 *
 *   site-only (DEFAULT)  JKB/local deterministic data -> Stage A -> Stage B. No provider
 *                        research pass, no web search, no evidence.live-test.json needed;
 *                        the model gets no external evidence (evidence = []), so every
 *                        evidenceRefs / evidenceRefsUsed array is [] and factRefs carry the
 *                        deterministic site facts.
 *   live                 The original behavior: a paid provider research pass collects
 *                        normalized external evidence (injuries, weather, reporting) that
 *                        Stage A/B may cite. Opt-in, never implied.
 *
 * ONE definition shared by the one-game CLI, the slate planner/executor and the slate CLI,
 * so the three cannot disagree about what a mode means. Parsing is strict: a typo must
 * never silently mean "live" (the expensive one).
 */
export const RESEARCH_MODES = ["site-only", "live"] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

export const DEFAULT_RESEARCH_MODE: ResearchMode = "site-only";

/** `undefined`/empty = the default. Anything else must be an exact mode name. */
export function parseResearchMode(raw: string | undefined | null): ResearchMode {
  if (raw == null || raw === "") return DEFAULT_RESEARCH_MODE;
  if ((RESEARCH_MODES as readonly string[]).includes(raw)) return raw as ResearchMode;
  throw new Error(`--research-mode must be one of ${RESEARCH_MODES.join(" | ")}, got "${raw}"`);
}
