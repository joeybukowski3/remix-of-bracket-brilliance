import { useEffect, useState } from "react";
import { Calculator, Home, Search, Star } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import { calculateNumerologyScoreBreakdown, type PlayerIdentity } from "@/lib/numerology/mlbScoreAudit";
import { panel, type NumerologyCardPlayer } from "@/components/mlb/numerology/NumerologyAuditCard";
import { NumerologyExplorer } from "@/components/mlb/numerology/NumerologyExplorer";
import { ResponsiveNumerologyPlayers } from "@/components/mlb/numerology/ResponsiveNumerologyPlayers";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

type Extended = NumerologyDailyData & {
  exactNumberMatches?: NumerologyCardPlayer[];
  rootNumberMatches?: NumerologyCardPlayer[];
};

const desktopLink = "flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-[#cbc3d7] hover:bg-[#282a32]";
const mobileLink = "rounded-full border border-[#494454] bg-[#171925] px-3 py-2 text-xs font-semibold text-[#d8d1e3]";

export default function MlbNumerologyPageEnhanced() {
  usePageSeo({
    title: "MLB Numerology | Joe Knows Ball",
    description: "Daily numerical alignment across today’s MLB slate.",
    path: "/mlb/numerology",
  });

  const { data, loading, error, isStale } = useMLBNumerology();
  const [identities, setIdentities] = useState<Record<string, PlayerIdentity>>({});

  useEffect(() => {
    let active = true;
    fetch("/data/mlb/player-identity-cache.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .then((value) => {
        if (active && value && typeof value === "object" && !Array.isArray(value)) {
          setIdentities(value as Record<string, PlayerIdentity>);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const extended = data as Extended | null;
  const profile = data?.dailyProfile;

  const enrich = (player: NumerologyCardPlayer): NumerologyCardPlayer => {
    if (!profile || !data) return player;
    try {
      return {
        ...player,
        scoreBreakdown: calculateNumerologyScoreBreakdown(
          player,
          identities[`${player.playerName}|${player.team}`] ?? null,
          profile,
          data.date,
          data.scoringConfiguration?.weights,
        ),
      };
    } catch (reason) {
      console.error("[mlb-numerology] score breakdown failed", player.playerName, reason);
      return player;
    }
  };

  const exact = Array.isArray(extended?.exactNumberMatches)
    ? extended.exactNumberMatches.filter(Boolean).map(enrich)
    : [];
  const root = Array.isArray(extended?.rootNumberMatches)
    ? extended.rootNumberMatches.filter(Boolean).map(enrich)
    : [];

  return (
    <SiteShell>
      <div className="min-h-screen bg-[#0a0c14] text-[#e2e1ee]">
        <div className="flex">
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-[#494454] bg-[#1d1f28] p-4 lg:block">
            <h2 className="px-2 pt-6 font-serif text-3xl text-[#d0bcff]">MLB Numerology</h2>
            <p className="mb-10 px-2 text-sm text-[#cbc3d7]">The Enlightened Fan</p>
            <nav className="space-y-2">
              <a className={`${desktopLink} bg-[#a078ff] font-bold text-[#340080]`} href="#overview"><Home />Overview</a>
              <a className={desktopLink} href="#exact-matches"><Star />Exact Matches</a>
              <a className={desktopLink} href="#root-matches"><Calculator />Root Matches</a>
              <a className={desktopLink} href="#explorer"><Search />Explorer</a>
            </nav>
          </aside>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10">
            <header className="mb-5 border-b border-[#494454] pb-5 lg:mb-10 lg:pb-6">
              <h1 className="font-serif text-4xl font-bold sm:text-5xl">MLB Numerology</h1>
              <p className="mt-3 text-sm text-[#cbc3d7] sm:text-base">Daily numerical alignment across today’s MLB slate.</p>
              <p className="mt-2 font-mono text-sm">{data?.date ?? "—"} • {isStale ? "Stale data" : "Current slate"}</p>
            </header>

            <nav aria-label="Numerology page sections" className="mb-6 grid grid-cols-3 gap-2 lg:hidden">
              <a className={mobileLink} href="#overview">Overview</a>
              <a className={mobileLink} href="#exact-matches">Exact</a>
              <a className={mobileLink} href="#root-matches">Root</a>
              <a className={mobileLink} href="#explorer">Explorer</a>
              <a className={mobileLink} href="#methodology">Method</a>
              <a className={mobileLink} href="/mlb">MLB Home</a>
            </nav>

            {loading && <div className={`${panel} p-12 text-center`}>Loading…</div>}
            {error && <div className="rounded-xl bg-red-950/40 p-6">{error}</div>}

            {data && profile && (
              <>
                <section id="overview" className="mb-12 scroll-mt-24 grid gap-5 md:grid-cols-2 lg:mb-16">
                  <div className={`${panel} p-5 sm:p-6`}>
                    <p className="text-xs font-bold uppercase text-[#e9c349]">Core Frequencies</p>
                    <div className="mt-6 text-4xl font-bold text-[#d0bcff] sm:text-5xl">
                      {profile.universalDayCompound}/{profile.universalDayRoot} <span className="text-lg text-[#cbc3d7] sm:text-xl">Universal Day</span>
                    </div>
                    <div className="mt-8 rounded-lg bg-[#0c0e16] p-4">Primary Family: {(profile.primaryFamily ?? []).join(" · ")}</div>
                  </div>
                  <div className={`${panel} p-5 sm:p-6`}>
                    <p className="text-xs font-bold uppercase text-[#e9c349]">Energy Balancing</p>
                    <div className="mt-6 grid grid-cols-2 gap-5 text-sm sm:gap-6 sm:text-base">
                      <div>Secondary: {(profile.secondaryFamily ?? []).join("-")}</div>
                      <div>Countercurrent: {profile.countercurrent ?? "—"}</div>
                      <div>Complement: {profile.balancingComplement ?? "—"}</div>
                      <div>Repeated: {(profile.repeatedDigits ?? []).map((item) => item.digit).join(", ") || "—"}</div>
                    </div>
                  </div>
                </section>

                <section id="exact-matches" className="mb-12 scroll-mt-24 lg:mb-16">
                  <h2 className="mb-5 text-xl font-semibold">⭐ Exact Matches</h2>
                  <ResponsiveNumerologyPlayers players={exact} kind="exact" />
                </section>

                <section id="root-matches" className="mb-12 scroll-mt-24 lg:mb-16">
                  <h2 className="mb-5 text-xl font-semibold">Reduced-Root Matches</h2>
                  <ResponsiveNumerologyPlayers players={root} kind="root" />
                </section>

                <NumerologyExplorer exact={exact} root={root} />

                <section id="methodology" className={`${panel} mb-20 scroll-mt-24 p-6`}>
                  <h2 className="font-semibold">Methodology</h2>
                  <p className="mt-2 text-sm text-[#cbc3d7]">Numerology determines every score and ranking. Model Rating is supplemental context only.</p>
                </section>
              </>
            )}
          </main>
        </div>

        <nav className="fixed bottom-0 z-40 flex w-full justify-around border-t border-[#2a304d] bg-[#191b24] p-3 lg:hidden">
          <a href="#overview" aria-label="Overview"><Home /></a>
          <a href="#exact-matches" aria-label="Exact matches"><Star /></a>
          <a href="#root-matches" aria-label="Root matches"><Calculator /></a>
          <a href="#explorer" aria-label="Explorer"><Search /></a>
        </nav>
      </div>
    </SiteShell>
  );
}
