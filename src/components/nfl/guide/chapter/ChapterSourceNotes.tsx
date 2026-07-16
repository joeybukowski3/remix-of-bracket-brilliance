import { Link } from "react-router-dom";
import type { NflGuideRecord } from "@/lib/nfl/guideRecord";

/**
 * Sections H + I combined: a compact source list (print-friendly) and links
 * to real, already-existing routes (no placeholder or dead links).
 */
export function ChapterSourceNotes({ team }: { team: NflGuideRecord }) {
  return (
    <section className="break-inside-avoid border-t-2 border-slate-900 pt-3 text-[10px] leading-4 text-slate-600">
      <p className="font-black uppercase tracking-wider text-slate-900">Sources for this chapter</p>
      <p className="mt-1">
        JoeKnowsBall v0.3 power ratings and full-season/final-eight metrics (nflverse-derived, Stage-1 internal).
        Warren Sharp&apos;s 2026 Football Preview for schedule strength and rest. 2026 VSiN NFL Betting Guide for
        offensive and defensive reference statistics and futures prices. Site win totals for the market line.
        Coaching and player movement compiled from public transaction reporting.
      </p>

      <div data-print-hidden className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Link to={`/nfl/guide/team/${team.slug}`} className="font-black text-indigo-700 hover:underline">
          {team.name} full dashboard →
        </Link>
        <Link to="/nfl/power-ratings" className="font-black text-indigo-700 hover:underline">
          Power ratings →
        </Link>
        <Link to="/nfl/guide" className="font-black text-indigo-700 hover:underline">
          Full NFL Guide →
        </Link>
        <Link to="/nfl/guide#guide-methodology" className="font-black text-indigo-700 hover:underline">
          Methodology →
        </Link>
      </div>
    </section>
  );
}
