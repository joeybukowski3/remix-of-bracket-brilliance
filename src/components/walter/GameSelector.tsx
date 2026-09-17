import { cn } from "@/lib/utils";
import type { WalterPublicGame } from "@/lib/walter/types";
import { latestAvailableCapture } from "@/lib/walter/types";

function windowLabel(window: string): string {
  const map: Record<string, string> = {
    early: "Sunday Early",
    late: "Sunday Late",
    thu: "Thursday Night",
    snf: "Sunday Night",
    mnf: "Monday Night",
    other: "Other",
  };
  return map[window] ?? window;
}

function gameLabel(game: WalterPublicGame): string {
  return `${game.away.abbr ?? game.away.name ?? "?"} @ ${game.home.abbr ?? game.home.name ?? "?"}`;
}

export function GameSelector({
  games,
  selectedGameId,
  onSelect,
}: {
  games: WalterPublicGame[];
  selectedGameId: string | null;
  onSelect: (gameId: string) => void;
}) {
  const grouped = games.reduce<Record<string, WalterPublicGame[]>>((acc, game) => {
    (acc[game.window] ??= []).push(game);
    return acc;
  }, {});

  return (
    <nav aria-label="Game selector" className="space-y-4">
      {Object.entries(grouped).map(([window, windowGames]) => (
        <div key={window}>
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{windowLabel(window)}</h3>
          <ul className="space-y-1">
            {windowGames.map((game) => {
              const isSelected = game.gameId === selectedGameId;
              const latest = latestAvailableCapture(game);
              const hasParseIssue = latest && game.captures[latest]?.parseStatus !== "ok";
              return (
                <li key={game.gameId}>
                  <button
                    type="button"
                    onClick={() => onSelect(game.gameId)}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900",
                    )}
                  >
                    <span className="font-medium">{gameLabel(game)}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {hasParseIssue && <span className="text-amber-400" title="Parse warnings on this capture">⚠</span>}
                      {game.kickoffEt ? game.kickoffEt.replace(/^[A-Za-z]+,\s*/, "") : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
