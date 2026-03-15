import { useState, useMemo } from "react";
import SiteNav from "@/components/SiteNav";
import { teams, DEFAULT_STAT_WEIGHTS, ELITE_8_PRESET_WEIGHTS, calculateTeamScore, type StatWeight, type Team } from "@/data/ncaaTeams";
import StatSliders from "@/components/StatSliders";
import { usePageSeo } from "@/hooks/usePageSeo";

// Build a 64-team bracket from our data, seeded
function buildBracketTeams(): Team[] {
  const sorted = [...teams].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
  return sorted.slice(0, 64);
}

// Standard bracket seed matchup order for 16 teams per region
const SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

interface BracketGame {
  id: string;
  teamA: Team | null;
  teamB: Team | null;
  winner: Team | null;
  round: number;
  region: string;
}

function createInitialBracket(bracketTeams: Team[]): BracketGame[] {
  const regions = ["East", "West", "South", "Midwest"];
  const games: BracketGame[] = [];
  const teamsPerRegion = 16;

  regions.forEach((region, ri) => {
    const regionTeams = bracketTeams.slice(ri * teamsPerRegion, (ri + 1) * teamsPerRegion);
    // Sort by seed for matchups
    const bySeed = [...regionTeams].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));

    // Round of 64
    SEED_MATCHUPS.forEach((seeds, gi) => {
      const teamA = bySeed.find((t) => t.seed === seeds[0]) || regionTeams[gi * 2] || null;
      const teamB = bySeed.find((t) => t.seed === seeds[1]) || regionTeams[gi * 2 + 1] || null;
      games.push({
        id: `${region}-R64-${gi}`,
        teamA,
        teamB,
        winner: null,
        round: 0,
        region,
      });
    });

    // Rounds 2-4 (32, sweet 16, elite 8)
    for (let round = 1; round <= 3; round++) {
      const gamesInRound = 8 / Math.pow(2, round);
      for (let gi = 0; gi < gamesInRound; gi++) {
        games.push({
          id: `${region}-R${round}-${gi}`,
          teamA: null,
          teamB: null,
          winner: null,
          round,
          region,
        });
      }
    }
  });

  // Final Four + Championship
  games.push({ id: "FF-0", teamA: null, teamB: null, winner: null, round: 4, region: "Final Four" });
  games.push({ id: "FF-1", teamA: null, teamB: null, winner: null, round: 4, region: "Final Four" });
  games.push({ id: "CHAMP", teamA: null, teamB: null, winner: null, round: 5, region: "Championship" });

  return games;
}

