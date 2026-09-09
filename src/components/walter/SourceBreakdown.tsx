import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { WalterCaptureType, WalterGameCapture } from "@/lib/walter/types";

const CAPTURE_LABELS: Record<WalterCaptureType, string> = {
  wednesday: "Wednesday",
  thursday: "Thursday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function CoverageRow({ label, present, notDiscussedLabel }: { label: string; present: boolean; notDiscussedLabel?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/60 py-1.5 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className={present ? "text-emerald-400" : "text-slate-600"}>{present ? "✓" : notDiscussedLabel ?? "Not discussed"}</span>
    </div>
  );
}

/**
 * Coverage check is derived from the parsed capture itself (never
 * hard-coded): each row reflects whether the underlying parsed data for
 * that category is actually non-empty for this capture.
 */
function buildCoverage(capture: WalterGameCapture) {
  return [
    { label: "Central matchup thesis", present: Boolean(capture.snapshot.thesis) },
    { label: "Team A analysis", present: capture.teamBreakdowns.away.length > 0 },
    { label: "Team B analysis", present: capture.teamBreakdowns.home.length > 0 },
    { label: "Injuries mentioned", present: capture.injuries.length > 0 },
    { label: "Uncommon angles", present: capture.uncommonAngles.length > 0 },
    { label: "Betting/pick discussion", present: Boolean(capture.betting.pick.spread) },
    { label: "Line movement", present: Boolean(capture.betting.lineMovement) },
    { label: "Late update details", present: capture.captureType !== "wednesday" },
  ];
}

function findGaps(capture: WalterGameCapture): string[] {
  const gaps: string[] = [];
  const injuryLabelsInSource = new Set(capture.injuries.map((i) => i.sourceLabel.toUpperCase()));
  // Flag a labeled source subsection that produced substantive text but
  // isn't reflected anywhere in the higher-level summary fields.
  for (const entry of capture.sourceBreakdown) {
    const inTeamBreakdown = [...capture.teamBreakdowns.away, ...capture.teamBreakdowns.home].some((t) => t.includes(entry.paraphrase.slice(0, 40)));
    const isKnownTopic = ["Matchup intro", "Motivation", "Spread math", "Vegas action", "Trends", "Official pick", "RECAP", "SAME-GAME PARLAY"].includes(entry.topic);
    if (!inTeamBreakdown && !isKnownTopic && !injuryLabelsInSource.has(entry.topic.toUpperCase()) && entry.paraphrase.length > 80) {
      gaps.push(`Source contains additional discussion under "${entry.topic}" that is not currently represented in the main summary sections.`);
    }
  }
  return gaps;
}

export function SourceBreakdown({ capture }: { capture: WalterGameCapture }) {
  const [open, setOpen] = useState(false);
  const coverage = buildCoverage(capture);
  const gaps = findGaps(capture);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-slate-800 bg-slate-950/40">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-300 hover:text-slate-100">
        <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        Source Breakdown / Verify Summary
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-6 border-t border-slate-800 px-4 py-4">
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Source Breakdown</h4>
          <ol className="space-y-3">
            {capture.sourceBreakdown.map((entry) => (
              <li key={entry.order} className="rounded-md border border-slate-800/70 bg-slate-900/40 p-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">{entry.topic}</span>
                  <span className="uppercase text-slate-600">{entry.concerns}</span>
                </div>
                <p className="text-sm text-slate-400">{entry.paraphrase}</p>
              </li>
            ))}
            {capture.sourceBreakdown.length === 0 && <p className="text-sm text-slate-600">No source sections parsed for this capture.</p>}
          </ol>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary Coverage</h4>
          <div className="rounded-md border border-slate-800/70 bg-slate-900/40 px-3">
            {coverage.map((row) => (
              <CoverageRow key={row.label} label={row.label} present={row.present} />
            ))}
          </div>
          {gaps.length > 0 && (
            <div className="mt-3 space-y-2">
              {gaps.map((gap) => (
                <p key={gap} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  SUMMARY GAP: {gap}
                </p>
              ))}
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Source Metadata</h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
            <dt className="text-slate-600">Capture type</dt>
            <dd>{CAPTURE_LABELS[capture.captureType]}</dd>
            <dt className="text-slate-600">Capture timestamp</dt>
            <dd>{new Date(capture.capturedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET</dd>
            <dt className="text-slate-600">Source URL</dt>
            <dd className="truncate">{capture.source.url}</dd>
          </dl>
        </section>

        <a
          href={capture.source.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800"
        >
          Open full original breakdown on WalterFootball
        </a>
      </CollapsibleContent>
    </Collapsible>
  );
}
