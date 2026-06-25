from pathlib import Path

path = Path("src/pages/MlbGameDetail.tsx")
text = path.read_text()

old = '''      <div className="grid grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px] items-center gap-2 border-b border-slate-200 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <div>Player</div>
        <div>Matchup</div>
        <div className="text-right">Score</div>
      </div>

      <div>
        {rows.map((row, index) => (
          <Link
            key={row.key}
            to={to}
            className={cn(
              "group grid grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px] items-center gap-2 border-b border-slate-100 px-4 py-2 transition last:border-b-0",
              index % 2 === 1 && "bg-slate-50/50",
              themeClasses.hover,
            )}
          >'''

new = '''      <div
        className={cn(
          "grid items-center gap-2 border-b border-slate-200 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500",
          theme === "hr"
            ? "grid-cols-[minmax(0,1fr)_minmax(108px,0.78fr)_58px]"
            : "grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px]",
        )}
      >
        <div>Player</div>
        <div>Matchup</div>
        <div className="text-right">Score</div>
      </div>

      <div>
        {rows.map((row, index) => (
          <Link
            key={row.key}
            to={to}
            className={cn(
              "group grid items-center gap-2 border-b border-slate-100 px-4 transition last:border-b-0",
              theme === "hr"
                ? "grid-cols-[minmax(0,1fr)_minmax(108px,0.78fr)_58px] py-2.5"
                : "grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px] py-2",
              index % 2 === 1 && "bg-slate-50/50",
              themeClasses.hover,
            )}
          >'''

if old not in text:
    raise SystemExit("Could not locate PropPreviewCard grid markup")
text = text.replace(old, new, 1)

old_matchup = '''            <div className="min-w-0 text-[11px] font-medium text-slate-500">
              <div className="truncate">vs {row.opponent}</div>
            </div>'''

new_matchup = '''            <div className="min-w-0 text-[11px] font-medium text-slate-500">
              <div
                className={cn(
                  theme === "hr"
                    ? "whitespace-normal break-words leading-[1.25]"
                    : "truncate",
                )}
                title={`vs ${row.opponent}`}
              >
                vs {row.opponent}
              </div>
            </div>'''

if old_matchup not in text:
    raise SystemExit("Could not locate PropPreviewCard matchup cell")
text = text.replace(old_matchup, new_matchup, 1)

path.write_text(text)
print("Updated HR prop preview to show full pitcher names.")
