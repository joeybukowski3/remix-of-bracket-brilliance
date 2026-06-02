import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { SPORTSBOOKS } from "@/lib/sportsbooks";
import {
  type PgaScheduleFeedEntry,
  type RawPlayerStat,
  getCurrentAndNextEvents,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";

type BestBetPick = { player: string; tournamentRank: number; powerRank: number; topStats: string[]; bullets: string[]; odds?: { outright?: string | null; top5?: string | null; top10?: string | null; top20?: string | null } | null };
type BestBetsPayload = { tournament: string; course: string; outrights: BestBetPick[]; top5: BestBetPick[]; top10: BestBetPick[]; top20: BestBetPick[] };

function useBestBets() {
  const [data, setData] = useState<BestBetsPayload | null>(null);
  useEffect(() => {
    fetch("/data/pga/best-bets.json", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => {});
  }, []);
  return data;
}

type CurrentField = { tournament: string; players: string[]; source: string };

function useCurrentField() {
  const [field, setField] = useState<CurrentField | null>(null);
  useEffect(() => {
    fetch("/data/pga/current-field.json", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setField(d))
      .catch(() => {});
  }, []);
  return field;
}

// ─── Power Ranking Formula ────────────────────────────────────────────────────
// Further refined: sgTotal now dominant (55%) as the core season-long / rolling
// performance signal. Stability floor strengthened dramatically for 90%+ sgTotal
// players so Scheffler/Rory are very difficult to push out of Top 5. Recency kept
// light (3%) for genuine hot emerging players (Yellamaraju etc.) to reach Top 15-20.
// No volume/cut-made data exists in RawPlayerStat, so no consistency multiplier added.
// All weights sum to 1.0. Only this function + PR_WEIGHTS were touched.
const PR_WEIGHTS = {
  sgTotal:          0.55, // DOMINANT season-long anchor (50-55% target). Best proxy for full 2026 + recent 10-20 events.
  sgApp:            0.09, // further reduced (protects vs noisy/low-sample approach numbers)
  sgPutt:           0.04, // sharply reduced — most volatile/recency-prone component
  trendRank:        0.03, // very light recency (kept for hot streaks only; not top-5 driver)
  sgAtG:            0.10,
  bogeyAvoidance:   0.14, // consistency signal (elites avoid blow-ups)
  birdieBogeyRatio: 0.05,
};

type PowerRankRow = RawPlayerStat & { powerScore: number; powerRank: number };

function percentile(value: number, sorted: number[]): number {
  if (!sorted.length) return 50;
  return (sorted.filter((v) => v < value).length / sorted.length) * 100;
}

function buildPowerRankings(players: RawPlayerStat[]): PowerRankRow[] {
  if (!players.length) return [];
  const asc = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const sT = asc(players.map((p) => p.sgTotal));
  const sA = asc(players.map((p) => p.sgApp));
  const sP = asc(players.map((p) => p.sgPutt));
  const sG = asc(players.map((p) => p.sgAtG));
  const sB = asc(players.map((p) => p.bogeyAvoidance));
  const sBr = asc(players.map((p) => p.birdieBogeyRatio));
  const trendPlayers = players.filter((p) => p.trendRank != null);
  const sR = asc(trendPlayers.map((p) => p.trendRank!));

  const scored = players.map((p) => {
    const tPct = p.trendRank != null ? 100 - percentile(p.trendRank, sR) : 50;

    // Base weighted percentile (existing approach, just re-weighted)
    const baseWeighted =
      percentile(p.sgTotal, sT)         * PR_WEIGHTS.sgTotal +
      percentile(p.sgApp, sA)           * PR_WEIGHTS.sgApp +
      percentile(p.sgPutt, sP)          * PR_WEIGHTS.sgPutt +
      tPct                              * PR_WEIGHTS.trendRank +
      percentile(p.sgAtG, sG)           * PR_WEIGHTS.sgAtG +
      percentile(p.bogeyAvoidance, sB)  * PR_WEIGHTS.bogeyAvoidance +
      percentile(p.birdieBogeyRatio, sBr) * PR_WEIGHTS.birdieBogeyRatio;

    // ── Stability floor / elite anchor (significantly strengthened) ───────────
    // Much larger bonuses for 90th+ percentile sgTotal (the true season-long elites).
    // Combined with 55% sgTotal weight, this makes Scheffler and Rory extremely
    // hard to displace from the Top 5 even when other components are noisy in a
    // given window. Hot players with elite sgTotal still rise; merely "hot but
    // not elite season-long" players cannot take the very top spots.
    // (No events-played or cuts-made data is present in the source, so no extra
    // consistency multiplier was added.)
    const sgTPct = percentile(p.sgTotal, sT);
    let stabilityBonus = 0;
    if (sgTPct >= 95) stabilityBonus = 15.0;
    else if (sgTPct >= 90) stabilityBonus = 10.0;
    else if (sgTPct >= 82) stabilityBonus = 5.0;
    else if (sgTPct >= 70) stabilityBonus = 2.0;

    const powerScore = baseWeighted + stabilityBonus;
    return { ...p, powerScore };
  });
  return scored.sort((a, b) => b.powerScore - a.powerScore).map((r, i) => ({ ...r, powerRank: i + 1 }));
}

// ─── Percentile Color System (MAJOR VISUAL UPGRADE) ───────────────────────────
// Strong contrast 10-band percentile background colors (no bubble/pill).
// All text is now forced to white for maximum readability across all bands.
// Backgrounds are rich/saturated enough to support white text.
function getPercentileStyles(pct: number): { bg: string; color: string } {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (p >= 90) return { bg: "#00c853", color: "#ffffff" };   // Brightest Green
  if (p >= 80) return { bg: "#00ab44", color: "#ffffff" };   // Strong Green
  if (p >= 70) return { bg: "#008f36", color: "#ffffff" };   // Medium Green
  if (p >= 60) return { bg: "#2e7d32", color: "#ffffff" };   // Solid Green
  if (p >= 50) return { bg: "#455a64", color: "#ffffff" };   // Neutral Slate
  if (p >= 40) return { bg: "#00838f", color: "#ffffff" };   // Light Cyan-Teal
  if (p >= 30) return { bg: "#006064", color: "#ffffff" };   // Medium Teal
  if (p >= 20) return { bg: "#004d56", color: "#ffffff" };   // Strong Deep Teal
  if (p >= 10) return { bg: "#003d47", color: "#ffffff" };   // Dark Blue-Teal
  return { bg: "#002b36", color: "#ffffff" };                // Deepest (0-9%)
}

// Larger, high-contrast percentile tile with white text on rich background
function PercentileCell({ value }: { value: number }) {
  const s = getPercentileStyles(value);
  return (
    <span
      className="block text-center text-[12px] sm:text-sm font-black tabular-nums py-2"
      style={{ backgroundColor: s.bg, color: '#ffffff' }}
      title={`${Math.round(value)}th percentile`}
    >
      {Math.round(value)}
    </span>
  );
}

// Simple raw strokes-gained value cell (used when user switches to Raw view)
function RawStatCell({ value }: { value: number }) {
  const formatted = value.toFixed(2);
  const isGood = value >= 0.5;
  const isBad = value <= -0.5;
  return (
    <span
      className={`block text-center text-[11px] sm:text-[12px] font-semibold tabular-nums py-2 ${
        isGood ? 'text-emerald-700' : isBad ? 'text-red-600' : 'text-slate-700'
      }`}
      title={`Raw SG: ${formatted}`}
    >
      {formatted}
    </span>
  );
}

// ─── Tournament Hero Card ─────────────────────────────────────────────────────
function TournamentHeroCard({ entry, isActive }: { entry: PgaScheduleFeedEntry; isActive: boolean }) {
  const hasData = Boolean(entry.dataFile);
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${isActive ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      {isActive && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white uppercase tracking-widest">● Live Now</span>
      )}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{entry.dateLabel}</div>
        <div className="text-base font-black text-slate-900 leading-tight">{entry.shortName || entry.name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{entry.courseName} · {entry.location}</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        {hasData ? (
          <>
            <Link to={`/pga/${entry.slug}/model`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">View Model →</Link>
            <Link to={`/pga/${entry.slug}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Picks & Best Bets</Link>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-slate-400 italic">Field data coming soon</span>
        )}
      </div>
    </div>
  );
}

// ─── Desktop Sidebar Schedule (REDESIGNED) ────────────────────────────────────
// - "NOW" tournament (Charles Schwab Challenge when active) is ALWAYS pinned at the very top with strong highlight.
// - Other upcoming events listed below it in a compact list.
// - New clean collapsible "Previous Tournaments" section BELOW the entire current/upcoming schedule.
// - Previous entries show Model buttons when data is available (matching main schedule style).
function ScheduleSidebar({ schedule, current }: { schedule: PgaScheduleFeedEntry[]; current: PgaScheduleFeedEntry | null }) {
  const [showPrevious, setShowPrevious] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  // Use endDate for past/future split — schedule.status is often stale
  const upcoming = useMemo(
    () => [...schedule].filter((e) => (e.endDate ?? e.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [schedule, today],
  );
  const previous = useMemo(
    () => [...schedule].filter((e) => (e.endDate ?? e.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [schedule, today],
  );

  // Separate the pinned NOW event (if present in upcoming) from the rest
  const nowEvent = current && upcoming.some((e) => e.id === current.id) ? current : null;
  const otherUpcoming = nowEvent
    ? upcoming.filter((e) => e.id !== nowEvent.id)
    : upcoming;

  return (
    <aside className="hidden lg:block w-56 lg:w-60 xl:w-64 shrink-0">
      <div className="sticky top-4 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-slate-900 px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Schedule</div>
          <div className="text-sm font-bold text-white mt-0.5">2026 PGA Tour</div>
        </div>

        <div className="max-h-[72vh] overflow-y-auto text-sm">
          {/* === PINNED "NOW" TOURNAMENT (always at absolute top, strongly highlighted) === */}
          {nowEvent && (
            <div className="border-b border-emerald-200 bg-emerald-50/80 px-3 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black text-white tracking-widest">● NOW</span>
                <span className="text-[10px] font-semibold text-emerald-700">{nowEvent.dateLabel}</span>
              </div>
              <div className="font-bold text-emerald-900 leading-tight text-[13px]">{nowEvent.shortName || nowEvent.name}</div>
              <div className="text-[10px] text-emerald-700/80 mt-0.5">{nowEvent.courseName} · {nowEvent.location}</div>

              {nowEvent.dataFile && (
                <div className="mt-2 flex gap-2">
                  <Link
                    to={`/pga/${nowEvent.slug}/model`}
                    className="inline-flex items-center rounded-lg bg-emerald-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-800 active:bg-emerald-900"
                  >
                    Model
                  </Link>
                  <Link
                    to={`/pga/${nowEvent.slug}`}
                    className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Picks &amp; Bets
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Other upcoming (non-NOW) tournaments */}
          {otherUpcoming.length > 0 && (
            <div className="divide-y divide-slate-100">
              {otherUpcoming.map((e) => {
                const hasData = Boolean(e.dataFile);
                return (
                  <div key={e.id} className="px-3 py-2">
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold leading-tight text-slate-800">{e.shortName || e.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{e.dateLabel}</div>
                      </div>
                      {hasData && (
                        <Link
                          to={`/pga/${e.slug}/model`}
                          className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
                        >
                          Model
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* === NEW: Collapsible "Previous Tournaments" section (below the current schedule) === */}
          {previous.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowPrevious((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition"
                aria-expanded={showPrevious}
              >
                <span>Previous Tournaments ({previous.length})</span>
                <span className="text-base leading-none">{showPrevious ? "−" : "+"}</span>
              </button>

              {showPrevious && (
                <div className="border-t border-slate-200 bg-white px-3 py-2 space-y-2">
                  {previous.map((e) => {
                    const hasData = Boolean(e.dataFile);
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-700 truncate">{e.shortName || e.name}</div>
                          <div className="text-[10px] text-slate-500">{e.dateLabel}{e.winner ? ` · ${e.winner}` : ""}</div>
                        </div>
                        {hasData && (
                          <Link
                            to={`/pga/${e.slug}/model`}
                            className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
                          >
                            Model
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Best Bets Tiles ──────────────────────────────────────────────────────────
const BET_SECTIONS = [
  { key: "outrights" as const, label: "🏆 Outrights", color: "#15803d", bg: "rgba(22,163,74,0.08)", border: "rgba(22,163,74,0.25)" },
  { key: "top5"      as const, label: "🔥 Top 5",     color: "#0369a1", bg: "rgba(14,165,233,0.07)", border: "rgba(14,165,233,0.2)" },
  { key: "top10"     as const, label: "⭐ Top 10",    color: "#7c3aed", bg: "rgba(124,58,237,0.07)", border: "rgba(124,58,237,0.2)" },
  { key: "top20"     as const, label: "📋 Top 20",    color: "#b45309", bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.2)" },
];

function BestBetsTiles({ data, scheduleOverride }: { data: BestBetsPayload; scheduleOverride?: { name: string; course: string } | null }) {
  const hasAny = BET_SECTIONS.some(({ key }) => data[key]?.length > 0);
  if (!hasAny) return null;
  const displayName = scheduleOverride?.name ?? data.tournament;
  const displayCourse = scheduleOverride?.course ?? data.course;
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Best Bets</div>
          <div className="text-sm font-black text-slate-900">{displayName} · {displayCourse}</div>
        </div>
        <Link to="/pga/best-bets" className="text-xs font-bold text-emerald-700 hover:underline">View all →</Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BET_SECTIONS.map(({ key, label, color, bg, border }) => {
          const picks = data[key];
          if (!picks?.length) return null;
          return (
            <div key={key} className="rounded-xl p-3 flex flex-col gap-1.5" style={{ backgroundColor: bg, border: `1px solid ${border}` }}>
              <div className="text-[11px] font-black" style={{ color }}>{label}</div>
              {picks.slice(0, 3).map((p) => (
                <div key={p.player} className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold text-slate-800 truncate">{p.player}</span>
                  <span className="shrink-0 text-[10px] font-bold text-slate-400">#{p.tournamentRank}</span>
                </div>
              ))}
              {picks.length > 3 && (
                <Link to="/pga/best-bets" className="text-[10px] font-semibold" style={{ color }}>+{picks.length - 3} more</Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PgaHub() {
  usePageSeo({
    title: "PGA Golf Power Rankings & Tournament Model",
    description: "Overall PGA Tour power rankings plus weekly tournament model picks, best bets, and course fits.",
    path: "/pga",
  });

  const { schedule, playerStats, loading } = usePgaHubData();
  const bestBets = useBestBets();
  const currentField = useCurrentField();
  const [search, setSearch] = useState("");
  const [fieldOnly, setFieldOnly] = useState(true); // default to field-only when data available
  const [showPreviousMobile, setShowPreviousMobile] = useState(false);

  // View mode for the SG columns: percentile ranks (current colored view) or raw SG values
  const [statView, setStatView] = useState<'percentile' | 'raw'>('percentile');

  const { active, current } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const today = new Date().toISOString().slice(0, 10);

  // Mobile: just the current/next single tournament
  const mobileHeroTournament = useMemo(() => {
    const sorted = [...schedule]
      .filter((e) => (e.endDate ?? e.startDate) >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return active ?? sorted[0] ?? null;
  }, [schedule, active, today]);

  // Previous tournaments for mobile
  const previousTournaments = useMemo(
    () => [...schedule].filter((e) => (e.endDate ?? e.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [schedule, today],
  );

  const powerRankings = useMemo(() => buildPowerRankings(playerStats), [playerStats]);
  const fieldSet = useMemo(() => {
    if (!currentField?.players?.length) return null;
    // Normalize for fuzzy matching — last name + first initial
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");
    return new Set(currentField.players.map(normalize));
  }, [currentField]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");
    return powerRankings.filter((r) => {
      // Field filter
      if (fieldOnly && fieldSet) {
        const norm = normalize(r.player);
        // Exact match or substring match (handles name format differences)
        const inField = fieldSet.has(norm)
          || [...fieldSet].some((fn) => fn.includes(norm.slice(0, 8)) || norm.includes(fn.slice(0, 8)));
        if (!inField) return false;
      }
      if (!q) return true;
      return r.player.toLowerCase().includes(q);
    });
  }, [powerRankings, search, fieldOnly, fieldSet]);

  // Only show the "Form" (trendRank) column if the data source actually provided trendRank values.
  // If the form data could not be pulled (all null), hide the entire column.
  const hasFormData = useMemo(
    () => powerRankings.some((r) => r.trendRank != null),
    [powerRankings]
  );

  const fmtScore = (v: number) => v.toFixed(1);
  const fmtPct = (v: number) => `${Math.round(v)}th`;

  // Precompute percentile ranks for display
  const pctRanks = useMemo(() => {
    if (!powerRankings.length) return new Map<string, { sgTotal: number; sgApp: number; sgPutt: number; sgAtG: number }>();
    const asc = (arr: number[]) => [...arr].sort((a, b) => a - b);
    const sT = asc(powerRankings.map((p) => p.sgTotal));
    const sA = asc(powerRankings.map((p) => p.sgApp));
    const sP = asc(powerRankings.map((p) => p.sgPutt));
    const sG = asc(powerRankings.map((p) => p.sgAtG));
    return new Map(powerRankings.map((p) => [p.player, {
      sgTotal: percentile(p.sgTotal, sT),
      sgApp:   percentile(p.sgApp,   sA),
      sgPutt:  percentile(p.sgPutt,  sP),
      sgAtG:   percentile(p.sgAtG,   sG),
    }]));
  }, [powerRankings]);

  return (
    <SiteShell>
      {/* Hero (now centered) */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-8 sm:px-6">
        {/* Wider, responsive container for the hero — scales up on large screens */}
        <div className="mx-auto w-full max-w-[1600px] 2xl:max-w-[1800px] px-4 sm:px-6 lg:px-8 xl:px-10 text-center">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-400">Joe Knows Ball</div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">⛳ PGA Power Rankings</h1>
          <p className="mt-1 text-sm text-slate-300">Overall model across all players · Click a tournament to view the field-filtered model</p>

          {/* Mobile: single current tournament card */}
          {mobileHeroTournament && (
            <div className="mt-5 lg:hidden">
              <TournamentHeroCard entry={mobileHeroTournament} isActive={active?.id === mobileHeroTournament.id} />
              {/* Previous tournaments (mobile) — now shows Model buttons for consistency with new desktop "Previous Tournaments" section */}
              <div className="mt-3">
                <button
                  onClick={() => setShowPreviousMobile((v) => !v)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  {showPreviousMobile ? "▲" : "▼"} Previous tournaments ({previousTournaments.length})
                </button>
                {showPreviousMobile && (
                  <div className="mt-2 space-y-1.5">
                    {previousTournaments.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{e.shortName || e.name}</div>
                          {e.winner && <div className="text-[10px] text-slate-400">W: {e.winner}</div>}
                        </div>
                        {e.dataFile && (
                          <Link
                            to={`/pga/${e.slug}/model`}
                            className="shrink-0 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-600"
                          >
                            Model
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Body: left schedule + main content + right partners panel.
          Much wider container so the central table isn't squished. Responsive padding + higher max-width on large screens. */}
      <div className="mx-auto w-full max-w-[1600px] 2xl:max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 xl:px-10 lg:flex lg:gap-6">

        {/* Desktop sidebar (left) */}
        <ScheduleSidebar schedule={schedule} current={current} />

        {/* Main content (center) */}
        <div className="min-w-0 flex-1">
          {/* Nav pills */}
          <div className="mb-4 flex flex-wrap gap-2">
            <Link to="/pga/best-bets" className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-200">Best Bets</Link>
            <Link to={`/pga/${mobileHeroTournament?.slug ?? "model"}/model`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">Featured Model</Link>
            <Link to="/pga/dfs" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">DFS Upload</Link>
          </div>

          {/* Best Bets tiles */}
          {bestBets && (
            <BestBetsTiles
              data={bestBets}
              scheduleOverride={
                active ? { name: active.shortName ?? active.name, course: active.courseName }
                : current ? { name: current.shortName ?? current.name, course: current.courseName }
                : null
              }
            />
          )}

          {/* Field filter toggle */}
          {currentField && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-emerald-800">
                {fieldOnly
                  ? `${filtered.length} players in ${(active ?? current)?.shortName ?? (active ?? current)?.name ?? currentField.tournament} field`
                  : `Showing all ${powerRankings.length} players`}
              </div>
              <button
                onClick={() => setFieldOnly((v) => !v)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-black transition ${fieldOnly ? "bg-emerald-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
              >
                {fieldOnly ? "This Week Only" : "Show All"}
              </button>
            </div>
          )}

          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search player..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-400"
            />
          </div>

          {/* Stat View Toggle — switch between percentile tiles and raw SG numbers */}
          <div className="mb-3 flex items-center gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">SG Columns:</div>
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-[11px] font-semibold shadow-sm">
              <button
                onClick={() => setStatView('percentile')}
                className={`rounded-full px-3 py-1 transition ${statView === 'percentile' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Percentile
              </button>
              <button
                onClick={() => setStatView('raw')}
                className={`rounded-full px-3 py-1 transition ${statView === 'raw' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Raw
              </button>
            </div>
            <div className="text-[10px] text-slate-400">
              {statView === 'percentile' ? 'Rank vs field' : 'Actual strokes gained'}
            </div>
          </div>

          {/* Rankings Table */}
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading rankings…</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="sticky left-0 z-30 bg-slate-50 px-2 py-2 w-8">#</th>
                    <th className="sticky left-8 z-30 bg-slate-50 px-2 py-2 min-w-[140px]">Player</th>
                    <th className="px-2 py-2 whitespace-nowrap">Score</th>
                    <th className="px-2 py-2 whitespace-nowrap">SG Total</th>
                    <th className="px-2 py-2 whitespace-nowrap">SG App</th>
                    <th className="px-2 py-2 whitespace-nowrap">SG Putt</th>
                    <th className="px-2 py-2 whitespace-nowrap">SG AtG</th>
                    {hasFormData && <th className="px-2 py-2 whitespace-nowrap">Form</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const sbg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                    const pct = pctRanks.get(row.player);
                    return (
                      <tr key={row.player} className={`${sbg} hover:bg-emerald-50/30`}>
                        <td className={`sticky left-0 z-20 border-b border-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-400 ${sbg}`}>{row.powerRank}</td>
                        <td className={`sticky left-8 z-20 border-b border-r border-slate-100 px-2 py-1.5 font-semibold text-slate-900 whitespace-nowrap ${sbg}`}>{row.player}</td>
                        <td className="border-b border-slate-100 px-2 py-1.5">
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums"
                            style={{ backgroundColor: row.powerScore >= 65 ? "#16a34a" : row.powerScore >= 50 ? "rgba(22,163,74,0.15)" : "rgba(148,163,184,0.2)", color: row.powerScore >= 65 ? "#fff" : row.powerScore >= 50 ? "#15803d" : "#475569" }}>
                            {fmtScore(row.powerScore)}
                          </span>
                        </td>
                        {/* SG columns: either percentile (colored white-text tiles) or raw values */}
                        {statView === 'percentile' && pct ? (
                          <>
                            <td className="border-b border-slate-100 p-0"><PercentileCell value={pct.sgTotal} /></td>
                            <td className="border-b border-slate-100 p-0"><PercentileCell value={pct.sgApp} /></td>
                            <td className="border-b border-slate-100 p-0"><PercentileCell value={pct.sgPutt} /></td>
                            <td className="border-b border-slate-100 p-0"><PercentileCell value={pct.sgAtG} /></td>
                          </>
                        ) : (
                          <>
                            <td className="border-b border-slate-100 p-0"><RawStatCell value={row.sgTotal} /></td>
                            <td className="border-b border-slate-100 p-0"><RawStatCell value={row.sgApp} /></td>
                            <td className="border-b border-slate-100 p-0"><RawStatCell value={row.sgPutt} /></td>
                            <td className="border-b border-slate-100 p-0"><RawStatCell value={row.sgAtG} /></td>
                          </>
                        )}
                        {hasFormData && (
                          <td className="border-b border-slate-100 px-2 py-1.5 text-[11px] text-slate-500 tabular-nums">
                            {row.trendRank != null ? `#${row.trendRank}` : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && !loading && (
                <div className="py-10 text-center text-sm text-slate-400">No players match "{search}"</div>
              )}
            </div>
          )}

          <p className="mt-3 text-[11px] text-slate-400">
            Power score = weighted percentile across SG Total (55% dominant season-long), SG Approach (9%), SG Putting (4%), Recent Form (3%), SG Around Green (10%), Bogey Avoidance (14%), Birdie Ratio (5%) + much stronger stability floor for 90%+ sgTotal (locks elite season performers in Top 5).
          </p>
        </div>

        {/* Right-hand partners panel — compact names-only table style */}
        <aside className="hidden lg:block w-44 lg:w-48 xl:w-52 shrink-0">
          <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Bet with our partners
            </div>

            <div className="space-y-1">
              {SPORTSBOOKS.map((sb) => (
                <a
                  key={sb.name}
                  href={sb.referralUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-bold transition hover:opacity-90"
                  style={{ backgroundColor: sb.bgColor, color: sb.textColor }}
                >
                  <img
                    src={sb.logoUrl}
                    alt={sb.name}
                    className="h-4 w-4 rounded object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {sb.name}
                </a>
              ))}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 text-[9px] text-slate-400 leading-tight">
              21+ • Call 1-800-GAMBLER
            </div>
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}
