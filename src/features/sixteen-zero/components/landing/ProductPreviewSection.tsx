const AVAILABLE_PLAYERS = [
  { name: "Ja'Marr Chase", pos: "WR", proj: "18.4" },
  { name: "Bijan Robinson", pos: "RB", proj: "17.1" },
  { name: "Brock Bowers", pos: "TE", proj: "13.8" },
];

const ROSTER_PREVIEW = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"];

const RECENT_PICKS = [
  "Rd 2, Pk 19 — Saquon Barkley, RB",
  "Rd 3, Pk 30 — Puka Nacua, WR",
];

export function ProductPreviewSection() {
  return (
    <section className="border-y border-white/10 bg-slate-950/60">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Inside the Draft Room
          </p>
          <span className="rounded-full border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Preview
          </span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
              Available Players
            </p>
            <ul className="mt-3 space-y-2">
              {AVAILABLE_PLAYERS.map((player) => (
                <li
                  key={player.name}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-white">{player.name}</span>
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[11px] font-bold text-cyan-300">
                      {player.pos}
                    </span>
                    {player.proj}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
              Your Roster
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ROSTER_PREVIEW.map((position, index) => (
                <span
                  key={`${position}-${index}`}
                  className="rounded-md border border-cyan-300/20 bg-cyan-400/5 px-2 py-1 text-[11px] font-bold text-cyan-200"
                >
                  {position}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
              Recent Selections
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
              {RECENT_PICKS.map((pick) => (
                <li key={pick}>{pick}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                Weekly Matchup
              </p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="font-black text-white">Your Team</span>
                <span className="font-mono font-black text-cyan-300">128.9</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm text-slate-400">
                <span>Opponent</span>
                <span className="font-mono">104.2</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/5 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                Final Season Result
              </p>
              <p className="mt-1 text-3xl font-black tracking-tight text-amber-300">16-0</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
