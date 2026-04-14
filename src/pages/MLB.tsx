import { useNavigate } from "react-router-dom";
import SiteNav from "@/components/SiteNav";
import { MLB_TEAMS } from "@/data/mlb-teams";

export default function MLB() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="inline-flex w-fit items-center rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold text-primary">
          MLB is live next
        </div>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">MLB tools are the priority build.</h1>
          <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">
            Home run props, hits props, strikeout props, matchup analysis, and Statcast-powered recommendations are the
            next modules going live in Joe Knows Ball.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Focus 1", "Home Run Props", "Batter power, park context, pitcher profile, and weather edge."],
            ["Focus 2", "Hits + Strikeouts", "Contact quality, lineup spot, leash, and swing-and-miss indicators."],
            ["Focus 3", "Workflow + UX", "Faster slate review, cleaner ranking views, and sharper bet surfacing."],
          ].map(([eyebrow, title, body]) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-primary">{eyebrow}</div>
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
                  <img src={team.logo} alt={team.name} className="h-8 w-8 object-contain transition group-hover:scale-105" />
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
    </div>
  );
}
