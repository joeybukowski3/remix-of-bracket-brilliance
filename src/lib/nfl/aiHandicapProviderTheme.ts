import type { AiHandicapProvider } from "@/lib/nfl/aiHandicapPresentation";

/**
 * WU7.10 -- reusable per-provider visual identity for the AI Picks surface
 * (comparison cards, Full Analysis tabs, article masthead). Presentation
 * only: nothing here reads or derives from analysis data, and no field is
 * used to imply a consensus, ranking, or "winner" between providers -- it
 * exists purely so a reader can tell at a glance which analyst owns which
 * opinion.
 *
 * Every value is a literal Tailwind utility class string (never built by
 * concatenation) so Tailwind's content scanner can find them in this file.
 * Built from the existing default Tailwind palette already used throughout
 * this component tree (slate/red/blue/cyan) -- no one-off hex values.
 */
export interface AiHandicapProviderTheme {
  displayName: string;
  tagline: string;
  /** Single-letter analyst mark for a small typographic monogram -- no invented logo. */
  monogram: string;
  /** Masthead background (near-black for Grokowski, deep navy for Chatty Ice). */
  headerBg: string;
  /** Masthead bottom accent rule -- the provider's signature color. */
  headerAccentBorder: string;
  headerText: string;
  headerSubtext: string;
  /** Provider-colored text for small labels/eyebrows on the light body surface. */
  accentText: string;
  /** Provider-colored border for the decision (side/total) blocks and other accents. */
  accentBorder: string;
  /** Very light provider tint for the decision-block background -- keeps the body a light reading surface, never a dark card. */
  accentBg: string;
  /** Dark, high-contrast provider-tinted text for the pick itself (e.g. "ATL +2.5"), readable on accentBg. */
  pickText: string;
  /** Active "Full Analysis" tab treatment -- the same masthead colors, so the active tab visually IS that provider. */
  activeTabBg: string;
  activeTabText: string;
  focusRing: string;
}

export const AI_HANDICAP_PROVIDER_THEME: Record<AiHandicapProvider, AiHandicapProviderTheme> = {
  grok: {
    displayName: "Grokowski",
    tagline: "Independent Handicap",
    monogram: "G",
    headerBg: "bg-slate-950",
    headerAccentBorder: "border-b-4 border-red-600",
    headerText: "text-white",
    headerSubtext: "text-slate-300",
    accentText: "text-red-700",
    accentBorder: "border-red-300",
    accentBg: "bg-red-50",
    pickText: "text-red-950",
    activeTabBg: "bg-slate-950",
    activeTabText: "text-white",
    focusRing: "focus-visible:ring-red-500",
  },
  chatgpt: {
    displayName: "Chatty Ice",
    tagline: "Independent Handicap",
    monogram: "C",
    headerBg: "bg-blue-950",
    headerAccentBorder: "border-b-4 border-cyan-400",
    headerText: "text-white",
    headerSubtext: "text-blue-200",
    accentText: "text-cyan-800",
    accentBorder: "border-cyan-300",
    accentBg: "bg-cyan-50",
    pickText: "text-blue-950",
    activeTabBg: "bg-blue-950",
    activeTabText: "text-white",
    focusRing: "focus-visible:ring-cyan-500",
  },
};

export function getProviderTheme(provider: AiHandicapProvider): AiHandicapProviderTheme {
  return AI_HANDICAP_PROVIDER_THEME[provider];
}
