from pathlib import Path

path = Path("src/pages/MlbGameDetail.tsx")
text = path.read_text()

old_header = '''      <div
        className={cn(
          "grid items-center gap-3 border-b border-slate-300 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600 2xl:px-5",
          theme === "hr"
            ? "grid-cols-[minmax(0,1fr)_minmax(122px,0.88fr)_58px] 2xl:grid-cols-[minmax(0,1fr)_minmax(150px,1fr)_64px]"
            : "grid-cols-[minmax(0,1fr)_minmax(84px,0.6fr)_58px] 2xl:grid-cols-[minmax(0,1fr)_minmax(104px,0.7fr)_64px]",
        )}
      >
        <div>Player</div>
        <div>Matchup</div>
        <div className="text-right">Score</div>
      </div>'''

new_header = '''      <div
        className={cn(
          "grid items-center gap-x-1.5 border-b border-slate-300 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600 2xl:gap-x-2 2xl:px-4 2xl:text-[11px]",
          theme === "hr"
            ? "grid-cols-[20px_minmax(90px,1fr)_minmax(116px,1.08fr)_56px] 2xl:grid-cols-[20px_minmax(120px,1fr)_minmax(150px,1.12fr)_64px]"
            : "grid-cols-[20px_minmax(116px,1fr)_minmax(56px,0.45fr)_56px] 2xl:grid-cols-[20px_minmax(140px,1fr)_minmax(72px,0.48fr)_64px]",
        )}
      >
        <div className="col-span-2">Player</div>
        <div>Matchup</div>
        <div className="text-right">Score</div>
      </div>'''

if old_header not in text:
    raise SystemExit("Could not locate prop preview header")
text = text.replace(old_header, new_header, 1)

old_rows = '''            className={cn(
              "group grid items-center gap-3 border-b border-slate-200/80 px-4 transition last:border-b-0 2xl:px-5",
              theme === "hr"
                ? "grid-cols-[minmax(0,1fr)_minmax(122px,0.88fr)_58px] py-2.5 2xl:grid-cols-[minmax(0,1fr)_minmax(150px,1fr)_64px] 2xl:py-3"
                : "grid-cols-[minmax(0,1fr)_minmax(84px,0.6fr)_58px] py-2.5 2xl:grid-cols-[minmax(0,1fr)_minmax(104px,0.7fr)_64px]",
              index % 2 === 1 && "bg-slate-50/50",
              themeClasses.hover,
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <TeamAbbrBadge team={row.team} />
              <div className="min-w-0">
                <div className="whitespace-nowrap text-[13px] font-bold leading-5 text-slate-950 2xl:text-sm">{row.player}</div>
                {row.position && <div className="text-[10px] font-semibold uppercase text-slate-400">{row.position}</div>}
              </div>
            </div>
            <div className="min-w-0 text-xs font-medium text-slate-600 2xl:text-[13px]">
              <div
                className={cn(
                  theme === "hr"
                    ? "whitespace-normal break-words leading-[1.25] 2xl:whitespace-nowrap"
                    : "truncate",
                )}
                title={`vs ${row.opponent}`}
              >
                vs {row.opponent}
              </div>
            </div>'''

new_rows = '''            className={cn(
              "group grid items-center gap-x-1.5 border-b border-slate-200/80 px-3 transition last:border-b-0 2xl:gap-x-2 2xl:px-4",
              theme === "hr"
                ? "grid-cols-[20px_minmax(90px,1fr)_minmax(116px,1.08fr)_56px] py-2.5 2xl:grid-cols-[20px_minmax(120px,1fr)_minmax(150px,1.12fr)_64px] 2xl:py-3"
                : "grid-cols-[20px_minmax(116px,1fr)_minmax(56px,0.45fr)_56px] py-2.5 2xl:grid-cols-[20px_minmax(140px,1fr)_minmax(72px,0.48fr)_64px]",
              index % 2 === 1 && "bg-slate-50/50",
              themeClasses.hover,
            )}
          >
            <div className="flex items-center justify-center">
              <TeamAbbrBadge team={row.team} />
            </div>
            <div className="min-w-0 overflow-hidden">
              <div
                className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold leading-5 text-slate-950 2xl:text-[13px]"
                title={row.player}
              >
                {row.player}
              </div>
              {row.position && <div className="text-[9px] font-semibold uppercase text-slate-400">{row.position}</div>}
            </div>
            <div className="min-w-0 overflow-hidden text-[11px] font-medium text-slate-600 2xl:text-xs">
              <div
                className="overflow-hidden text-ellipsis whitespace-nowrap"
                title={`vs ${row.opponent}`}
              >
                vs {row.opponent}
              </div>
            </div>'''

if old_rows not in text:
    raise SystemExit("Could not locate prop preview rows")
text = text.replace(old_rows, new_rows, 1)

old_analyzer_header = '''      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#031635] 2xl:text-2xl">Game Matchup Analyzer</h2>
          <p className="text-xs text-slate-500 2xl:text-sm">Daily predictive analysis and situational edges from the live slate.</p>
        </div>
        <span className="text-xs font-semibold text-slate-400">{games.length} games</span>
      </div>'''

new_analyzer_header = '''      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="shrink-0 text-xl font-bold tracking-tight text-[#031635] 2xl:text-2xl">Game Matchup Analyzer</h2>
            <label className="relative min-w-0 sm:w-[220px] 2xl:w-[260px]">
              <span className="sr-only">Jump to a game</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  const gamePk = event.currentTarget.value;
                  if (!gamePk) return;
                  document.getElementById(`mlb-game-${gamePk}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  event.currentTarget.value = "";
                }}
                className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Jump to game…</option>
                {games.map((game) => (
                  <option key={game.gamePk} value={game.gamePk}>
                    {game.away.abbreviation} @ {game.home.abbreviation} — {formatGameTime(game.gameDate)}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">▼</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500 2xl:text-sm">Daily predictive analysis and situational edges from the live slate.</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate-400">{games.length} games</span>
      </div>'''

if old_analyzer_header not in text:
    raise SystemExit("Could not locate analyzer header")
text = text.replace(old_analyzer_header, new_analyzer_header, 1)

old_button = '''            <button
              key={game.gamePk}
              type="button"
              onClick={() => onOpenGame(game.gamePk)}
              className={cn(
                "flex w-full flex-col rounded-xl border text-left transition-all hover:shadow-md",'''

new_button = '''            <button
              id={`mlb-game-${game.gamePk}`}
              key={game.gamePk}
              type="button"
              onClick={() => onOpenGame(game.gamePk)}
              className={cn(
                "scroll-mt-28 flex w-full flex-col rounded-xl border text-left transition-all hover:shadow-md",'''

if old_button not in text:
    raise SystemExit("Could not locate game card button")
text = text.replace(old_button, new_button, 1)

path.write_text(text)
print("Applied prop-grid overlap fix and game jump menu.")
