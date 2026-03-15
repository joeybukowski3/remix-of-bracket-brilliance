import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  buildCanonicalTeams,
  findTeamBySlug,
  formatStat,
  type TeamStats,
} from "@/data/ncaaTeams";

export default function TeamPage() {
  const { teamId = "" } = useParams();
  const { data: liveTeams = [] } = useLiveTeams();
  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);
  const team = findTeamBySlug(teamId, teamPool);

  usePageSeo({
    title: team ? `${team.name} Team Stats` : "NCAA Team Page",
    description: team
      ? `View ${team.name} team stats, home-away splits, and advanced NCAA basketball metrics.`
      : "View NCAA basketball team stats and advanced metrics.",
    path: team ? `/team/${team.slug}` : "/team",
    noindex: !team,
  });

  const statRows: { label: string; key: keyof TeamStats }[] = [
    { label: "PPG", key: "ppg" },
    { label: "Opp PPG", key: "oppPpg" },
    { label: "FG%", key: "fgPct" },
    { label: "3PT%", key: "threePct" },
    { label: "FT%", key: "ftPct" },
    { label: "RPG", key: "rpg" },
    { label: "APG", key: "apg" },
    { label: "SPG", key: "spg" },
    { label: "BPG", key: "bpg" },
    { label: "TPG", key: "tpg" },
    { label: "SOS", key: "sos" },
    { label: "Adj OE", key: "adjOE" },
    { label: "Adj DE", key: "adjDE" },
    { label: "Tempo", key: "tempo" },
    { label: "Luck", key: "luck" },
  ];

  if (!team) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-lg text-muted-foreground">Team page not found.</p>
          <Link to="/" className="text-primary hover:underline text-sm mt-4 inline-block">
            Back to Rankings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Rankings
        </Link>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-4 flex-wrap">
            <img src={team.logo} alt={team.name} className="w-20 h-20 object-contain" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-bold text-foreground">{team.name}</h1>
                {team.seed && (
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold bg-primary/20 text-primary">
                    {team.seed}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground mt-1">{team.conference} · {team.record || "Record unavailable"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {team.statsCoverage === "full" ? "Full advanced stat coverage" : team.statsCoverage === "partial" ? "Partial advanced stat coverage" : "Metadata only"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Advanced Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {statRows.map((stat) => (
              <div key={stat.key} className="flex items-center justify-between py-2 border-b border-border/50 last:border-b-0">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">{formatStat(team.stats[stat.key])}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">Home / Away Splits</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="font-semibold text-muted-foreground uppercase">Stat</div>
            <div className="font-semibold text-muted-foreground uppercase text-center">Home</div>
            <div className="font-semibold text-muted-foreground uppercase text-center">Away</div>
            {statRows.map((stat) => (
              <div key={stat.key} className="contents">
                <div className="py-2 border-b border-border/50 text-muted-foreground">{stat.label}</div>
                <div className="py-2 border-b border-border/50 text-center tabular-nums">{formatStat(team.homeStats[stat.key])}</div>
                <div className="py-2 border-b border-border/50 text-center tabular-nums">{formatStat(team.awayStats[stat.key])}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
