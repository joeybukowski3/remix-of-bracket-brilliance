import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  getWarrenSharpProfile,
  getPositionalRankTone,
  POSITIONAL_RATING_LABELS,
  type WsPositionalRatings,
} from "@/data/nflWarrenSharpTeams2026";
import type { NflGuideTeam } from "@/lib/nfl/guide2026";
import { POSITIONAL_ORDER } from "@/lib/nfl/warrenSharpTeams2026";

// ── Positional rank card ──────────────────────────────────────────────────────

const TONE_CLASSES: Record<string, string> = {
  green:       "bg-emerald-600 text-white",
  "light-green": "bg-emerald-100 text-emerald-800",
  amber:       "bg-amber-100 text-amber-800",
  red:         "bg-red-100 text-red-800",
};

function RankCard({
  label,
  rank,
}: {
  label: string;
  rank: number;
}) {
  const tone = getPositionalRankTone(rank);
  const rankClass = TONE_CLASSES[tone];
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black tabular-nums ${rankClass}`}
      >
        {rank}
      </span>
      <span className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 leading-tight">
        {label}
      </span>
    </div>
  );
}

// ── Personnel bullet ──────────────────────────────────────────────────────────

function MoveLine({
  player,
  position,
  detail,
  direction,
}: {
  player: string;
  position: string;
  detail?: string;
  direction: "in" | "out";
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <span className="font-semibold text-slate-900 text-sm">{player}</span>
        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 uppercase">
          {position}
        </span>
      </div>
      {detail && (
        <span className={`shrink-0 text-xs font-bold ${direction === "in" ? "text-emerald-700" : "text-slate-400"}`}>
          {detail}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NflWarrenSharpTeamProfile({
  team,
}: {
  team: NflGuideTeam;
}) {
  const profile = getWarrenSharpProfile(team.abbr);
  const [showDraft, setShowDraft] = useState(false);

  if (!profile) return null;

  const { coaching, keyAdditions, keyDepartures, draftAdditions, positionalRatings, outlook } = profile;

  const bestUnits = POSITIONAL_ORDER
    .map((k) => ({ key: k, rank: positionalRatings[k as keyof WsPositionalRatings] as number }))
    .filter((u) => u.rank <= 8)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);

  const weakestUnits = POSITIONAL_ORDER
    .map((k) => ({ key: k, rank: positionalRatings[k as keyof WsPositionalRatings] as number }))
    .filter((u) => u.rank >= 25)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3);

  return (
    <section className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
              Warren Sharp 2026 Football Preview
            </div>
            <h2 className="mt-0.5 text-xl font-black text-slate-900">
              2026 Personnel &amp; Positional Outlook
            </h2>
          </div>
          <div className="text-right text-[10px] font-semibold text-slate-400">
            <div>Chapter p.{profile.chapterStartPage}</div>
            <div>Rankings p.{positionalRatings.sourcePage}</div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6">

        {/* Coaching */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={`rounded-xl border p-4 ${coaching.headCoachNew ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Head Coach</div>
              {coaching.headCoachNew && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-700">New 2026</span>
              )}
            </div>
            <div className="font-black text-slate-900 text-base">{coaching.headCoach}</div>
            {!coaching.headCoachNew && (
              <div className="text-[10px] text-slate-500 mt-0.5">Year {coaching.headCoachPriorYears + 1} with team</div>
            )}
          </div>
          <div className={`rounded-xl border p-4 ${coaching.offensiveCoordinatorNew ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Offensive Coord.</div>
              {coaching.offensiveCoordinatorNew && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-700">New</span>
              )}
            </div>
            <div className="font-black text-slate-900 text-base">{coaching.offensiveCoordinator}</div>
            {!coaching.offensiveCoordinatorNew && (
              <div className="text-[10px] text-slate-500 mt-0.5">Year {coaching.offensiveCoordinatorPriorYears + 1}</div>
            )}
          </div>
          <div className={`rounded-xl border p-4 ${coaching.defensiveCoordinatorNew ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Defensive Coord.</div>
              {coaching.defensiveCoordinatorNew && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-700">New</span>
              )}
            </div>
            <div className="font-black text-slate-900 text-base">{coaching.defensiveCoordinator}</div>
            {!coaching.defensiveCoordinatorNew && (
              <div className="text-[10px] text-slate-500 mt-0.5">Year {coaching.defensiveCoordinatorPriorYears + 1}</div>
            )}
          </div>
        </div>

        {/* Positional ratings */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-900">2026 Positional Unit Rankings</h3>
            <span className="text-[10px] font-bold text-slate-400">#1 = Strongest</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {POSITIONAL_ORDER.map((key) => (
              <RankCard
                key={key}
                label={POSITIONAL_RATING_LABELS[key as keyof typeof POSITIONAL_RATING_LABELS]}
                rank={positionalRatings[key as keyof WsPositionalRatings] as number}
              />
            ))}
          </div>
          {/* Strongest / weakest callout */}
          {(bestUnits.length > 0 || weakestUnits.length > 0) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {bestUnits.length > 0 && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700 mb-1">Elite units</div>
                  <div className="text-xs text-emerald-900 space-y-0.5">
                    {bestUnits.map((u) => (
                      <div key={u.key}>
                        <span className="font-bold">#{u.rank}</span>{" "}
                        {POSITIONAL_RATING_LABELS[u.key as keyof typeof POSITIONAL_RATING_LABELS]}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {weakestUnits.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wide text-red-700 mb-1">Areas of concern</div>
                  <div className="text-xs text-red-900 space-y-0.5">
                    {weakestUnits.map((u) => (
                      <div key={u.key}>
                        <span className="font-bold">#{u.rank}</span>{" "}
                        {POSITIONAL_RATING_LABELS[u.key as keyof typeof POSITIONAL_RATING_LABELS]}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Key additions + departures */}
        <div className="grid gap-4 md:grid-cols-2">
          {keyAdditions.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-emerald-800 mb-2">Key Additions</h3>
              <div>
                {keyAdditions.map((move) => (
                  <MoveLine
                    key={`add-${move.player}`}
                    player={move.player}
                    position={move.position}
                    detail={move.contractNote}
                    direction="in"
                  />
                ))}
              </div>
            </div>
          )}
          {keyDepartures.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-red-700 mb-2">Key Departures</h3>
              <div>
                {keyDepartures.map((move) => (
                  <MoveLine
                    key={`dep-${move.player}`}
                    player={move.player}
                    position={move.position}
                    detail={move.newTeam ? `→ ${move.newTeam.toUpperCase()}` : undefined}
                    direction="out"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Draft additions (collapsed by default) */}
        {draftAdditions.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowDraft((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              aria-expanded={showDraft}
            >
              <span>Draft additions ({draftAdditions.length} picks highlighted)</span>
              {showDraft ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
            </button>
            {showDraft && (
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
                {draftAdditions.map((pick) => (
                  <div key={`draft-${pick.pick}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      Rd {pick.round} · #{pick.pick}
                    </span>
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900 text-sm">{pick.player}</span>
                      <span className="ml-1.5 text-[10px] font-bold text-slate-500 uppercase">{pick.position}</span>
                      <span className="ml-1.5 text-[10px] text-slate-400">({pick.college})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Outlook */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="text-[10px] font-black uppercase tracking-wide text-emerald-700 mb-2">Sharp's 2026 Strengths</h3>
            <ul className="space-y-1.5">
              {outlook.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs leading-5 text-emerald-900">
                  <span className="mt-0.5 shrink-0 text-emerald-500">▲</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <h3 className="text-[10px] font-black uppercase tracking-wide text-red-700 mb-2">Sharp's 2026 Concerns</h3>
            <ul className="space-y-1.5">
              {outlook.concerns.map((c, i) => (
                <li key={i} className="flex gap-2 text-xs leading-5 text-red-900">
                  <span className="mt-0.5 shrink-0 text-red-400">▼</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* JKB takeaway */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-blue-700 mb-1.5">Joe Knows Ball Takeaway</div>
          <p className="text-sm leading-6 text-blue-900">{outlook.jkbTakeaway}</p>
        </div>

        {/* Attribution */}
        <p className="text-[10px] leading-4 text-slate-400">
          Personnel data derived from the Warren Sharp 2026 Football Preview (p.{profile.chapterStartPage}–{profile.chapterStartPage + 15}).
          Positional unit rankings from p.{positionalRatings.sourcePage}: #1 = strongest unit in the NFL.
          Do not confuse with schedule strength (where #1 = hardest).
          Sharp data is kept separate from Joe Knows Ball model, VSiN, and Vegas market data.
        </p>
      </div>
    </section>
  );
}
