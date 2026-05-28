import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
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
// Rebalanced (2026-05) to keep elite season-long players (Scheffler, Rory, etc.)
// anchored in Top 5-7 while still surfacing hot form. See inline comments for rationale.
// All weights sum to 1.0. No behavior change for callers or other PGA models.
const PR_WEIGHTS = {
  sgTotal:          0.43, // MUCH STRONGER season-long anchor (full 2026 / rolling 10-20+ events). Primary driver for elite floor.
  sgApp:            0.15, // reduced (Scheffler's current sample is anomalously low; approach still valued but not over-weighted vs total)
  sgPutt:           0.08, // REDUCED — volatile / recency-heavy
  trendRank:        0.04, // MINIMAL recency bias (was 0.13). Enough for true hot streaks without letting 1-2 events tank elites.
  sgAtG:            0.11,
  bogeyAvoidance:   0.14, // increased — strong consistency / "floor" signal for proven players
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

    // ── Stability floor / elite anchor ────────────────────────────────────────
    // Stronger season-long emphasis + explicit bonus for top sgTotal performers.
    // This is the "Floor": consistent elites (Scheffler/Rory-level season SG:Total)
    // cannot drop below ~Top 7 even after a couple mediocre events or noisy
    // sub-stats (e.g. current low sgApp sample for Scheffler). 
    // sgTotal is the best available proxy for "last 10-20 events or full season".
    // Hot rookies/emerging players with legitimately high season sgTotal still
    // receive the bonus and can break Top 20 on pure numbers (recency via trend
    // or recent sgPutt/sgApp spikes remains possible at lower weight).
    // Signature Events + Majors are already embedded in the source season SG
    // aggregates (higher-field events influence the rolling/season figures).
    const sgTPct = percentile(p.sgTotal, sT);
    let stabilityBonus = 0;
    if (sgTPct >= 95) stabilityBonus = 7.0;
    else if (sgTPct >= 90) stabilityBonus = 5.0;
    else if (sgTPct >= 82) stabilityBonus = 3.0;
    else if (sgTPct >= 70) stabilityBonus = 1.2;

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

  const upcoming = useMemo(
    () => [...schedule].filter((e) => e.status === "upcoming").sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [schedule],
  );
  const previous = useMemo(
    () => [...schedule].filter((e) => e.status === "complete").sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [schedule],
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

function BestBetsTiles({ data }: { data: BestBetsPayload }) {
  const hasAny = BET_SECTIONS.some(({ key }) => data[key]?.length > 0);
  if (!hasAny) return null;
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Best Bets</div>
          <div className="text-sm font-black text-slate-900">{data.tournament} · {data.course}</div>
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

  // Mobile: just the current/next single tournament
  const mobileHeroTournament = useMemo(() => {
    const sorted = [...schedule]
      .filter((e) => e.status === "upcoming")
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return active ?? sorted[0] ?? null;
  }, [schedule, active]);

  // Previous tournaments for mobile
  const previousTournaments = useMemo(
    () => [...schedule].filter((e) => e.status === "complete").sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [schedule],
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
          {bestBets && <BestBetsTiles data={bestBets} />}

          {/* Field filter toggle */}
          {currentField && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-emerald-800">
                {fieldOnly
                  ? `${filtered.length} players in ${currentField.tournament} field`
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
            Power score = weighted percentile across SG Total (43% season-long anchor), SG Approach (15%), SG Putting (8%), Recent Form (4%), SG Around Green (11%), Bogey Avoidance (14%), Birdie Ratio (5%) + stability floor bonus for top-tier season SG:Total (anchors elites like Scheffler/Rory in Top 7).
          </p>
        </div>

        {/* Right-hand partners panel — compact names-only table style */}
        <aside className="hidden lg:block w-44 lg:w-48 xl:w-52 shrink-0">
          <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Bet with our partners
            </div>

            <div className="space-y-0.5 text-[12px]">
              <a href="https://sportsbook.draftkings.com/r/sb/Joeywins100/US-SB/US-SC" target="_blank" rel="noopener noreferrer" className="block text-slate-700 hover:text-emerald-700 hover:underline">DraftKings</a>
              <a href="https://fndl.co/20gmq7y" target="_blank" rel="noopener noreferrer" className="block text-slate-700 hover:text-emerald-700 hover:underline">FanDuel</a>
              <a href="https://fanatics.onelink.me/5kut/jhd5jbks" target="_blank" rel="noopener noreferrer" className="block text-slate-700 hover:text-emerald-700 hover:underline">Fanatics</a>
              <a href="https://playmgmsports.onelink.me/TkMx?af_xp=custom&pid=RAF&c=BMGM_RAF&af_ios_url=https%3A%2F%2Fwww.betmgm.com%2Fen%2Fmobileportal%2Finvitefriendssignup%3FinvID%3D15628123&af_android_url=https%3A%2F%2Fwww.betmgm.com%2Fen%2Fmobileportal%2Finvitefriendssignup%3FinvID%3D15628123&af_web_dp=https%3A%2F%2Fwww.betmgm.com%2Fen%2Fmobileportal%2Finvitefriendssignup%3FinvID%3D15628123&af_dp=playmgmsportswrp%3A%2F%2Fnavigation%3Fscheme%3Dhttps%26url%3Dwww.betmgm.com%2Fen%2Fmobileportal%2Finvitefriendssignup%3FinvID%3D15628123" target="_blank" rel="noopener noreferrer" className="block text-slate-700 hover:text-emerald-700 hover:underline">BetMGM</a>
              <a href="https://caesars.com/sportsbook-and-casino/referral?AR=RAF-TDS-8JA" target="_blank" rel="noopener noreferrer" className="block text-slate-700 hover:text-emerald-700 hover:underline">Caesars</a>
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
