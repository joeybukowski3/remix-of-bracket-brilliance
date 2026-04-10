import { useNavigate } from "react-router-dom";
import { MLB_TEAMS } from "@/data/mlb-teams";

export default function MLB() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#111] px-6 py-16 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="inline-flex w-fit items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-semibold text-orange-400">
          MLB is live next
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">MLB tools are the priority build.</h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-400">
            Home run props, hits props, strikeout props, matchup analysis, and Statcast-powered recommendations are the
            next modules going live in Ball Walker.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="text-sm font-semibold text-orange-400">Focus 1</div>
            <div className="mt-2 text-lg font-bold">Home Run Props</div>
            <p className="mt-2 text-sm text-zinc-400">Batter power, park context, pitcher profile, and weather edge.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="text-sm font-semibold text-orange-400">Focus 2</div>
            <div className="mt-2 text-lg font-bold">Hits + Strikeouts</div>
            <p className="mt-2 text-sm text-zinc-400">Contact quality, lineup spot, leash, and swing-and-miss indicators.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="text-sm font-semibold text-orange-400">Focus 3</div>
            <div className="mt-2 text-lg font-bold">Workflow + UX</div>
            <p className="mt-2 text-sm text-zinc-400">Faster slate review, cleaner ranking views, and sharper bet surfacing.</p>
          </div>
        </div>

        <section className="pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">MLB Teams</h2>
            <p className="text-xs text-zinc-400">
              Logos are wired in and ready for Statcast + matchup tools.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {MLB_TEAMS.map((team) => (
              <button
                key={team.id}
                type="button"
                className="group flex flex-col items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3 transition hover:border-orange-500/60 hover:bg-zinc-900"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 shadow-inner shadow-black/60">
                  <img
                    src={team.logo}
                    alt={team.name}
                    className="h-8 w-8 object-contain transition group-hover:scale-105"
                  />
                </div>
                <span className="text-[0.7rem] font-semibold tracking-wide text-zinc-300">
                  {team.short}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-black transition hover:bg-orange-400"
          >
            Back to sports
          </button>
          <button
            type="button"
            onClick={() => navigate("/ncaa")}
            className="rounded-lg border border-zinc-700 px-4 py-2 font-semibold text-zinc-200 transition hover:border-zinc-500"
          >
            Open NCAA tools
          </button>
        </div>
      </div>
    </div>
  );
}
