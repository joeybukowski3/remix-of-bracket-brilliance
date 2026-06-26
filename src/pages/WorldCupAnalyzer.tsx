/**
 * WorldCupAnalyzer.tsx — standalone /world-cup/analyzer page
 * All logic lives in WorldCupAnalyzerInline.tsx
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import WorldCupAnalyzerInline from "./WorldCupAnalyzerInline";

export default function WorldCupAnalyzer() {
  usePageSeo({
    title: "World Cup 2026 Matchup Analyzer | JoeKnowsBall",
    description: "Compare any two World Cup 2026 teams. Pre-tournament ratings, group-stage xG, strength of schedule, and model win probabilities.",
    path: "/world-cup/analyzer",
  });

  const [teamAName, setTeamAName] = useState("Brazil");
  const [teamBName, setTeamBName] = useState("Spain");

  useEffect(() => {
    const url = new URL(window.location.href);
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");
    if (a) setTeamAName(a);
    if (b) setTeamBName(b);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("a", teamAName);
    url.searchParams.set("b", teamBName);
    window.history.replaceState({}, "", url.toString());
  }, [teamAName, teamBName]);

  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Link to="/world-cup" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-[#031635] transition">⚽ WC26</Link>
            <span className="text-slate-300">/</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Matchup Analyzer</span>
          </div>
          <h1 className="text-3xl font-black text-[#031635]">Matchup Analyzer</h1>
          <p className="mt-1 text-sm text-slate-500">Compare any two World Cup 2026 teams side-by-side.</p>
        </div>
        <WorldCupAnalyzerInline
          teamAName={teamAName}
          teamBName={teamBName}
          onSwap={() => { const t = teamAName; setTeamAName(teamBName); setTeamBName(t); }}
          onChangeA={setTeamAName}
          onChangeB={setTeamBName}
        />
      </div>
    </SiteShell>
  );
}
