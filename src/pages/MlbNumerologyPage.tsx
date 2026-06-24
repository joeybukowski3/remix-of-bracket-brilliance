import { useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import type { NumerologyPlay, NumerologySignal } from "@/types/mlbNumerology";
import { ChevronDown, ChevronUp } from "lucide-react";

// ─── Score helpers ────────────────────────────────────────────────────────────

function scoreTier(score: number): { label: string; color: string; ring: string } {
  if (score >= 85) return { label: "Elite Alignment",    color: "text-violet-300", ring: "ring-violet-400/50" };
  if (score >= 75) return { label: "Strong Alignment",   color: "text-emerald-300", ring: "ring-emerald-400/40" };
  if (score >= 65) return { label: "Moderate Alignment", color: "text-sky-300",     ring: "ring-sky-400/30" };
  return             { label: "Watchlist",               color: "text-slate-400",   ring: "ring-slate-500/20" };
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10">
      <div
        className={`h-1.5 rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function FinalScoreBadge({ score }: { score: number }) {
  const tier = scoreTier(score);
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl ring-1 ${tier.ring} bg-white/5 px-3 py-2 min-w-[72px]`}>
      <span className={`text-2xl font-black tabular-nums ${tier.color}`}>{score}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40 text-center leading-tight mt-0.5">{tier.label}</span>
    </div>
  );
}

// ─── Signal badges ────────────────────────────────────────────────────────────

const SIGNAL_STYLES: Record<NumerologySignal["type"], { bg: string; text: string; label: string }> = {
  exact:     { bg: "bg-violet-500/20", text: "text-violet-200", label: "Exact Match" },
  reduced:   { bg: "bg-sky-500/20",    text: "text-sky-200",    label: "Reduced Match" },
  family:    { bg: "bg-emerald-500/20",text: "text-emerald-200",label: "Family" },
  master:    { bg: "bg-amber-500/20",  text: "text-amber-200",  label: "Master Number" },
  secondary: { bg: "bg-slate-500/20",  text: "text-slate-300",  label: "Secondary" },
};

