import { useEffect, useMemo, useState } from "react";
import { Calculator, Home, Search, Star } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import { useMlbLiveLineups } from "@/hooks/useMlbLiveLineups";
import { calculateNumerologyScoreBreakdown, type PlayerIdentity } from "@/lib/numerology/mlbScoreAudit";
import { panel, type NumerologyCardPlayer } from "@/components/mlb/numerology/NumerologyAuditCard";
import { NumerologyExplorer } from "@/components/mlb/numerology/NumerologyExplorer";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";
import { ResponsiveNumerologyPlayers } from "@/components/mlb/numerology/ResponsiveNumerologyPlayers";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

type ActivityMode = "default" | "broad";
type ActivityData = { atBats?: number; atBatsPrevious2?: number; atBatsPrevious5?: number; qualifiesDefault?: boolean; qualifiesBroad?: boolean };
type ActivityPlayer = NumerologyCardPlayer & { recentActivity?: ActivityData };
type Extended = NumerologyDailyData & { exactNumberMatches?: ActivityPlayer[]; rootNumberMatches?: ActivityPlayer[] };

const desktopLink = "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[#cbc3d7] hover:bg-[#282a32]";
const mobileLink = "rounded-full border border-[#494454] bg-[#171925] px-3 py-1.5 text-xs font-semibold text-[#d8d1e3]";

function qualifiesActivity(player: ActivityPlayer, mode: ActivityMode) {
  const activity = player.recentActivity;
  if (!activity) return true;
  if (mode === "default") {
    if (typeof activity.qualifiesDefault === "boolean") return activity.qualifiesDefault;
    if (activity.atBatsPrevious2 != null) return activity.atBatsPrevious2 >= 3;
    return (activity.atBats ?? 0) >= 3;
  }
  if (typeof activity.qualifiesBroad === "boolean") return activity.qualifiesBroad;
  if (activity.atBatsPrevious5 != null) return activity.atBatsPrevious5 >= 1;
  return (activity.atBats ?? 0) >= 1;
}

