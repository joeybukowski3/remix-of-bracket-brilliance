import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { IngestionStatusBar } from "@/components/walter/IngestionStatusBar";
import { GameSelector } from "@/components/walter/GameSelector";
import { GameDetailPanel } from "@/components/walter/GameDetailPanel";
import { useWalterSeasonIndex, useWalterWeek } from "@/hooks/useWalterResearch";

/**
 * Private, unlisted WalterFootball weekly research dashboard. Not linked
 * from any public nav/sidebar/footer -- entry is by direct URL only
 * (security-by-obscurity, not authentication; see AGENTS.md for the scope
 * this route was built under). noindex/nofollow is set manually here
 * (matching the /internal/jkb-nfl-v03-review-7f3c9a precedent) rather than
 * via the shared usePageSeo hook, to avoid touching that shared file.
 */
function useNoIndexMeta() {
  useEffect(() => {
    let robots = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    const previousContent = robots.content;
    robots.content = "noindex, nofollow";

    const previousTitle = document.title;
    document.title = "Walter Research | Joe Knows Ball";

    return () => {
      robots!.content = previousContent;
      document.title = previousTitle;
    };
  }, []);
}

export default function WalterResearch() {
  useNoIndexMeta();

  const [searchParams, setSearchParams] = useSearchParams();
  const { weeks, loading: weeksLoading } = useWalterSeasonIndex();

  const requestedWeek = searchParams.get("week");
  const week = requestedWeek ? Number(requestedWeek) : (weeks.length > 0 ? Math.max(...weeks) : null);

  const { data: artifact, loading: weekLoading, error: weekError } = useWalterWeek(week);

  const requestedGameId = searchParams.get("game");
  const selectedGame = useMemo(() => {
    if (!artifact) return null;
    if (requestedGameId) {
      const match = artifact.games.find((g) => g.gameId === requestedGameId || `${g.away.abbr}-${g.home.abbr}` === requestedGameId);
      if (match) return match;
    }
    return artifact.games[0] ?? null;
  }, [artifact, requestedGameId]);

  function selectWeek(nextWeek: number) {
    const next = new URLSearchParams(searchParams);
    next.set("week", String(nextWeek));
    next.delete("game");
    setSearchParams(next);
  }

  function selectGame(gameId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("game", gameId);
    setSearchParams(next);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">WalterFootball Weekly Research</h1>
          <p className="mt-1 text-sm text-slate-500">
            Private, unlisted research aid summarizing WalterFootball's public NFL picks analysis. Not a JoeKnowsBall feature -- see the source link on
            every game for the canonical writeup.
          </p>
        </header>

        {!weeksLoading && weeks.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {weeks.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => selectWeek(w)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                  w === week ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200" : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                }`}
              >
                Week {w}
              </button>
            ))}
          </div>
        )}

        {!weeksLoading && weeks.length === 0 && (
          <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
            No WalterFootball research has been captured yet. Once the scheduled capture job runs, weeks will appear here.
          </p>
        )}

        {weekLoading && <p className="text-sm text-slate-500">Loading week {week}...</p>}
        {weekError && <p className="text-sm text-red-400">Failed to load week {week}: {weekError}</p>}

        {artifact && (
          <div className="space-y-6">
            <IngestionStatusBar artifact={artifact} />

            {artifact.games.length === 0 ? (
              <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
                No games discovered yet for week {artifact.week}.
              </p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <div className="hidden lg:block">
                  <GameSelector games={artifact.games} selectedGameId={selectedGame?.gameId ?? null} onSelect={selectGame} />
                </div>

                <div className="lg:hidden">
                  <label htmlFor="walter-game-select" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Game
                  </label>
                  <select
                    id="walter-game-select"
                    className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                    value={selectedGame?.gameId ?? ""}
                    onChange={(e) => selectGame(e.target.value)}
                  >
                    {artifact.games.map((g) => (
                      <option key={g.gameId} value={g.gameId}>
                        {g.away.abbr ?? g.away.name} @ {g.home.abbr ?? g.home.name} ({g.kickoffEt ?? "TBD"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>{selectedGame && <GameDetailPanel game={selectedGame} />}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
