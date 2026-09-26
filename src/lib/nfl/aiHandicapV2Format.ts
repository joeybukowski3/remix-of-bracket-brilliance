/**
 * AI Picks v2 -- pure presentation helpers (formatting and a tiny, safe
 * markdown-block parser). No data fetching and no handicapping logic: every
 * number shown is copied from the published v2 card.
 */
import type { AiHandicapV2Card, AiHandicapV2Confidence, AiHandicapV2Verdict } from "@/lib/nfl/aiHandicapPresentation";
import { NA } from "@/lib/nfl/aiHandicapFormat";

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

export function formatV2Pick(card: Pick<AiHandicapV2Card, "preferredTeam" | "preferredLine">): string {
  return `${card.preferredTeam.toUpperCase()} ${signed(card.preferredLine)}`;
}

export function formatV2Percent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? NA : `${Math.round(value * 10) / 10}%`;
}

export function formatV2FairSpread(card: Pick<AiHandicapV2Card, "fairSpread">): string {
  return `${card.fairSpread.team.toUpperCase()} ${signed(card.fairSpread.line)}`;
}

export function formatV2FairScore(card: Pick<AiHandicapV2Card, "fairScoreAway" | "fairScoreHome">, awayTeam: string, homeTeam: string): string {
  return `${awayTeam.toUpperCase()} ${card.fairScoreAway} – ${homeTeam.toUpperCase()} ${card.fairScoreHome}`;
}

const CONFIDENCE_LABELS: Record<AiHandicapV2Confidence, string> = { LOW: "Low", MEDIUM: "Medium", MEDIUM_HIGH: "Medium-high", HIGH: "High" };
export function formatV2Confidence(confidence: AiHandicapV2Confidence): string {
  return CONFIDENCE_LABELS[confidence] ?? NA;
}

export const V2_VERDICT_STYLE: Record<AiHandicapV2Verdict, { label: string; className: string }> = {
  BET: { label: "BET", className: "bg-emerald-600 text-white" },
  LEAN: { label: "LEAN", className: "bg-amber-500 text-slate-950" },
  PASS: { label: "PASS", className: "bg-slate-500 text-white" },
};

/** Mechanical, neutral note about whether two v2 handicaps landed on the same side. Never ranks them. */
export function describeV2Agreement(a: AiHandicapV2Card, b: AiHandicapV2Card): string {
  if (a.preferredSide === b.preferredSide) {
    return `Both handicappers prefer ${formatV2Pick(a)}. Their fair lines, scores and totals differ — compare the numbers; neither is presumed correct.`;
  }
  return "The two handicappers prefer opposite sides at this number. Compare their reasoning; neither is presumed correct.";
}

/* -------------------------------------------------------------------------- */
/* analysisMarkdown -> blocks                                                 */
/* -------------------------------------------------------------------------- */

export type V2MarkdownBlock = { kind: "paragraph"; text: string } | { kind: "finalRead"; lines: string[] };

const BOLD_LINE = /^\*\*(.+)\*\*$/;

/**
 * Splits provider prose into paragraphs. A paragraph whose every line is a
 * fully-bold line (the "Bills -7: ~56% ..." final read) becomes a
 * `finalRead` block with the asterisks stripped; everything else stays a
 * paragraph (inline **bold** is handled at render time).
 */
export function parseV2AnalysisMarkdown(markdown: string): V2MarkdownBlock[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): V2MarkdownBlock => {
      const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
      const bold = lines.map((line) => BOLD_LINE.exec(line)?.[1] ?? null);
      if (lines.length > 0 && bold.every((line) => line !== null)) return { kind: "finalRead", lines: bold as string[] };
      return { kind: "paragraph", text: lines.join(" ") };
    });
}

/** Splits a paragraph into plain and **bold** runs, as data (rendered as React text nodes, never as HTML). */
export function splitInlineBold(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));
}
