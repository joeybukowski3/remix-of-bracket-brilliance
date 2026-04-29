import { useMemo } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaLeaderboardPreviewTable from "@/components/pga/PgaLeaderboardPreviewTable";
import { usePgaTournamentPlayers } from "@/hooks/usePgaTournamentPlayers";
import { usePageSeo } from "@/hooks/usePageSeo";
import { formatCompositeScore, getTopProjections, rankPlayersByScore } from "@/lib/pga/modelEngine";
import { getFeaturedPgaHubContext } from "@/lib/pga/tournaments";
import { buildPgaHubBoardContext } from "@/lib/pga/tournamentUi";

export default function PgaHub() {
  const featured = getFeaturedPgaHubContext();
  const tournament = featured.featuredPgaBoard;
  const boardContext = buildPgaHubBoardContext(tournament, featured.scheduleEntry);
  const { players, status, errorMessage } = usePgaTournamentPlayers(tournament);
  const rows = useMemo(
    () => rankPlayersByScore(players, tournament.model.presets[0].weights, tournament.manual?.playerAdjustments),
    [players, tournament],
  );
  const previewRows = rows.slice(0, 8);
  const topPlayers = getTopProjections(rows, tournament).slice(0, 4);
  const statColumns = tournament.model.statColumns.slice(0, 3);

  usePageSeo({
    title: `PGA Rankings Hub | ${tournament.shortName} ${tournament.season} Board`,
    description: `This week's PGA board with live model rankings, top player fits, and direct paths to the full model room and ${tournament.shortName} picks page.`,
    path: featured.hubPath,
  });

  return (
    <SiteShell>
      <main className="site-page pb-20 pt-6 sm:pt-10">
        <div className="site-container site-stack">
          <section className="overflow-hidden rounded-[30px] border border-[color:var(--pga-border)] bg-[linear-gradient(135deg,#f8fcf7_0%,#ffffff_58%,#eef5ef_100%)] shadow-[0_18px_40px_rgba(26,58,42,0.08)]">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="p-6 md:p-8">
                <div className="pga-label">{boardContext.eyebrow}</div>
                <h1 className="mt-3 max-w-3xl text-[2.1rem] font-semibold tracking-[-0.04em] text-foreground sm:text-[3rem]">
                  {boardContext.headline}
                </h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                  {boardContext.intro}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={featured.modelPath} className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                    Open Full Model
                  </Link>
                  <Link to={featured.picksPath} className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-5 py-3 text-sm font-medium text-foreground transition hover:bg-secondary">
                    Read This Week&apos;s Picks
                  </Link>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {boardContext.statCards.map((item) => (
                    <HubStat key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </div>

              <div className="border-t border-[color:var(--pga-border)] bg-secondary/20 p-6 md:p-8 lg:border-l lg:border-t-0">
                <div className="pga-label">Board context</div>
                <h2 className="mt-3 text-[1.45rem] font-semibold tracking-[-0.03em] text-foreground">
                  {boardContext.contextTitle}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-[15px]">
                  {boardContext.contextBody}
                </p>
                <div className="mt-5 grid gap-2">
                  {boardContext.contextBullets.map((item) => (
                    <div key={item} className="rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="pga-card p-5 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="pga-label">Rankings First</div>
                <h2 className="pga-section-title mt-2">{boardContext.leaderboardTitle}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  {boardContext.leaderboardBody}
                </p>
              </div>
              <Link to={featured.modelPath} className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary">
                Customize full rankings
              </Link>
            </div>

            {status === "loading" ? <div className="mt-6 text-sm text-muted-foreground">Loading current tournament rankings...</div> : null}
            {status === "error" ? <div className="mt-6 text-sm text-destructive">Unable to load the current board: {errorMessage}</div> : null}
            {status === "ready" && previewRows.length > 0 ? (
              <div className="mt-6 overflow-hidden rounded-2xl border border-[color:var(--pga-border)] bg-card">
                <PgaLeaderboardPreviewTable rows={previewRows} statColumns={statColumns} totalRankCount={rows.length} />
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <ValueCard
              title="View the leaderboard"
              body={`Open the current ${tournament.shortName} board first to see who the model is already pushing to the top.`}
            />
            <ValueCard
              title="Customize weights"
              body="Jump into the model room when you want to push the board toward ceiling, floor, or a more specific course-fit angle."
            />
            <ValueCard
              title="Read the written card"
              body="Use the tournament page for outrights, fades, Top 40 ideas, and the editorial notes that turn the rankings into a betting card."
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="pga-card p-5 md:p-6">
              <div className="pga-label">Model Favorites</div>
              <h2 className="pga-section-title mt-2">Top players this week</h2>
              <div className="mt-5 grid gap-3">
                {topPlayers.map((player) => (
                  <article key={player.id} className="rounded-xl border border-[color:var(--pga-border)] bg-secondary/25 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[15px] font-medium text-foreground">#{player.rank} {player.player}</div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{player.note}</p>
                      </div>
                      <span className="rounded-full bg-[var(--pga-green-fill)] px-3 py-1 text-[12px] font-semibold text-[var(--pga-green-dark)]">
                        {formatCompositeScore(player.score)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="pga-card p-5 md:p-6">
              <div className="pga-label">Current Tournament</div>
              <h2 className="pga-section-title mt-2">{tournament.name}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                This week&apos;s featured tournament stays connected to the PGA hub through one shared board context: rankings live here on `/pga`, the full slider room lives on `/pga/model`, and the written tournament card lives on its own event page.
              </p>
              <div className="mt-5 grid gap-3">
                <Link to={featured.modelPath} className="rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-4 transition hover:bg-secondary">
                  <div className="text-[14px] font-medium text-foreground">Open the model room</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">Adjust weights, rerank the field, and inspect the full board.</div>
                </Link>
                <Link to={featured.picksPath} className="rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-4 transition hover:bg-secondary">
                  <div className="text-[14px] font-medium text-foreground">Read this week&apos;s picks</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">See outrights, fades, placement angles, and event-specific notes.</div>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}

function HubStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[14px] font-medium text-foreground">{value}</div>
    </div>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--pga-border)] bg-card p-5">
      <div className="pga-label">How to use the board</div>
      <h2 className="mt-2 text-[20px] font-medium tracking-[-0.02em] text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}
