import SiteShell from "@/components/layout/SiteShell";
import PgaResearchDashboard from "@/components/pga/PgaResearchDashboard";
import { usePgaTournamentPlayers } from "@/hooks/usePgaTournamentPlayers";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getFeaturedPgaHubContext } from "@/lib/pga/tournaments";
import { buildPgaHubBoardContext } from "@/lib/pga/tournamentUi";

export default function PgaHub() {
  const featured = getFeaturedPgaHubContext();
  const tournament = featured.featuredPgaBoard;
  const boardContext = buildPgaHubBoardContext(tournament, featured.scheduleEntry);
  const { players, status, errorMessage } = usePgaTournamentPlayers(tournament);

  usePageSeo({
    title: `PGA Rankings Hub | ${tournament.shortName} ${tournament.season} Board`,
    description: `This week's PGA board with live model rankings, percentile heatmap research, and direct paths to the full model room and ${tournament.shortName} picks page.`,
    path: featured.hubPath,
  });

  return (
    <SiteShell>
      <main className="site-page pb-20 pt-6 sm:pt-10">
        <div className="site-container">
          <PgaResearchDashboard
            tournament={tournament}
            boardContext={boardContext}
            currentFieldPlayers={players}
            currentFieldStatus={status}
            currentFieldErrorMessage={errorMessage}
            modelPath={featured.modelPath}
            picksPath={featured.picksPath}
          />
        </div>
      </main>
    </SiteShell>
  );
}
