import { useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import type { NumerologyPlay, WatchlistPlay, NumerologySignal } from "@/types/mlbNumerology";
import { ChevronDown, ChevronUp } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function scoreTier(score: number) {
  if (score >= 85) return { label: "Elite Alignment", color: "text-violet-200", barColor: "bg-violet-400" };
  if (score >= 75) return { label: "Strong Alignment", color: "text-emerald-300", barColor: "bg-emerald-400" };
  if (score >= 65) return { label: "Moderate Alignment", color: "text-sky-300", barColor: "bg-sky-400" };
  return { label: "Watchlist", color: "text-slate-400", barColor: "bg-slate-500" };
}

const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  primary_exact_master: { bg: "bg-violet-500/25", text: "text-violet-200", label: "Exact Master" },
  primary_exact_root:   { bg: "bg-violet-400/20", text: "text-violet-300", label: "Exact Primary" },
  primary_root:         { bg: "bg-sky-500/20",    text: "text-sky-200",    label: "Root Match" },
  secondary_exact:      { bg: "bg-indigo-500/20", text: "text-indigo-200", label: "Calendar Exact" },
  secondary_root:       { bg: "bg-slate-500/20",  text: "text-slate-300",  label: "Secondary Root" },
  family_support:       { bg: "bg-emerald-500/15",text: "text-emerald-300",label: "Family" },
  personal_cycle:       { bg: "bg-teal-500/20",   text: "text-teal-200",   label: "Personal Cycle" },
  name_resonance:       { bg: "bg-amber-500/15",  text: "text-amber-300",  label: "Name Resonance" },
  contextual_echo:      { bg: "bg-stone-500/20",  text: "text-stone-300",  label: "Echo" },
  countercurrent:       { bg: "bg-rose-500/20",   text: "text-rose-300",   label: "Countercurrent" },
};