function SignalBadge({ type }: { type: NumerologySignal["type"] }) {
  const s = SIGNAL_STYLES[type];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function LineupBadge({ status }: { status: NumerologyPlay["lineupStatus"] }) {
  const map = {
    confirmed:    { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "✓ Confirmed" },
    projected:    { bg: "bg-sky-500/20",     text: "text-sky-300",     label: "~ Projected" },
    not_starting: { bg: "bg-rose-500/20",    text: "text-rose-300",    label: "✗ Not Starting" },
    unknown:      { bg: "bg-slate-500/20",   text: "text-slate-400",   label: "? Unconfirmed" },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ─── Play card ────────────────────────────────────────────────────────────────

function PlayCard({ play, featured }: { play: NumerologyPlay; featured?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-2xl border bg-[#0c1829] transition ${featured ? "border-white/15" : "border-white/8"}`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        {/* Rank */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs font-black text-white/50">
          {play.rank}
        </div>

        {/* Headshot */}
        {featured && (
          <div className="shrink-0">
            <MlbPlayerHeadshot
              playerId={typeof play.playerId === "number" ? play.playerId : null}
              name={play.playerName}
              teamAbbreviation={play.team}
              size={44}
            />
          </div>
        )}

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white">{play.playerName}</span>
            <span className="text-xs text-white/40">{play.team} vs {play.opponent}</span>
            {play.jerseyNumber != null && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/60">#{play.jerseyNumber}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <LineupBadge status={play.lineupStatus} />
            {play.battingOrder != null && (
              <span className="text-[10px] text-white/40">Batting {play.battingOrder}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-white/70">{play.recommendedMarket}</span>
            {play.odds != null && (
              <span className="text-xs font-bold text-emerald-400">{play.odds}</span>
            )}
            {play.line != null && play.line !== play.odds && (
              <span className="text-xs text-white/40">Line: {play.line}</span>
            )}
          </div>
        </div>

        {/* Score */}
        <FinalScoreBadge score={play.finalScore} />
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-2 gap-3 border-t border-white/8 px-4 py-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] text-white/40">Numerology</span>
            <span className="text-[10px] font-bold text-violet-300">{play.numerologyScore}</span>
          </div>
          <ScoreBar value={play.numerologyScore} color="bg-violet-400" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] text-white/40">Baseball</span>
            <span className="text-[10px] font-bold text-sky-300">{play.baseballScore}</span>
          </div>
          <ScoreBar value={play.baseballScore} color="bg-sky-400" />
        </div>
      </div>

      {/* Summary */}
      <div className="border-t border-white/8 px-4 py-3">
        <p className="text-[11px] leading-5 text-white/55">{play.summary}</p>
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between border-t border-white/8 px-4 py-2.5 text-[10px] font-semibold text-white/40 transition hover:text-white/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
      >
        <span>Signal breakdown</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {/* Expanded signals */}
      {expanded && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-2">
          {play.positiveSignals.map((sig, i) => (
            <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <SignalBadge type={sig.type} />
                <span className="text-[11px] font-semibold text-white/80">{sig.label}</span>
                {sig.points != null && (
                  <span className="ml-auto text-[10px] font-bold text-emerald-400">+{sig.points}</span>
                )}
              </div>
              <p className="text-[10px] leading-4 text-white/45">{sig.explanation}</p>
            </div>
          ))}
          {play.counterSignals.map((sig, i) => (
            <div key={i} className="rounded-lg bg-rose-500/10 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-block rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-300">Counter Signal</span>
                <span className="text-[11px] font-semibold text-rose-200">{sig.label}</span>
                {sig.points != null && (
                  <span className="ml-auto text-[10px] font-bold text-rose-400">{sig.points}</span>
                )}
              </div>
              <p className="text-[10px] leading-4 text-rose-200/60">{sig.explanation}</p>
            </div>
          ))}
          {play.positiveSignals.length === 0 && play.counterSignals.length === 0 && (
            <p className="text-[10px] text-white/30">No signals detailed for this entry.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Watchlist table ──────────────────────────────────────────────────────────

function WatchlistRow({ play }: { play: NumerologyPlay }) {
  const tier = scoreTier(play.finalScore);
  return (
    <div className="flex items-center gap-3 border-b border-white/8 py-2.5 last:border-0">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-[9px] font-black text-white/40">
        {play.rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-white/80">{play.playerName}</span>
          <span className="text-[10px] text-white/35">{play.team} vs {play.opponent}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-white/45">{play.recommendedMarket}</span>
          <LineupBadge status={play.lineupStatus} />
        </div>
        {play.positiveSignals[0] && (
          <p className="mt-0.5 text-[9px] text-white/30 truncate">{play.positiveSignals[0].label}</p>
        )}
      </div>
      <div className={`text-sm font-black tabular-nums ${tier.color}`}>{play.finalScore}</div>
    </div>
  );
}

// ─── Methodology ─────────────────────────────────────────────────────────────

function Methodology({ weight }: { weight?: { numerologyWeight: number; baseballWeight: number; version: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1829]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-white/70">How This Works</span>
        {open ? <ChevronUp className="h-4 w-4 text-white/40" /> : <ChevronDown className="h-4 w-4 text-white/40" />}
      </button>
      {open && (
        <div className="border-t border-white/10 px-5 pb-5 pt-4 text-[11px] leading-5 text-white/45 space-y-3">
          <p>The Final Alignment Score combines a Numerology Resonance Score and a Baseball Opportunity Score.</p>
          {weight && (
            <p>Current weights: numerology {Math.round(weight.numerologyWeight * 100)}% · baseball {Math.round(weight.baseballWeight * 100)}% · model v{weight.version}</p>
          )}
          <p><strong className="text-white/60">Numerology inputs considered:</strong> Universal date number, compound and master numbers, jersey number (direct and reduced), batting-order position, player birth date, age, Personal Day, Life Path, name number, team and game-time relationships.</p>
          <p><strong className="text-white/60">Baseball inputs considered:</strong> Matchup quality, park factors, pitcher vulnerability metrics, lineup confirmation, recent form, and prop market opportunity.</p>
          <p>Exact matches (jersey = primary number) carry the strongest weight. Reduced matches (sum of digits = primary number) carry secondary weight. Family membership and master-number connections provide supporting signals.</p>
          <p>This feature is experimental. Scores represent numerical alignment patterns — not outcome predictions.</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MlbNumerologyPage() {
  usePageSeo({
    title: "MLB Numerical Alignment | JoeKnowsBall",
    description: "Experimental daily numerical alignment analysis for MLB player props. Pattern-based research combining numerological resonance with baseball opportunity scoring.",
    path: "/mlb/numerology",
    noindex: true,
  });

  const { data, loading, error, isStale } = useMLBNumerology();
  const profile = data?.dailyProfile;

  return (
    <SiteShell>
      <main
        className="min-h-screen"
        style={{ background: "linear-gradient(160deg, #060d1a 0%, #0d1b33 60%, #080f1f 100%)" }}
      >
        {/* Subtle geometric background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.03]" aria-hidden>
          <div className="absolute left-1/4 top-1/4 text-[600px] font-black text-white select-none leading-none">6</div>
          <div className="absolute right-1/4 bottom-1/4 text-[400px] font-black text-white select-none leading-none">9</div>
        </div>

        <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6">

          {/* Back link */}
          <Link to="/mlb" className="mb-6 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/30 transition hover:text-white/60">
            ← MLB Hub
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-sm font-black text-violet-300">
                369
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400/70">Experimental</p>
                <h1 className="text-xl font-black tracking-tight text-white">MLB Numerical Alignment</h1>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/40 max-w-xl">
              Experimental daily pattern analysis based on date, player, lineup, and game-number relationships.
            </p>
            <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300/70">
              This experimental feature analyzes numerical patterns for research and entertainment. It does not guarantee player performance.
            </p>
          </div>

          {/* Stale data notice */}
          {isStale && (
            <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/8 px-4 py-2.5 text-xs text-amber-300/80">
              ⚠️ Previous Analysis — today's numerical alignment has not been generated yet.
            </div>
          )}

          {/* Loading / error */}
          {loading && (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/5" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-6 text-center">
              <p className="text-sm text-rose-300">Today's numerical alignment analysis is not available yet.</p>
              <p className="mt-1 text-[10px] text-rose-300/50">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">

              {/* ── Daily Number Profile ── */}
              {profile && (
                <section>
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Daily Number Profile · {data.date}</h2>
                  <div className="rounded-2xl border border-white/10 bg-[#0c1829] p-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/30">Primary Number</div>
                        <div className="mt-0.5 text-3xl font-black text-violet-300">{profile.primaryNumber}</div>
                      </div>
                      {profile.compoundNumber != null && (
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/30">Compound</div>
                          <div className="mt-0.5 text-xl font-black text-sky-300">{profile.compoundNumber}</div>
                        </div>
                      )}
                      {profile.masterNumber != null && (
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/30">Master Number</div>
                          <div className="mt-0.5 text-xl font-black text-amber-300">{profile.masterNumber}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/30">Calendar Day</div>
                        <div className="mt-0.5 text-xl font-black text-white/70">{profile.calendarDay}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/30">Number Family</div>
                        <div className="mt-0.5 text-base font-black text-emerald-300">{profile.numberFamily.join(" · ")}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/30">Balancing</div>
                        <div className="mt-0.5 text-xl font-black text-white/60">{profile.balancingNumber}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/30">Shadow</div>
                        <div className="mt-0.5 text-xl font-black text-rose-400/80">{profile.shadowNumber}</div>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-white/8 pt-3">
                      <p className="text-[11px] leading-5 text-white/45">{profile.interpretation}</p>
                    </div>
                    <div className="mt-2 text-[9px] text-white/25">Last updated {new Date(data.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET</div>
                  </div>
                </section>
              )}

              {/* ── Featured Plays ── */}
              <section>
                <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Top Aligned Plays</h2>
                {data.featuredPlays.length === 0 ? (
                  <div className="rounded-xl border border-white/8 bg-[#0c1829] px-4 py-8 text-center text-xs text-white/30">
                    No featured plays available for today.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.featuredPlays.map((play) => (
                      <PlayCard key={`${play.rank}-${play.playerName}`} play={play} featured />
                    ))}
                  </div>
                )}
              </section>

              {/* ── Watchlist ── */}
              {data.watchlist.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Additional Numerical Watchlist</h2>
                  <div className="rounded-2xl border border-white/10 bg-[#0c1829] px-4 py-1">
                    {data.watchlist.map((play) => (
                      <WatchlistRow key={`${play.rank}-${play.playerName}`} play={play} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Methodology ── */}
              <section>
                <Methodology weight={data.methodology} />
              </section>

              {/* ── Demo notice ── */}
              {(data as any)._note && (
                <p className="text-center text-[9px] text-white/20">{(data as any)._note}</p>
              )}
            </div>
          )}

          {!loading && !error && !data && (
            <div className="rounded-xl border border-white/8 bg-[#0c1829] px-4 py-10 text-center text-sm text-white/30">
              Today's numerical alignment analysis is not available yet.
            </div>
          )}

        </div>
      </main>
    </SiteShell>
  );
}
