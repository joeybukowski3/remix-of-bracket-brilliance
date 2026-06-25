from pathlib import Path

path = Path("src/pages/MlbGameDetail.tsx")
text = path.read_text()

replacements = [
    (
        'className="mx-auto flex max-w-[1280px] gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:max-w-[1400px] 2xl:max-w-[1600px] 2xl:gap-6 3xl:max-w-[1800px] 3xl:px-10 4xl:max-w-[1900px] 4xl:px-12"',
        'className="mx-auto flex max-w-[1360px] gap-5 px-4 py-6 sm:px-5 lg:px-6 xl:max-w-[1560px] 2xl:max-w-[1800px] 2xl:gap-5 3xl:max-w-[1920px] 3xl:px-6 4xl:max-w-[2048px] 4xl:px-8"',
        "wide page container",
    ),
    (
        'className="grid gap-3 md:grid-cols-2"',
        'className="grid gap-4 md:grid-cols-2 3xl:gap-5"',
        "prop preview grid gap",
    ),
    (
        '<h3 className="text-base font-bold text-[#031635]">{title}</h3>',
        '<h3 className="text-[17px] font-bold text-[#031635] 2xl:text-lg">{title}</h3>',
        "prop card title size",
    ),
    (
        '"grid items-center gap-2 border-b border-slate-200 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500",\n          theme === "hr"\n            ? "grid-cols-[minmax(0,1fr)_minmax(108px,0.78fr)_58px]"\n            : "grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px]",',
        '"grid items-center gap-3 border-b border-slate-300 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600 2xl:px-5",\n          theme === "hr"\n            ? "grid-cols-[minmax(0,1fr)_minmax(122px,0.88fr)_58px] 2xl:grid-cols-[minmax(0,1fr)_minmax(150px,1fr)_64px]"\n            : "grid-cols-[minmax(0,1fr)_minmax(84px,0.6fr)_58px] 2xl:grid-cols-[minmax(0,1fr)_minmax(104px,0.7fr)_64px]",',
        "prop table header columns",
    ),
    (
        '"group grid items-center gap-2 border-b border-slate-100 px-4 transition last:border-b-0",\n              theme === "hr"\n                ? "grid-cols-[minmax(0,1fr)_minmax(108px,0.78fr)_58px] py-2.5"\n                : "grid-cols-[minmax(0,1fr)_minmax(76px,0.55fr)_58px] py-2",',
        '"group grid items-center gap-3 border-b border-slate-200/80 px-4 transition last:border-b-0 2xl:px-5",\n              theme === "hr"\n                ? "grid-cols-[minmax(0,1fr)_minmax(122px,0.88fr)_58px] py-2.5 2xl:grid-cols-[minmax(0,1fr)_minmax(150px,1fr)_64px] 2xl:py-3"\n                : "grid-cols-[minmax(0,1fr)_minmax(84px,0.6fr)_58px] py-2.5 2xl:grid-cols-[minmax(0,1fr)_minmax(104px,0.7fr)_64px]",',
        "prop table row columns",
    ),
    (
        '<div className="text-xs font-bold leading-5 text-slate-950">{row.player}</div>',
        '<div className="whitespace-nowrap text-[13px] font-bold leading-5 text-slate-950 2xl:text-sm">{row.player}</div>',
        "player name size",
    ),
    (
        '<div className="min-w-0 text-[11px] font-medium text-slate-500">',
        '<div className="min-w-0 text-xs font-medium text-slate-600 2xl:text-[13px]">',
        "matchup name size",
    ),
    (
        'theme === "hr"\n                    ? "whitespace-normal break-words leading-[1.25]"\n                    : "truncate",',
        'theme === "hr"\n                    ? "whitespace-normal break-words leading-[1.25] 2xl:whitespace-nowrap"\n                    : "truncate",',
        "large-screen one-line HR pitcher names",
    ),
    (
        '<h2 className="text-xl font-bold tracking-tight text-[#031635]">Game Matchup Analyzer</h2>',
        '<h2 className="text-xl font-bold tracking-tight text-[#031635] 2xl:text-2xl">Game Matchup Analyzer</h2>',
        "analyzer title size",
    ),
    (
        '<p className="text-xs text-slate-500">Daily predictive analysis and situational edges from the live slate.</p>',
        '<p className="text-xs text-slate-500 2xl:text-sm">Daily predictive analysis and situational edges from the live slate.</p>',
        "analyzer subtitle size",
    ),
]

for old, new, label in replacements:
    if old not in text:
        raise SystemExit(f"Could not locate {label}")
    text = text.replace(old, new, 1)

path.write_text(text)
print("Applied wide-screen MLB layout and larger prop-preview typography.")
