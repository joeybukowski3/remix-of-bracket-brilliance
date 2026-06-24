import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home";
import Rankings from "./pages/Rankings";
import Schedule from "./pages/Schedule";
import GameDetail from "./pages/GameDetail";
import Matchup from "./pages/Matchup";
import BracketMatchupPage from "./pages/BracketMatchupPage";
import Bracket from "./pages/Bracket";
import BettingEdge from "./pages/BettingEdge";
import Donate from "./pages/Donate";
import TeamPage from "./pages/TeamPage";
import MlbGameDetail from "./pages/MlbGameDetail";
import MlbHrProps from "./pages/MlbHrProps";
import MlbPropsHub from "./pages/MlbPropsHub";
import MlbStrikeoutProps from "./pages/MlbStrikeoutProps";
import MlbBatterVsPitcher from "./pages/MlbBatterVsPitcher";
import MLBPercentileDemo from "./pages/MLBPercentileDemo";
import NFL from "./pages/NFL";
import NFLStandings from "./pages/NFLStandings";
import NFLSuperBowlOdds from "./pages/NFLSuperBowlOdds";
import NFLGuide2026 from "./pages/NFLGuide2026";
import NFLRegression2026 from "./pages/NFLRegression2026";
import NFLTeamGuide2026 from "./pages/NFLTeamGuide2026";
import NFLCoachOfYear2026 from "./pages/NFLCoachOfYear2026";
import ComingSoon from "./pages/ComingSoon";
import WorldCup2026 from "./pages/WorldCup2026";
import PublicBetting from "./pages/PublicBetting";
import NotFound from "./pages/NotFound";
import PGA from "./pages/PGA";
import PgaHub from "./pages/PgaHub";
import PgaHistoryModel from "./pages/PgaHistoryModel";
import PgaCustom from "./pages/PgaCustom";
import PgaDfsUpload from "./pages/PgaDfsUpload";
import PgaBestBets from "./pages/PgaBestBets";
import PGAModel from "./pages/PGAModel";
import PGAModelTableView from "./pages/PGAModelTableView";
import PGATop40Picks from "./pages/PGATop40Picks";
import { FEATURED_PGA_TOURNAMENT, PGA_TOURNAMENTS } from "@/lib/pga/tournaments";
import { getTournamentModelPath, getTournamentModelTablePath, getTournamentPicksPath } from "@/lib/pga/tournamentConfig";
import {
  NCAA_BASE_PATH,
  NCAA_BETTING_EDGE_PATH,
  NCAA_BRACKET_PATH,
  NCAA_MATCHUP_PATH,
  NCAA_SCHEDULE_PATH,
  getNcaaMatchupDetailPath,
  getNcaaScheduleGamePath,
} from "@/lib/routes";

const queryClient = new QueryClient();
const routerBase = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL;

function LegacyScheduleRedirect() {
  const { gameId = "" } = useParams();
  return <Navigate to={getNcaaScheduleGamePath(gameId)} replace />;
}

function LegacyMatchupRedirect() {
  const { matchupId = "" } = useParams();
  return <Navigate to={getNcaaMatchupDetailPath(matchupId)} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={routerBase}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path={NCAA_BASE_PATH} element={<Rankings />} />
          <Route path="/schedule" element={<Navigate to={NCAA_SCHEDULE_PATH} replace />} />
          <Route path="/schedule/:gameId" element={<LegacyScheduleRedirect />} />
          <Route path={NCAA_SCHEDULE_PATH} element={<Schedule />} />
          <Route path={`${NCAA_SCHEDULE_PATH}/:gameId`} element={<GameDetail />} />
          <Route path="/team/:teamId" element={<TeamPage />} />
          <Route path="/matchup" element={<Navigate to={NCAA_MATCHUP_PATH} replace />} />
          <Route path="/matchup/:matchupId" element={<LegacyMatchupRedirect />} />
          <Route path={NCAA_MATCHUP_PATH} element={<Matchup />} />
          <Route path={`${NCAA_MATCHUP_PATH}/:matchupId`} element={<BracketMatchupPage />} />
          <Route path="/betting-edge" element={<Navigate to={NCAA_BETTING_EDGE_PATH} replace />} />
          <Route path={NCAA_BETTING_EDGE_PATH} element={<BettingEdge />} />
          <Route path="/bracket" element={<Navigate to={NCAA_BRACKET_PATH} replace />} />
          <Route path={NCAA_BRACKET_PATH} element={<Bracket />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/nfl" element={<NFL />} />
          <Route path="/nfl/standings" element={<NFLStandings />} />
          <Route path="/nfl/super-bowl" element={<NFLSuperBowlOdds />} />
          <Route path="/nfl/coach-of-year" element={<NFLCoachOfYear2026 />} />
          <Route path="/nfl/guide" element={<NFLGuide2026 />} />
          <Route path="/nfl/guide/regression" element={<NFLRegression2026 />} />
          <Route path="/nfl/guide/team/:teamSlug" element={<NFLTeamGuide2026 />} />
          <Route path="/nfl/2026-guide" element={<Navigate to="/nfl/guide" replace />} />
          <Route path="/nba" element={<ComingSoon sport="NBA" />} />
          <Route path="/world-cup" element={<WorldCup2026 />} />
          <Route path="/odds-tracker" element={<PublicBetting />} />
          <Route path="/public-betting" element={<Navigate to="/odds-tracker" replace />} />
          <Route path="/mlb" element={<MlbGameDetail />} />
          <Route path="/mlb/props" element={<MlbPropsHub />} />
          <Route path="/mlb/hr-props" element={<MlbHrProps />} />
          <Route path="/mlb/strikeout-props" element={<MlbStrikeoutProps />} />
          <Route path="/mlb/batter-vs-pitcher" element={<MlbBatterVsPitcher />} />
          <Route path="/mlb-demo" element={<MLBPercentileDemo />} />
          <Route path="/pga" element={<PgaHistoryModel />} />
          <Route path="/pga/legacy" element={<PgaHub />} />
          <Route path="/pga/custom" element={<PgaCustom />} />
          <Route path="/pga/dfs" element={<PgaDfsUpload />} />
          <Route path="/pga/best-bets" element={<PgaBestBets />} />
          <Route path="/pga/model" element={<PGAModel />} />
          <Route path="/pga/model/table" element={<PGAModelTableView />} />
          <Route path={getTournamentModelPath(FEATURED_PGA_TOURNAMENT)} element={<PGAModel />} />
          <Route path={getTournamentModelTablePath(FEATURED_PGA_TOURNAMENT)} element={<PGAModelTableView />} />
          <Route path="/pga/:tournamentSlug/model" element={<PGAModel />} />
          <Route path="/pga/:tournamentSlug/model/table" element={<PGAModelTableView />} />
          <Route path="/pga/:tournamentSlug" element={<PGA />} />
          {PGA_TOURNAMENTS.map((tournament) => (
            <Route
              key={`${tournament.slug}-legacy-alias`}
              path={`/${tournament.slug}`}
              element={<Navigate to={getTournamentPicksPath(tournament)} replace />}
            />
          ))}
          <Route path="/pga/top-40-golf-picks" element={<PGATop40Picks />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