function BracketGameCard({
  game,
  onPickWinner,
  weights,
  compact,
}: {
  game: BracketGame;
  onPickWinner: (gameId: string, winner: Team) => void;
  weights: StatWeight[];
  compact?: boolean;
}) {
  const scoreA = game.teamA ? calculateTeamScore(game.teamA.stats, weights) : 0;
  const scoreB = game.teamB ? calculateTeamScore(game.teamB.stats, weights) : 0;

  return (
    <div className={`border border-border rounded-md bg-card overflow-hidden ${compact ? "text-xs" : "text-sm"}`}>
      {[game.teamA, game.teamB].map((team, i) => {
        const score = i === 0 ? scoreA : scoreB;
        const isWinner = game.winner?.id === team?.id;
        const canPick = game.teamA && game.teamB && !game.winner;

        return (
          <button
            key={i}
            disabled={!canPick}
            onClick={() => team && onPickWinner(game.id, team)}
            className={`w-full flex items-center justify-between px-2 py-1.5 transition-colors ${
              i === 0 ? "border-b border-border/50" : ""
            } ${isWinner ? "bg-primary/20" : "hover:bg-secondary/50"} ${
              !team ? "opacity-40" : ""
            } disabled:cursor-default`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {team && (
                <img src={team.logo} alt={team.abbreviation} className="w-4 h-4 object-contain shrink-0" loading="lazy" />
              )}
              {team?.seed && (
                <span className="text-[10px] font-bold text-muted-foreground w-4 text-right shrink-0">
                  {team.seed}
                </span>
              )}
              <span className={`font-medium truncate ${isWinner ? "text-primary" : "text-foreground"}`}>
                {team?.abbreviation || "TBD"}
              </span>
            </div>
            {team && game.teamA && game.teamB && (
              <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
                {score.toFixed(0)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function Bracket() {
  usePageSeo({
    title: "March Madness Bracket Picks",
    description: "Build March Madness bracket picks with NCAA team power scores, stat-weight presets, and round-by-round selection tools.",
    path: "/bracket",
  });

  const bracketTeams = useMemo(() => buildBracketTeams(), []);
  const [games, setGames] = useState<BracketGame[]>(() => createInitialBracket(bracketTeams));
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showSliders, setShowSliders] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("East");

  const handleWeightChange = (key: string, value: number) => {
    setWeights((prev) => prev.map((w) => (w.key === key ? { ...w, weight: value } : w)));
  };

  const pickWinner = (gameId: string, winner: Team) => {
    setGames((prev) => {
      const updated = [...prev];
      const gameIdx = updated.findIndex((g) => g.id === gameId);
      if (gameIdx === -1) return prev;

      updated[gameIdx] = { ...updated[gameIdx], winner };

      const game = updated[gameIdx];
      const { round, region } = game;

      // Find the game's index within its round/region
      const roundRegionGames = updated.filter(
        (g) => g.round === round && g.region === region
      );
      const posInRound = roundRegionGames.indexOf(updated[gameIdx]);
      const nextGameIdx = Math.floor(posInRound / 2);

      if (round < 3) {
        // Within region rounds
        const nextRoundGames = updated.filter(
          (g) => g.round === round + 1 && g.region === region
        );
        if (nextRoundGames[nextGameIdx]) {
          const ngi = updated.indexOf(nextRoundGames[nextGameIdx]);
          if (posInRound % 2 === 0) {
            updated[ngi] = { ...updated[ngi], teamA: winner };
          } else {
            updated[ngi] = { ...updated[ngi], teamB: winner };
          }
        }
      } else if (round === 3) {
        // Elite 8 → Final Four
        const regions = ["East", "West", "South", "Midwest"];
        const regionIdx = regions.indexOf(region);
        const ffGameIdx = Math.floor(regionIdx / 2);
        const ffGames = updated.filter((g) => g.round === 4);
        if (ffGames[ffGameIdx]) {
          const ngi = updated.indexOf(ffGames[ffGameIdx]);
          if (regionIdx % 2 === 0) {
            updated[ngi] = { ...updated[ngi], teamA: winner };
          } else {
            updated[ngi] = { ...updated[ngi], teamB: winner };
          }
        }
      } else if (round === 4) {
        // Final Four → Championship
        const champGame = updated.find((g) => g.round === 5);
        if (champGame) {
          const ngi = updated.indexOf(champGame);
          const ffGames = updated.filter((g) => g.round === 4);
          const ffPos = ffGames.indexOf(updated[gameIdx]);
          if (ffPos === 0) {
            updated[ngi] = { ...updated[ngi], teamA: winner };
          } else {
            updated[ngi] = { ...updated[ngi], teamB: winner };
          }
        }
      }

      return updated;
    });
  };

  const resetBracket = () => setGames(createInitialBracket(bracketTeams));

  const regions = ["East", "West", "South", "Midwest"];
  const regionGames = games.filter((g) => g.region === selectedRegion && g.round <= 3);
  const ffGames = games.filter((g) => g.round === 4);
  const champGame = games.find((g) => g.round === 5);
  const champion = champGame?.winner;

  const rounds = [
    { round: 0, label: "Round of 64" },
    { round: 1, label: "Round of 32" },
    { round: 2, label: "Sweet 16" },
    { round: 3, label: "Elite 8" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">March Madness Bracket</h1>
            <p className="text-muted-foreground mt-1">Pick winners round by round to complete your bracket</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSliders(!showSliders)}
              className="text-sm font-medium text-primary hover:underline"
            >
              {showSliders ? "Hide" : "Show"} Weight Controls
            </button>
            <button
              onClick={resetBracket}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Reset Bracket
            </button>
            <button
              onClick={() => setWeights(ELITE_8_PRESET_WEIGHTS)}
              className="text-sm font-semibold px-3 py-1 rounded-md bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
            >
              🏆 Elite 8 Preset
            </button>
          </div>
        </div>

        {showSliders && <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />}

        {champion && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center glow-accent">
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-1">National Champion</p>
            <h2 className="text-2xl font-bold text-foreground">{champion.name}</h2>
          </div>
        )}

        {/* Final Four + Championship */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-bold text-foreground mb-3">Final Four & Championship</h2>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {ffGames.map((g) => (
              <div key={g.id} className="w-44">
                <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1 text-center">Semifinal</p>
                <BracketGameCard game={g} onPickWinner={pickWinner} weights={weights} />
              </div>
            ))}
            {champGame && (
              <div className="w-44">
                <p className="text-[10px] font-medium text-primary uppercase mb-1 text-center">Championship</p>
                <BracketGameCard game={champGame} onPickWinner={pickWinner} weights={weights} />
              </div>
            )}
          </div>
        </div>

        {/* Region Tabs */}
        <div className="flex items-center gap-2">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRegion(r)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedRegion === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Region Bracket */}
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-[700px]">
            {rounds.map(({ round, label }) => {
              const roundGames = regionGames.filter((g) => g.round === round);
              return (
                <div key={round} className="flex-1 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {label}
                  </p>
                  <div className="space-y-2 flex flex-col justify-around h-full">
                    {roundGames.map((g) => (
                      <BracketGameCard
                        key={g.id}
                        game={g}
                        onPickWinner={pickWinner}
                        weights={weights}
                        compact
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
