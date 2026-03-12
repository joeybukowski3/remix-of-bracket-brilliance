import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Rankings from "./pages/Rankings";
import Schedule from "./pages/Schedule";
import GameDetail from "./pages/GameDetail";
import Matchup from "./pages/Matchup";
import Bracket from "./pages/Bracket";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename="/remix-of-bracket-brilliance">
        <Routes>
          <Route path="/" element={<Rankings />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/schedule/:gameId" element={<GameDetail />} />
          <Route path="/matchup" element={<Matchup />} />
          <Route path="/bracket" element={<Bracket />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
