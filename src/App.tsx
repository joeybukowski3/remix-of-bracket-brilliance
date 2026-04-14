import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import MLBPercentileDemo from "./pages/MLBPercentileDemo";
import NotFound from "./pages/NotFound";
import PGA from "./pages/PGA";

const queryClient = new QueryClient();
const routerBase = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={routerBase}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ncaa" element={<Rankings />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/schedule/:gameId" element={<GameDetail />} />
          <Route path="/team/:teamId" element={<TeamPage />} />
          <Route path="/matchup" element={<Matchup />} />
          <Route path="/matchup/:matchupId" element={<BracketMatchupPage />} />
          <Route path="/betting-edge" element={<BettingEdge />} />
          <Route path="/bracket" element={<Bracket />} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/mlb-demo" element={<MLBPercentileDemo />} />
          <Route path="/pga" element={<PGA />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
