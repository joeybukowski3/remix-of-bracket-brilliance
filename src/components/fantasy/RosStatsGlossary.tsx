import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PAR_POSITIONS } from "@/lib/fantasy/parRankings";
import { POSITION_TONES } from "@/lib/fantasy/positionTone";
import {
  weeklyHeatStyle,
  type WeeklyHeatTone,
} from "@/lib/fantasy/weekly/researchPresentation";
import { cn } from "@/lib/utils";

const DEFINITIONS = [
  ["RANK", "JKB RANK — manual/expert JKB draft-board authority. Overall JKB rest-of-season ranking."],
  ["POS RK", "JKB rank within the player's position."],
  ["POSITIONAL NOTATION", "QB#, RB#, WR# and TE# are position-relative ranks. WR2 means 2nd among wide receivers for that metric; RB4 means 4th among running backs."],
  ["ADP", "2026 consensus Average Draft Position. N/A when no repository-backed consensus source is available."],
  ["PAR/G", "Projected Points Above Replacement per game from the approved season projection authority."],
  ["PROJECTION RK", "Positional rank from the approved FantasyPros season projection field."],
  ["AVG RK", "Workbook average of the available WAR, late-season, projection and Vegas positional component ranks."],
  ["MODEL RK", "Independent quantitative ROS rank based on the validated historical baseline, rookie/no-history fallback, and roster eligibility rules. N/A for players withheld from the model's rank (e.g. released or free agent). It does NOT include a validated opportunity/usage adjustment, matchup/FPA adjustment, or market adjustment."],
  ["SOS", "Workbook-supplied JKB positional strength-of-schedule composite; 1 is easiest. Its underlying formula is not documented in the repository."],
  ["2025 PTS RK", "2025 total full-PPR fantasy points rank relative to players at the same position."],
  ["2025 PPG RK", "2025 full-PPR points-per-game rank relative to players at the same position."],
  ["L8 PTS RK", "Total full-PPR points across the player's last eight eligible 2025 regular-season games, ranked relative to players at the same position. A smaller available 2025 sample is used and shown in row details; no prior-season games are added."],
  ["W15 / W16 / W17", "Opponent for that playoff week. The cell color is matchup difficulty from the fantasy player's perspective, based on the opponent's 2025 points allowed to that position."],
] as const;

const HEAT_LEGEND: ReadonlyArray<[WeeklyHeatTone, string]> = [
  ["gold", "Gold = elite/easiest"],
  ["dark-green", "Dark Green = very favorable"],
  ["green", "Green = favorable"],
  ["light-green", "Light Green = above average"],
  ["neutral", "Neutral = average"],
  ["light-red", "Light Red = difficult"],
  ["red", "Red = very difficult"],
  ["strong-red", "Strong Red = worst"],
];

export default function RosStatsGlossary() {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <section aria-label="Rest-of-season stats and rankings key" className="border-b border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-10 w-full items-center justify-between gap-3 px-4 py-2 text-left text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-5"
      >
        <span>Stats &amp; Rankings Key</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
      </button>
      <div id={contentId} hidden={!expanded} className="border-t border-slate-200 px-4 py-3 sm:px-5">
        <dl className="grid gap-x-6 gap-y-2 text-[11px] leading-4 text-slate-600 md:grid-cols-2">
          {DEFINITIONS.map(([term, meaning]) => (
            <div key={term} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <dt className="font-black text-slate-900">{term}</dt><dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">JKB RANK vs. Model Rk</p>
          <p className="mt-1 text-[10px] text-slate-500">
            JKB Overall Rank and Model Rank are independent authorities. Disagreement between them is expected and can be informative.
            Model Rank does not include a validated opportunity/usage adjustment, matchup/FPA adjustment, or market adjustment.
          </p>
        </div>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Playoff matchup colors</p>
          <p className="mt-1 text-[10px] text-slate-500">Fantasy-player perspective: easier position matchups are gold/green; harder matchups are red.</p>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Playoff matchup color scale">
            {HEAT_LEGEND.map(([tone, label]) => <span key={tone} style={weeklyHeatStyle(tone)} className="rounded px-2 py-1 text-[10px] font-bold">{label}</span>)}
          </div>
        </div>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Position colors</p>
          <p className="mt-1 text-[10px] text-slate-500">Position color identifies QB, RB, WR or TE; it does not indicate quality.</p>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Glossary position color key">
            {PAR_POSITIONS.map((position) => <span key={position} className={cn("rounded px-2 py-1 text-[10px] font-black", POSITION_TONES[position].badge)}>{position}</span>)}
          </div>
        </div>
      </div>
    </section>
  );
}