function SignalBadge({ type }: { type: string }) {
  const s = SIGNAL_STYLES[type] ?? SIGNAL_STYLES.family_support;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function LineupBadge({ status }: { status: NumerologyPlay["lineupStatus"] }) {
  const m: Record<string, { bg: string; text: string; label: string }> = {
    confirmed:         { bg:"bg-emerald-500/20", text:"text-emerald-300", label:"✓ Confirmed" },
    projected:         { bg:"bg-sky-500/20",     text:"text-sky-300",     label:"~ Projected" },
    morning_projected: { bg:"bg-amber-500/20",   text:"text-amber-300",   label:"⏳ Morning Projected" },
    not_starting:      { bg:"bg-rose-500/20",    text:"text-rose-300",    label:"✗ Not Starting" },
    unknown:           { bg:"bg-slate-600/30",   text:"text-slate-400",   label:"? Unconfirmed" },
  };
  const s = m[status] ?? m.unknown;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function ScoreBar({ value, barColor }: { value: number; barColor: string }) {
  return (
    <div className="h-1 w-full rounded-full bg-white/10">
      <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ─── Daily Code display ───────────────────────────────────────────────────────

function DailyCode({ profile, date }: { profile: NonNullable<ReturnType<typeof useMLBNumerology>["data"]>["dailyProfile"]; date: string }) {
  const [, month, day] = date.split("-");
  const udLabel = profile.universalDayMaster
    ? `${profile.universalDayMaster}/${profile.universalDayRoot}`
    : `${profile.universalDayCompound}/${profile.universalDayRoot}`;
  const cdLabel = `${profile.calendarDayCompound}/${profile.calendarDayRoot}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1628] p-5">
      {/* Calculation sequence */}
      <div className="mb-4 font-mono text-center">
        <div className="text-xs text-white/30 tracking-[0.3em] mb-1">{month} · {day} · {date.split("-")[0]}</div>
        <div className="text-[10px] text-white/20 mb-1">{profile.universalDayTrace[0]}</div>
        <div className="text-2xl font-black text-violet-300 tracking-wider">{udLabel}</div>
        <div className="text-[9px] text-white/25 mt-1">Universal Day</div>
      </div>

      {/* Primary / Secondary grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Primary Current */}
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-3">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-violet-400/60">Primary Current</div>
          <div className="space-y-1.5">
            <Row label="Universal Day" value={udLabel} highlight />
            <Row label="Primary Family" value={`[${profile.primaryFamily.join(" · ")}]`} />
            <Row label="Balancing" value={String(profile.balancingComplement)} />
            <Row label="Countercurrent" value={String(profile.countercurrent)} dim />
          </div>
        </div>

        {/* Secondary Current */}
        <div className="rounded-xl border border-white/8 bg-white/3 p-3">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Secondary Current</div>
          <div className="space-y-1.5">
            <Row label="Calendar Day" value={cdLabel} />
            <Row label="Secondary Family" value={`[${profile.secondaryFamily.join(" · ")}]`} />
            <Row label="Universal Month" value={String(profile.universalMonth)} />
            <Row label="Universal Year" value={String(profile.universalYear)} />
            <Row label="Structural Echo" value={profile.structuralEcho} dim />
            {profile.repeatedDigits.length > 0 && (
              <Row label="Repeated Digits" value={profile.repeatedDigits.map(r => `${r.digit}×${r.count}`).join(", ")} dim />
            )}
          </div>
        </div>
      </div>

      {/* Interpretation */}
      {profile.interpretation && (
        <div className="mt-4 border-t border-white/8 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1.5">Reading the Current</div>
          <p className="text-[11px] leading-5 text-white/50">{profile.interpretation}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight, dim }: { label: string; value: string; highlight?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-white/30">{label}</span>
      <span className={`font-mono text-[10px] font-bold ${highlight ? "text-violet-300" : dim ? "text-white/30" : "text-white/70"}`}>{value}</span>
    </div>
  );
}

// ─── Play card ────────────────────────────────────────────────────────────────

function PlayCard({ play }: { play: NumerologyPlay }) {
  const [expanded, setExpanded] = useState(false);
  const tier = scoreTier(play.finalScore);
  const positive = play.positiveSignals ?? [];
  const counter = play.counterSignals ?? [];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1628] overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-black text-white/40">
          {play.rank}
        </div>
        {play.playerId != null && typeof play.playerId === "number" && (
          <div className="shrink-0">
            <MlbPlayerHeadshot playerId={play.playerId} name={play.playerName} teamAbbreviation={play.team} size={42} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white text-sm">{play.playerName}</span>
            <span className="text-xs text-white/35">{play.team} vs {play.opponent}</span>
            {play.jerseyNumber != null && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/50">#{play.jerseyNumber}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <LineupBadge status={play.lineupStatus} />
            {play.battingOrder != null && <span className="text-[9px] text-white/30">Batting {play.battingOrder}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-white/60">{play.recommendedMarket}</span>
            {play.odds != null && <span className="text-xs font-bold text-emerald-400">{play.odds}</span>}
          </div>
          {play.primaryPatternLabel && (
            <div className="mt-1.5 text-[10px] italic text-white/35">{play.primaryPatternLabel}</div>
          )}
        </div>
        {/* Score badge */}
        <div className="shrink-0 text-right">
          <div className={`text-2xl font-black tabular-nums ${tier.color}`}>{play.finalScore}</div>
          <div className="text-[8px] uppercase tracking-wide text-white/25">{tier.label}</div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-2 gap-3 border-t border-white/8 px-4 py-2.5">
        <div>
          <div className="mb-1 flex justify-between">
            <span className="text-[9px] text-white/30">Numerology</span>
            <span className="text-[9px] font-bold text-violet-300">{play.numerologyScore}</span>
          </div>
          <ScoreBar value={play.numerologyScore} barColor="bg-violet-400" />
        </div>
        <div>
          <div className="mb-1 flex justify-between">
            <span className="text-[9px] text-white/30">Baseball</span>
            <span className="text-[9px] font-bold text-sky-300">{play.baseballScore}</span>
          </div>
          <ScoreBar value={play.baseballScore} barColor="bg-sky-400" />
        </div>
      </div>

      {/* Summary */}
      {play.summary && (
        <div className="border-t border-white/8 px-4 py-2.5">
          <p className="text-[11px] leading-5 text-white/45">{play.summary}</p>
        </div>
      )}

      {/* Signal map preview */}
      {positive.length > 0 && (
        <div className="border-t border-white/8 px-4 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {positive.slice(0, 3).map((s, i) => <SignalBadge key={i} type={s.type} />)}
            {counter.length > 0 && <SignalBadge type="countercurrent" />}
          </div>
        </div>
      )}

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between border-t border-white/8 px-4 py-2 text-[10px] font-semibold text-white/30 transition hover:text-white/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
      >
        <span>Calculation trace</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-2">
          {play.formula && (
            <div className="rounded bg-white/5 px-3 py-2 font-mono text-[10px] text-white/40">{play.formula}</div>
          )}
          {positive.map((s, i) => (
            <div key={i} className="rounded-lg bg-white/4 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <SignalBadge type={s.type} />
                <span className="text-[10px] font-semibold text-white/70">{s.label}</span>
                <span className="ml-auto font-mono text-[10px] font-bold text-emerald-400">+{s.points}</span>
              </div>
              <p className="text-[9px] text-white/35">{s.description}</p>
            </div>
          ))}
          {counter.map((s, i) => (
            <div key={i} className="rounded-lg bg-rose-500/8 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <SignalBadge type="countercurrent" />
                <span className="text-[10px] font-semibold text-rose-300">{s.label}</span>
                <span className="ml-auto font-mono text-[10px] font-bold text-rose-400">{s.points}</span>
              </div>
              <p className="text-[9px] text-rose-300/50">{s.description}</p>
            </div>
          ))}
          {play.countercurrentExplanation && (
            <p className="text-[9px] italic text-rose-300/50">{play.countercurrentExplanation}</p>
          )}
          {(play.missingData?.length ?? 0) > 0 && (
            <div className="rounded bg-amber-500/10 px-3 py-1.5 text-[9px] text-amber-300/70">
              Missing data: {play.missingData?.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

function WatchlistRow({ play }: { play: WatchlistPlay }) {
  const tier = scoreTier(play.finalScore);
  return (
    <div className="flex items-center gap-3 border-b border-white/8 py-2.5 last:border-0">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/6 text-[9px] font-black text-white/35">{play.rank}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-white/75">{play.playerName}</span>
          <span className="text-[9px] text-white/30">{play.team} vs {play.opponent}</span>
          {play.jerseyNumber != null && <span className="text-[9px] text-white/25">#{play.jerseyNumber}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] text-white/40">{play.recommendedMarket}</span>
          <LineupBadge status={play.lineupStatus} />
        </div>
        {play.primarySignal && <p className="mt-0.5 text-[9px] text-white/25 truncate">{play.primarySignal}</p>}
      </div>
      <span className={`font-mono text-sm font-black tabular-nums ${tier.color}`}>{play.finalScore}</span>
    </div>
  );
}

// ─── Methodology ledger ───────────────────────────────────────────────────────

function MethodologyLedger({ version, weights }: { version: string; weights?: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1628]">
      <button type="button" onClick={() => setOpen(v=>!v)} aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400">
        <span className="text-sm font-bold text-white/50">The Methodology Ledger</span>
        {open ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>
      {open && (
        <div className="border-t border-white/8 px-5 pb-5 pt-4 space-y-3 text-[11px] leading-5 text-white/40">
          <div><span className="text-white/60 font-semibold">Version:</span> {version}</div>
          <div><span className="text-white/60 font-semibold">Primary Universal Day:</span> Full-date digit sum (all digits of MM/DD/YYYY). Master numbers 11, 22, 33 preserved.</div>
          <div><span className="text-white/60 font-semibold">Final Score Formula:</span> 60% × Numerology Resonance + 40% × Baseball Opportunity</div>
          <div><span className="text-white/60 font-semibold">Numerology system:</span> Pythagorean (A=1 through Z=8/9)</div>
          <div><span className="text-white/60 font-semibold">Balancing complement:</span> Model-defined as the number completing 10 (4↔6, 1↔9, etc.)</div>
          <div><span className="text-white/60 font-semibold">Countercurrent:</span> Model-defined as 9 − root (zero → 9). Indicates tension, not failure.</div>
          <p className="italic text-white/25">Numerology traditions are not fully standardized. This model uses a fixed, versioned rule set so that every slate is evaluated consistently.</p>
          <p className="text-white/25">Patterns are documented, not guaranteed. Alignment is not probability. The model records recurrence without claiming causation.</p>
          {weights && (
            <details className="mt-2">
              <summary className="cursor-pointer text-white/35 hover:text-white/60">Signal weights</summary>
              <div className="mt-2 font-mono text-[9px] text-white/30 space-y-0.5">
                {Object.entries(weights).filter(([k]) => !["numerologyWeight","baseballWeight"].includes(k)).map(([k,v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span>{k}</span><span>{v}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MlbNumerologyPage() {
  usePageSeo({
    title: "MLB Numerical Alignment | JoeKnowsBall",
    description: "Experimental daily numerical alignment analysis for MLB player props.",
    path: "/mlb/numerology",
    noindex: true,
  });

  const { data, loading, error, isStale } = useMLBNumerology();
  const etDate = getEtDate();

  return (
    <SiteShell>
      <main className="min-h-screen relative" style={{ background: "linear-gradient(150deg,#04080f 0%,#090f1e 40%,#0b0b16 100%)" }}>
        {/* Watermark numbers */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
          <div className="absolute left-[-2%] top-[8%] text-[30vw] font-black text-white/[0.015] leading-none">3</div>
          <div className="absolute right-[-2%] bottom-[10%] text-[25vw] font-black text-white/[0.012] leading-none">9</div>
        </div>

        <div className="relative mx-auto max-w-2xl px-4 py-8 sm:px-6">

          {/* Back */}
          <Link to="/mlb" className="mb-6 inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/20 transition hover:text-white/50">
            ← MLB
          </Link>

          {/* Hero */}
          <div className="mb-7">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/8 font-black text-[10px] text-violet-300/70">
                369
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-violet-400/50">Hidden Channel</p>
                <h1 className="text-lg font-black tracking-tight text-white">MLB Numerical Alignment</h1>
              </div>
            </div>
            <p className="text-xs text-white/30 mb-1">Patterns beneath the slate.</p>
            <p className="text-[10px] text-white/20 italic mb-3">The model does not claim causation. It records recurrence.</p>

            {/* Status bar */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-white/25 font-mono">
              <span>Date: {etDate}</span>
              <span>Scheduled: {data?.scheduledFor ?? "09:36 ET"}</span>
              {data?.generatedAt && <span>Updated: {new Date(data.generatedAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"})} ET</span>}
              {data?.methodologyVersion && <span>v{data.methodologyVersion}</span>}
              {data?.dataStatus && <span className="text-amber-400/60 capitalize">{data.dataStatus.replace(/_/g," ")}</span>}
            </div>

            {(data?.dataStatus === "morning_projected" || isStale) && (
              <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300/70">
                {isStale ? "⚠️ Previous Analysis — today's alignment has not been generated yet." : "⏳ Morning analysis — batting orders may be projected. Lineup confirmation pending."}
              </div>
            )}

            <p className="mt-3 rounded-lg border border-white/6 bg-white/3 px-3 py-2 text-[10px] text-white/30">
              This experimental feature analyzes numerical patterns for research and entertainment. It does not guarantee player performance.
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/4" />)}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-4 py-8 text-center">
              <p className="text-sm text-rose-300">Today's numerical alignment analysis is not available yet.</p>
              <p className="mt-1 text-[9px] text-rose-300/40">{error}</p>
            </div>
          )}

          {!loading && !error && !data && (
            <div className="rounded-xl border border-white/8 bg-[#0a1628] px-4 py-10 text-center text-sm text-white/25">
              Today's numerical alignment analysis is not available yet.
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">

              {/* Daily Code */}
              <section>
                <SectionLabel>The Daily Code</SectionLabel>
                <DailyCode profile={data.dailyProfile} date={data.date} />
              </section>

              {/* Highest Alignment */}
              {data.featuredPlays.length > 0 && (
                <section>
                  <SectionLabel>Highest Alignment</SectionLabel>
                  <div className="space-y-3">
                    {data.featuredPlays.map(play => <PlayCard key={`${play.rank}-${play.playerName}`} play={play} />)}
                  </div>
                </section>
              )}

              {data.featuredPlays.length === 0 && (data as any).bestAvailable?.length > 0 && (
                <section>
                  <SectionLabel>Best Available Alignments</SectionLabel>
                  <div className="mb-3 rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300/70">
                    Best available today — below the featured-play threshold (60). No player on today's slate has reached qualifying alignment.
                  </div>
                  <div className="space-y-3">
                    {(data as any).bestAvailable.map((play: any) => (
                      <PlayCard key={`ba-${play.rank}-${play.playerName}`} play={play} />
                    ))}
                  </div>
                </section>
              )}

              {data.featuredPlays.length === 0 && !((data as any).bestAvailable?.length) && (
                <div className="rounded-xl border border-white/8 bg-[#0a1628] px-4 py-8 text-center text-xs text-white/25">
                  No featured plays available. Check back after the morning model run.
                </div>
              )}

              {/* Countercurrents */}
              {(data.countercurrents?.length ?? 0) > 0 && (
                <section>
                  <SectionLabel>Countercurrents</SectionLabel>
                  <p className="mb-3 text-[10px] text-white/30">Conflicting or opposing patterns. These are not predicted failures — they represent tension between numerical fields and baseball opportunity.</p>
                  <div className="rounded-2xl border border-rose-500/15 bg-[#0a1628] px-4 py-1">
                    {data.countercurrents!.map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 border-b border-white/6 py-2.5 last:border-0">
                        <div>
                          <span className="text-[11px] font-semibold text-white/60">{c.playerName}</span>
                          <span className="ml-2 text-[9px] text-white/25">{c.team}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[9px] font-mono">
                          <span className="text-violet-300/60">N:{c.numerologyScore}</span>
                          <span className="text-sky-300/60">B:{c.baseballScore}</span>
                          <span className="text-white/40">{c.finalScore}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Watchlist */}
              {data.watchlist.length > 0 && (
                <section>
                  <SectionLabel>Numerical Watchlist</SectionLabel>
                  <div className="rounded-2xl border border-white/8 bg-[#0a1628] px-4 py-1">
                    {data.watchlist.map(play => <WatchlistRow key={`${play.rank}-${play.playerName}`} play={play} />)}
                  </div>
                </section>
              )}

              {/* Closing observation */}
              {data.narrative?.closingObservation && (
                <p className="text-center text-[10px] italic text-white/25 px-4">{data.narrative.closingObservation}</p>
              )}

              {/* Methodology */}
              <section>
                <MethodologyLedger
                  version={data.methodologyVersion}
                  weights={data.scoringConfiguration?.weights}
                />
              </section>

              <p className="text-center text-[9px] text-white/15">
                Strong numerical overlap can coexist with poor baseball opportunity. Unknown data is shown as unknown.
              </p>
            </div>
          )}
        </div>
      </main>
    </SiteShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/25">{children}</h2>;
}
