import { Link, useNavigate } from "react-router-dom";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import SiteShell from "@/components/layout/SiteShell";
import { MLB_TEAMS } from "@/data/mlb-teams";

export default function MLB() {
  const navigate = useNavigate();

  return (
    <SiteShell>
      <div className="site-container flex flex-col gap-6 py-12">
        <div className="inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          MLB is live next
        </div>
        <div>
          <h1 className="page-title max-w-3xl text-foreground">MLB tools are the priority build.</h1>
          <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">
            Home run props, hits props, strikeout props, matchup analysis, and Statcast-powered recommendations are the
            next modules going live in Joe Knows Ball.
          </p>
        </div>
        <section className="rounded-[28px] border border-sky-900 bg-slate-950 px-5 py-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/85">MLB HR Prop Model</div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">Today&apos;s Best Bets →</h2>
              <p className="max-w-3xl text-sm text-slate-300">
                Daily home run prop rankings built from barrel rate, exit velocity, park factors, and pitcher home-run risk.
              </p>
            </div>
            <Link
              to="/mlb/hr-props"
              className="inline-flex w-full items-center justify-center rounded-full border border-sky-700 bg-sky-800 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700 lg:w-auto"
            >
              Open HR Prop Board
            </Link>
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Focus 1", "Home Run Props", "Batter power, park context, pitcher profile, and weather edge."],
            ["Focus 2", "Hits + Strikeouts", "Contact quality, lineup spot, leash, and swing-and-miss indicators."],
            ["Focus 3", "Workflow + UX", "Faster slate review, cleaner ranking views, and sharper bet surfacing."],
          ].map(([eyebrow, title, body]) => (
            <div key={title} className="surface-card-muted">
              <div className="eyebrow-label text-primary/80">{eyebrow}</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{title}</div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <section className="pt-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">MLB Teams</h2>
            <p className="text-xs text-muted-foreground">Logos are wired in and ready for Statcast + matchup tools.</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {MLB_TEAMS.map((team) => (
              <button
                key={team.id}
                type="button"
                className="group flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-3 py-3 transition hover:border-primary/30 hover:bg-secondary"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <div className="transition group-hover:scale-105">
                    <MlbTeamLogo team={team.short} size={32} />
                  </div>
                </div>
                <span className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground">{team.short}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Back to sports
          </button>
          <button
            type="button"
            onClick={() => navigate("/ncaa")}
            className="rounded-xl border border-border bg-card px-4 py-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
          >
            Open NCAA tools
          </button>
        </div>
      </div>
    </SiteShell>
  );
}
