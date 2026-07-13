import { useParams } from "react-router-dom";
import PgaTournamentPicksPage from "@/components/pga/PgaTournamentPicksPage";
import NotFound from "@/pages/NotFound";
import OpenChampionship2026Article from "@/pages/OpenChampionship2026Article";
import { FEATURED_PGA_TOURNAMENT, getPgaTournamentBySlug } from "@/lib/pga/tournaments";

const OPEN_ARTICLE_SLUG = "the-open-2026-picks-best-bets-odds";

export default function PGA() {
  const { tournamentSlug } = useParams();

  if (tournamentSlug === OPEN_ARTICLE_SLUG) {
    return <OpenChampionship2026Article />;
  }

  const tournament = tournamentSlug ? getPgaTournamentBySlug(tournamentSlug) : FEATURED_PGA_TOURNAMENT;

  if (!tournament) {
    return <NotFound />;
  }

  return <PgaTournamentPicksPage tournament={tournament} />;
}
