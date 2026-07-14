import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MlbMobileHubEnhancements from "@/components/mlb/MlbMobileHubEnhancements";
import NflPlatformLayout from "@/components/nfl/NflPlatformLayout";
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
import MlbLayout from "@/components/mlb/MlbLayout";
import MlbGameDetail from "./pages/MlbGameDetail";
import MlbHrProps from "./pages/MlbHrProps";
import MlbSinCity from "./pages/MlbSinCity";
import MlbPropsHub from "./pages/MlbPropsHub";
import MlbStrikeoutProps from "./pages/MlbStrikeoutPropsWithDebug";
import MlbBatterVsPitcher from "./pages/MlbBatterVsPitcher";
import MLBPercentileDemo from "./pages/MLBPercentileDemo";
import MlbNumerologyPage from "./pages/MlbNumerologyPage";
import MlbNumerologyXExport from "./pages/MlbNumerologyXExport";
import MlbHrPropsXExport from "./pages/MlbHrPropsXExport";
import MlbStrikeoutPropsXExport from "./pages/MlbStrikeoutPropsXExport";
import MlbPowerRankings from "./pages/MlbPowerRankings";
import NFL from "./pages/NFL";
import NFLStandings from "./pages/NFLStandings";
import NFLSchedule from "./pages/NFLSchedule";
import NFLMatchups from "./pages/NFLMatchups";
import NFLMatchupDetail from "./pages/NFLMatchupDetail";
import NFLSuperBowlOdds from "./pages/NFLSuperBowlOdds";
import NFLGuide2026 from "./pages/NFLGuide2026";
import NFLRegression2026 from "./pages/NFLRegression2026";
import NFLTeamGuide2026 from "./pages/NFLTeamGuide2026";
import NFLCoachOfYear2026 from "./pages/NFLCoachOfYear2026";
import ComingSoon from "./pages/ComingSoon";
import WorldCup2026 from "./pages/WorldCup2026";
import WorldCupAnalyzer from "./pages/WorldCupAnalyzer";
import PublicBetting from "./pages/PublicBetting";
import NotFound from "./pages/NotFound";
import PGA from "./pages/PGA";
import PgaHub from "./pages/PgaHub";
import PgaHistoryModel from "./pages/PgaHistoryModelWithArticles";
import PgaCustom from "./pages/PgaCustom";
import PgaDfsUpload from "./pages/PgaDfsUpload";
import PgaOpenChampionshipBestBets from "./pages/PgaOpenChampionshipBestBets";
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
const NflV03Review = lazy(() => import("./pages/NflV03Review"));

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
        <MlbMobileHubEnhancements />
        <ErrorBoundary section="Page">
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
          <Route path="/nfl" element={<NflPlatformLayout />}>
            <Route index element={<NFL />} />
            <Route path="standings" element={<NFLStandings />} />
            <Route path="schedule" element={<NFLSchedule />} />
            <Route path="matchups" element={<NFLMatchups />} />
            <Route path="matchups/:gameSlug" element={<NFLMatchupDetail />} />
            <Route path="super-bowl" element={<NFLSuperBowlOdds />} />
            <Route path="coach-of-year" element={<NFLCoachOfYear2026 />} />
            <Route path="guide" element={<NFLGuide2026 />} />
            <Route path="guide/regression" element={<NFLRegression2026 />} />
            <Route path="guide/team/:teamSlug" element={<NFLTeamGuide2026 />} />
            <Route path="2026-guide" element={<Navigate to="/nfl/guide" replace />} />
          </Route>
          <Route
            path="/internal/jkb-nfl-v03-review-7f3c9a"
            element={
              <Suspense fallback={<div className="min-h-screen bg-slate-950 p-6 text-sm text-slate-300">Loading internal NFL review…</div>}>
                <NflV03Review />
              </Suspense>
            }
          />
          <Route path="/nba" element={<ComingSoon sport="NBA" />} />
          <Route path="/world-cup" element={<WorldCup2026 />} />
          <Route path="/world-cup/analyzer" element={<WorldCupAnalyzer />} />
          <Route path="/odds-tracker" element={<PublicBetting />} />
          <Route path="/public-betting" element={<Navigate to="/odds-tracker" replace />} />
          {/* Unlinked, dedicated routes for the X-post screenshot generators
              (scripts/post-mlb-*-to-x.mjs) -- not part of site navigation.
              Deliberately kept OUTSIDE MlbLayout: the automated screenshot
              capture needs a bare page with no header/sidebar chrome. The HR
              and K routes render ONLY the rows in the immutable per-attempt
              selection artifact passed via `?d=` (base64), so the screenshot
              can never show players the readiness gate did not confirm. */}
          <Route path="/mlb/numerology/x-export" element={<MlbNumerologyXExport />} />
          <Route path="/mlb/hr-props/x-export" element={<MlbHrPropsXExport />} />
          <Route path="/mlb/strikeout-props/x-export" element={<MlbStrikeoutPropsXExport />} />
          <Route path="/mlb" element={<MlbLayout />}>
            <Route index element={<MlbGameDetail />} />
            <Route path="props" element={<MlbPropsHub />} />
            <Route path="hr-props" element={<MlbHrProps />} />
            <Route path="sin-city" element={<MlbSinCity />} />
            <Route path="strikeout-props" element={<MlbStrikeoutProps />} />
            <Route path="batter-vs-pitcher" element={<MlbBatterVsPitcher />} />
            <Route path="numerology" element={<MlbNumerologyPage />} />
            <Route path="power-rankings" element={<MlbPowerRankings />} />
          </Route>
          <Route path="/mlb-demo" element={<MLBPercentileDemo />} />
          <Route path="/pga" element={<PgaHistoryModel />} />
          <Route path="/pga/legacy" element={<PgaHub />} />
          <Route path="/pga/custom" element={<PgaCustom />} />
          <Route path="/pga/dfs" element={<PgaDfsUpload />} />
          <Route path="/pga/best-bets" element={<PgaOpenChampionshipBestBets />} />
          <Route path="/pga/the-open-2026-model-value-bets" element={<PgaOpenChampionshipBestBets />} />
          <Route path="/pga/model" element={<PGAModel />} />
          <Route path="/pga/model/table" element={<PGAModelTableView />} />
          <Route path="/pga/:tournamentSlug" element={<PGA />} />
          <Route path={getTournamentModelPath(FEATURED_PGA_TOURNAMENT)} element={<PGAModel />} />
          <Route path={getTournamentModelTablePath(FEATURED_PGA_TOURNAMENT)} element={<PGAModelTableView />} />
          <Route path="/pga/:tournamentSlug/model" element={<PGAModel />} />
          <Route path="/pga/:tournamentSlug/model/table" element={<PGAModelTableView />} />
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
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;