export default function MlbNumerologyPageEnhanced() {
  usePageSeo({ title: "MLB Numerology | Joe Knows Ball", description: "Daily numerical alignment across today's MLB slate.", path: "/mlb/numerology" });
  const { data, loading, error, isStale } = useMLBNumerology();
  const { lineups, loading: lineupsLoading } = useMlbLiveLineups(data?.date);
  const [identities, setIdentities] = useState<Record<string, PlayerIdentity>>({});
  const [activityMode, setActivityMode] = useState<ActivityMode>("default");
  const { batters: hrBatters } = useMlbPropsData();

  useEffect(() => {
    let active = true;
    fetch("/data/mlb/player-identity-cache.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .then((value) => { if (active && value && typeof value === "object" && !Array.isArray(value)) setIdentities(value as Record<string, PlayerIdentity>); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const extended = data as Extended | null;
  const profile = data?.dailyProfile;
  const enrich = (player: ActivityPlayer): ActivityPlayer => {
    const playerId = String(player.playerId ?? player.personId ?? "");
    const liveLineup = lineups[playerId] ?? lineups[`${player.playerName}|${player.team}`];
    let scoreBreakdown = player.scoreBreakdown;
    if (profile && data) {
      try { scoreBreakdown = calculateNumerologyScoreBreakdown(player, identities[`${player.playerName}|${player.team}`] ?? null, profile, data.date, data.scoringConfiguration?.weights); }
      catch (reason) { console.error("[mlb-numerology] score breakdown failed", player.playerName, reason); }
    }
    return { ...player, battingOrder: liveLineup?.battingOrder ?? player.battingOrder ?? null, lineupStatus: liveLineup?.lineupStatus ?? player.lineupStatus ?? "unknown", scoreBreakdown };
  };

  const allExact = useMemo(() => Array.isArray(extended?.exactNumberMatches) ? extended.exactNumberMatches.filter(Boolean).map(enrich) : [], [extended?.exactNumberMatches, identities, lineups, profile]);
  const allRoot = useMemo(() => Array.isArray(extended?.rootNumberMatches) ? extended.rootNumberMatches.filter(Boolean).map(enrich) : [], [extended?.rootNumberMatches, identities, lineups, profile]);
  const exact = allExact.filter((player) => qualifiesActivity(player, activityMode));
  const root = allRoot.filter((player) => qualifiesActivity(player, activityMode));
  const confirmedLineupCount = [...exact, ...root].filter((player) => player.battingOrder != null).length;
  const visibleCount = new Set([...exact, ...root].map((player) => `${player.playerName}|${player.team}`)).size;

  return (
    <SiteShell>
      <div className="min-h-screen bg-[#0a0c14] text-[#e2e1ee]">
        <div className="flex">
          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-[#494454] bg-[#1d1f28] p-3 lg:block">
            {/* Compact sidebar title */}
            <div className="mb-3 px-2 pt-2">
              <h2 className="font-serif text-lg leading-tight text-[#d0bcff]">MLB Numerology</h2>
              <p className="text-[11px] text-[#cbc3d7]">The Enlightened Fan</p>
            </div>
            <nav className="space-y-0.5">
              <a className={`${desktopLink} bg-[#a078ff] font-bold text-[#340080]`} href="#overview"><Home className="h-4 w-4" />Overview</a>
              <a className={desktopLink} href="#explorer"><Search className="h-4 w-4" />Explorer</a>
              <a className={desktopLink} href="#exact-matches"><Star className="h-4 w-4" />Exact Matches</a>
              <a className={desktopLink} href="#root-matches"><Calculator className="h-4 w-4" />Root Matches</a>
            </nav>
          </aside>

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <main className="min-w-0 flex-1 px-4 py-3 sm:px-6 lg:px-8">

            {/* ── Page header — compact ──────────────────────────────────────── */}
            <header className="mb-2 border-b border-[#494454] pb-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h1 className="font-serif text-xl font-bold sm:text-2xl">MLB Numerology</h1>
                <p className="text-xs text-[#cbc3d7]">Daily numerical alignment across today's MLB slate.</p>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="font-mono text-[11px]">{data?.date ?? "—"} · {isStale ? "Stale data" : "Current slate"}</span>
                <span className="text-[11px] text-[#958ea0]">
                  {lineupsLoading ? "Checking live lineups…" : confirmedLineupCount > 0 ? `${confirmedLineupCount} players in confirmed lineups` : "Confirmed lineups not posted yet"}
                </span>
              </div>
            </header>

            {/* ── Mobile nav ──────────────────────────────────────────────────── */}
            <nav aria-label="Numerology page sections" className="mb-2 grid grid-cols-3 gap-1.5 lg:hidden">
              <a className={mobileLink} href="#overview">Overview</a>
              <a className={mobileLink} href="#explorer">Explorer</a>
              <a className={mobileLink} href="#exact-matches">Exact</a>
              <a className={mobileLink} href="#root-matches">Root</a>
              <a className={mobileLink} href="#methodology">Method</a>
              <a className={mobileLink} href="/mlb">MLB Home</a>
            </nav>

            {/* ── Recent batting activity — compact single row ─────────────── */}
            <section className={`${panel} mb-2 px-3 py-2`} aria-label="Recent batting activity filter">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[#e2e1ee]">Recent batting activity</span>
                  <span className="ml-2 text-xs text-[#958ea0]">Showing {visibleCount} players.</span>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActivityMode("default")}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-tight ${activityMode === "default" ? "border-[#a078ff] bg-[#a078ff]/20 text-[#e6dcff]" : "border-[#494454] bg-[#171925] text-[#cbc3d7]"}`}
                  >
                    <b className="block">3+ AB / 2 games</b>
                    <span className="text-[10px] text-[#958ea0]">Default</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityMode("broad")}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-tight ${activityMode === "broad" ? "border-[#a078ff] bg-[#a078ff]/20 text-[#e6dcff]" : "border-[#494454] bg-[#171925] text-[#cbc3d7]"}`}
                  >
                    <b className="block">1+ AB / 5 games</b>
                    <span className="text-[10px] text-[#958ea0]">Broader</span>
                  </button>
                </div>
              </div>
            </section>

            {loading && <div className={`${panel} p-6 text-center`}>Loading…</div>}
            {error && <div className="rounded-xl bg-red-950/40 p-4">{error}</div>}

            {data && profile && <>
              {/* ── Overview cards — compact grid ────────────────────────────── */}
              <section id="overview" className="mb-3 scroll-mt-20 grid gap-2 md:grid-cols-2">
                {/* Core Frequencies */}
                <div className={`${panel} p-3`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">Core Frequencies</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#d0bcff]">{profile.universalDayCompound}/{profile.universalDayRoot}</span>
                    <span className="text-sm text-[#cbc3d7]">Universal Day</span>
                  </div>
                  <div className="mt-1.5 rounded-lg bg-[#0c0e16] px-2.5 py-1.5 text-xs">
                    Primary Family: {(profile.primaryFamily ?? []).join(" · ")}
                  </div>
                </div>
                {/* Energy Balancing */}
                <div className={`${panel} p-3`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">Energy Balancing</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-[10px] text-[#958ea0] uppercase">Secondary</span><p className="text-sm">{(profile.secondaryFamily ?? []).join("-") || "—"}</p></div>
                    <div><span className="text-[10px] text-[#958ea0] uppercase">Countercurrent</span><p className="text-sm">{profile.countercurrent ?? "—"}</p></div>
                    <div><span className="text-[10px] text-[#958ea0] uppercase">Complement</span><p className="text-sm">{profile.balancingComplement ?? "—"}</p></div>
                    <div><span className="text-[10px] text-[#958ea0] uppercase">Repeated</span><p className="text-sm">{(profile.repeatedDigits ?? []).map((item) => item.digit).join(", ") || "—"}</p></div>
                  </div>
                </div>
              </section>

              {/* ── Player Explorer ──────────────────────────────────────────── */}
              <NumerologyExplorer exact={exact} root={root} hrBatters={hrBatters} />

              {/* ── Exact & Root match sections ──────────────────────────────── */}
              <section id="exact-matches" className="mb-4 scroll-mt-20">
                <h2 className="mb-2 text-base font-semibold">⭐ Top Exact Matches</h2>
                <ResponsiveNumerologyPlayers players={exact} kind="exact" />
              </section>
              <section id="root-matches" className="mb-4 scroll-mt-20">
                <h2 className="mb-2 text-base font-semibold">Top Reduced-Root Matches</h2>
                <ResponsiveNumerologyPlayers players={root} kind="root" />
              </section>

              {/* ── Methodology ─────────────────────────────────────────────── */}
              <section id="methodology" className={`${panel} mb-12 scroll-mt-20 p-3`}>
                <h2 className="text-sm font-semibold">Methodology</h2>
                <p className="mt-1 text-xs text-[#cbc3d7]">Numerology determines every score and ranking. Model Rating is supplemental context only.</p>
              </section>
            </>}
          </main>
        </div>

        {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
        <nav className="fixed bottom-0 z-40 flex w-full justify-around border-t border-[#2a304d] bg-[#191b24] p-2.5 lg:hidden">
          <a href="#overview" aria-label="Overview"><Home className="h-5 w-5" /></a>
          <a href="#explorer" aria-label="Explorer"><Search className="h-5 w-5" /></a>
          <a href="#exact-matches" aria-label="Exact matches"><Star className="h-5 w-5" /></a>
          <a href="#root-matches" aria-label="Root matches"><Calculator className="h-5 w-5" /></a>
        </nav>
      </div>
    </SiteShell>
  );
}
