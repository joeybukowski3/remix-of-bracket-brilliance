import { useParams } from "react-router-dom";
import PgaTournamentPicksPage from "@/components/pga/PgaTournamentPicksPage";
import NotFound from "@/pages/NotFound";
import { FEATURED_PGA_TOURNAMENT, getPgaTournamentBySlug } from "@/lib/pga/tournaments";

export default function PGA() {
  const { tournamentSlug } = useParams();
  const tournament = tournamentSlug ? getPgaTournamentBySlug(tournamentSlug) : FEATURED_PGA_TOURNAMENT;

  if (!tournament) {
    return <NotFound />;
  }

  return <PgaTournamentPicksPage tournament={tournament} />;
}
