import { useMemo, useState, type ReactNode, type SVGProps } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import PgaModelPreviewCard from "@/components/pga/PgaModelPreviewCard";
import SeoJsonLd from "@/components/seo/SeoJsonLd";
import { useRbcFieldPlayers } from "@/hooks/useRbcFieldPlayers";
import { usePageSeo } from "@/hooks/usePageSeo";
import { rankPlayersByScore } from "@/lib/pga/pgaModelHelpers";
import type { PgaWeights } from "@/lib/pga/pgaTypes";
import { detectActivePreset, getStoredPgaAppliedWeights, PGA_PRESETS, RBC_HERITAGE_WEIGHTS } from "@/lib/pga/pgaWeights";
import type { PgaTournamentBet, PgaTournamentContent } from "@/lib/seo/pgaTournamentContent";
import { buildArticleSchema, buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/pgaSeo";

const HERO_STEPS = [
  {
    step: "01",
    title: "Customize the Harbour Town model",
    body: "Start with the course-fit lens you want, then push the live board toward the stat profile you trust most.",
  },
  {
    step: "02",
    title: "Preview who rises",
    body: "Watch the ranking table react before you commit to outrights, Top 10s, or safer Top 40 structures.",
  },
  {
    step: "03",
    title: "Open the full model room",
    body: "Use the complete slider board on `/pga/model` to fine-tune every major input across the field.",
  },
  {
    step: "04",
    title: "Then read the card",
    body: "Once the board is set, use the written picks, fades, and parlay notes as the betting layer on top.",
  },
] as const;

const HERO_STATS = [
  { value: "83", label: "Players ranked" },
  { value: "5", label: "Quick weight views" },
  { value: "4", label: "Slider lanes previewed" },
  { value: "Live", label: "Heat-map table" },
  { value: "/pga/model", label: "Full model room" },
] as const;

const MODEL_FLOW = [
  "Adjust weights",
  "Re-rank the field",
  "Compare Harbour Town fits",
  "Open full model room",
  "Bet the board",
] as const;

const MODEL_VALUE_STRIP = [
  {
    title: "Adjust weights your way",
    body: "Lean harder into Harbour Town course history, ball striking, accuracy, or short-game touch before you place a bet.",
  },
  {
    title: "Compare Harbour Town fits",
    body: "See which names climb when the setup favors precision, wedge play, and course-control instead of raw power.",
  },
  {
    title: "See full-field rankings instantly",
    body: "The preview shows the model logic fast. The full room opens the complete table with every golfer and slider.",
  },
] as const;

const WEIGHT_SHIFT_NOTES = [
  {
    title: "Course history pressure test",
    body: "Boosting Harbour Town history gives more lift to players with repeat reps and true course SG staying power.",
  },
  {
    title: "Ball-striking lens",
    body: "When approach and control matter more, the board tilts toward clean iron players who can keep the round stress-free.",
  },
  {
    title: "Short-game fallback",
    body: "Raising around-the-green and putting weight rewards players who can scramble when Harbour Town starts defending itself.",
  },
] as const;

const PREVIEW_THEMES = [
  {
    key: "default",
    label: "Default Model",
    description: "Balanced Harbour Town weighting across approach play, accuracy, scoring, and course-fit context.",
    weights: RBC_HERITAGE_WEIGHTS,
  },
  {
    key: "courseHistory",
    label: "Course History",
    description: "Leans harder on Harbour Town course SG and repeat comfort on this course without dropping approach out of the mix.",
    weights: {
      sgApproach: 18,
      par4: 12,
      drivingAccuracy: 10,
      bogeyAvoidance: 10,
      sgAroundGreen: 8,
      trendRank: 8,
      birdie125150: 5,
      sgPutting: 5,
      birdieUnder125: 2,
      courseTrueSg: 22,
    },
  },
  {
    key: "ballStriking",
    label: "Ball Striking",
    description: "Turns the board toward elite iron play, precise par-4 scoring, and fairway control for a sharper tee-to-green lean.",
    weights: {
      sgApproach: 28,
      par4: 15,
      drivingAccuracy: 17,
      bogeyAvoidance: 8,
      sgAroundGreen: 6,
      trendRank: 10,
      birdie125150: 6,
      sgPutting: 3,
      birdieUnder125: 1,
      courseTrueSg: 6,
    },
  },
  {
    key: "accuracy",
    label: "Accuracy",
    description: "Pushes the preview toward fairways found, bogey avoidance, and steady Harbour Town navigation.",
    weights: {
      sgApproach: 18,
      par4: 13,
      drivingAccuracy: 24,
      bogeyAvoidance: 18,
      sgAroundGreen: 6,
      trendRank: 7,
      birdie125150: 4,
      sgPutting: 3,
      birdieUnder125: 1,
      courseTrueSg: 6,
    },
  },
  {
    key: "shortGame",
    label: "Short Game",
    description: "Raises the value of scrambling and Bermuda putting when you want more recovery skill built into the board.",
    weights: {
      sgApproach: 17,
      par4: 10,
      drivingAccuracy: 9,
      bogeyAvoidance: 11,
      sgAroundGreen: 20,
      trendRank: 8,
      birdie125150: 5,
      sgPutting: 12,
      birdieUnder125: 3,
      courseTrueSg: 5,
    },
  },
] as const satisfies readonly { key: string; label: string; description: string; weights: PgaWeights }[];

const TOP_40_FITS: Record<string, "strong" | "moderate"> = {
  "Collin Morikawa": "strong",
  "Patrick Cantlay": "strong",
  "Matt Fitzpatrick": "strong",
  "Tommy Fleetwood": "strong",
  "Daniel Berger": "strong",
  "Russell Henley": "moderate",
  "Corey Conners": "moderate",
  "Si Woo Kim": "moderate",
};

const PARLAY_CARD_META = [
  { title: "Target Top 40 markets", icon: BarChartIcon },
  { title: "Avoid missed-cut risk", icon: ClockIcon },
  { title: "Focus on course consistency", icon: LineChartIcon },
  { title: "Model over public perception", icon: ScatterIcon },
] as const;

function SectionCard({
  title,
  eyebrow,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pga-card ${className}`}>
      {eyebrow ? <div className="pga-label mb-2.5">{eyebrow}</div> : null}
      <h2 className="pga-section-title">{title}</h2>
      <div className="mt-4 md:mt-5">{children}</div>
    </section>
  );
}

function parseEdgeScore(edge?: string) {
  if (!edge) return null;
  const match = edge.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getEdgePercent(edge?: string, maxEdge = 16) {
  const score = parseEdgeScore(edge);
  if (!score) return 0;
  return Math.min(100, Math.round((score / maxEdge) * 100));
}

function getSummaryEdgeTone(edgeText: string) {
  const score = Number(edgeText);
  if (score >= 14) return "pga-edge-chip-high";
  return "pga-edge-chip-mid";
}

function getCourseFit(player: string) {
  return TOP_40_FITS[player] ?? "moderate";
}

function BetList({
  bets,
  tier,
}: {
  bets: readonly PgaTournamentBet[];
  tier: "tier1" | "tier2" | "tier3";
}) {
  const barClass = tier === "tier1" ? "bg-[var(--pga-green-bar)]" : "bg-[var(--pga-orange)]";

  return (
    <div className="divide-y divide-[color:var(--pga-border)]">
      {bets.map((bet) => (
        <article key={bet.player} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[14px] font-medium text-foreground">{bet.player}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="pga-odds-badge">{bet.odds}</span>
              {bet.edge ? <span className="pga-edge-badge">{bet.edge}</span> : null}
            </div>
          </div>
          {bet.edge ? (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary/80">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${getEdgePercent(bet.edge)}%` }} />
            </div>
          ) : null}
          <p className="mt-3 text-[12px] leading-6 text-muted-foreground">{bet.analysis}</p>
        </article>
      ))}
    </div>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return <div className="pga-icon-frame">{children}</div>;
}

function BarChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M3 19h18" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function LineChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 18h16" />
      <path d="m5 15 4-5 4 3 6-7" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ScatterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
      <circle cx="18" cy="16" r="2" />
      <path d="m8.5 8.5 2.5 5.5" />
      <path d="m15.2 9.3-3.4 5.3" />
    </svg>
  );
}

export default function PgaTournamentPicksPage({ content }: { content: PgaTournamentContent }) {
  usePageSeo({
    title: content.title,
    description: content.description,
    path: content.path,
    type: "article",
  });

  const dateModified = "2026-04-14";
  const { players, status: previewStatus, errorMessage } = useRbcFieldPlayers();
  const [activePreviewThemeKey, setActivePreviewThemeKey] = useState<(typeof PREVIEW_THEMES)[number]["key"]>("default");
  const storedWeights = useMemo(() => getStoredPgaAppliedWeights(), []);
  const activePreviewTheme = PREVIEW_THEMES.find((theme) => theme.key === activePreviewThemeKey) ?? PREVIEW_THEMES[0];
  const previewRows = useMemo(
    () => rankPlayersByScore(players, activePreviewTheme.weights).slice(0, 6),
    [players, activePreviewTheme],
  );
  const liveModelLabel = useMemo(() => {
    const presetKey = detectActivePreset(storedWeights);
    return presetKey ? `${PGA_PRESETS[presetKey].label} preset currently saved` : "Custom weight profile currently saved";
  }, [storedWeights]);
  const previewSliders = useMemo(
    () => [
      { label: "SG: Approach", value: activePreviewTheme.weights.sgApproach, max: 30 },
      { label: "Driving Accuracy", value: activePreviewTheme.weights.drivingAccuracy, max: 30 },
      { label: "Short Game", value: activePreviewTheme.weights.sgAroundGreen, max: 30 },
      { label: "Course History", value: activePreviewTheme.weights.courseTrueSg, max: 30 },
    ],
    [activePreviewTheme],
  );

  return (
    <SiteShell>
      <SeoJsonLd
        id={`${content.slug}-schema`}
        data={[
          buildArticleSchema({
            headline: content.title,
            description: content.description,
            path: content.path,
            dateModified,
          }),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "PGA Picks", path: content.path },
          ]),
          buildFaqSchema(content.faqs),
        ]}
      />
      <main className="site-page pga-picks-page pb-28 pt-6 sm:pb-16 sm:pt-10">
        <div className="site-container site-stack">
          <section className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr] lg:gap-6">
            <div className="pga-card p-5 md:p-8">
              <div className="pga-badge">{content.heroBadge}</div>
              <h1 className="pga-hero-title mt-3 max-w-4xl sm:mt-4 md:mt-5">{content.heroTitle}</h1>
              <p className="mt-3 max-w-3xl text-[15px] leading-7 text-muted-foreground sm:mt-4 sm:text-lg sm:leading-8">
                Build your Harbour Town model first, then read the board. This page now leads with a live ranking preview so the model feels like the product, not the footnote.
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                {content.heroIntro} {content.heroSupport}
              </p>
              <div className="mt-5 flex flex-wrap gap-3 sm:mt-6 sm:gap-4 md:mt-8">
                <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 sm:px-5 sm:py-3">
                  Open Full Model
                </Link>
                <a href="#best-bets" className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary sm:px-5 sm:py-3">
                  Read written picks
                </a>
              </div>
              <div className="mt-6 grid gap-3">
                {HERO_STEPS.map((item) => (
                  <div key={item.step} className="rounded-xl border border-[color:var(--pga-border)] bg-secondary/35 p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pga-green-fill)] text-[12px] font-semibold text-[var(--pga-green-dark)]">
                        {item.step}
                      </span>
                      <div>
                        <h2 className="text-[15px] font-medium text-foreground">{item.title}</h2>
                        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{item.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <PgaModelPreviewCard
              status={previewStatus}
              errorMessage={errorMessage}
              themes={PREVIEW_THEMES}
              activeThemeKey={activePreviewTheme.key}
              onThemeChange={setActivePreviewThemeKey}
              activeThemeDescription={activePreviewTheme.description}
              previewRows={previewRows}
              sliders={previewSliders}
              liveModelLabel={liveModelLabel}
              ctaHref="/pga/model"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="pga-stat-card">
                <div className="pga-stat-value">{stat.value}</div>
                <div className="mt-2 text-[12px] font-medium text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            {MODEL_VALUE_STRIP.map((item) => (
              <div key={item.title} className="rounded-xl border border-[color:var(--pga-border)] bg-card p-5">
                <div className="pga-label">Why use the model?</div>
                <h2 className="mt-2 text-[20px] font-medium tracking-[-0.02em] text-foreground">{item.title}</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </section>

          <SectionCard title="What Changes When You Adjust Weights" eyebrow="Model Overview">
            <div className="grid gap-5 sm:gap-6">
              <p className="max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                This model is built to stay fast and explainable. Move the weights, re-rank the field, and use the written picks after you know which Harbour Town profile you want to bet. The preview above is a front door to the full slider room on `/pga/model`.
              </p>
              <div className="pga-flow">
                {MODEL_FLOW.map((node, index) => (
                  <div key={node} className="contents">
                    <div className={`pga-flow-node ${node === "Composite score" ? "pga-flow-node-active" : ""}`}>{node}</div>
                    {index < MODEL_FLOW.length - 1 ? <div className="pga-flow-arrow" aria-hidden="true">&rarr;</div> : null}
                  </div>
                ))}
              </div>
              <div className="grid gap-3 xl:grid-cols-3">
                {WEIGHT_SHIFT_NOTES.map((item) => (
                  <div key={item.title} className="rounded-lg border border-[color:var(--pga-border)] bg-secondary/40 p-4">
                    <h3 className="text-[14px] font-medium text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top 10 Best Bets" eyebrow="PGA Best Bets">
            <div id="best-bets" className="space-y-4 sm:space-y-6">
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                {content.top10Intro}
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                  <div className="bg-[var(--pga-green-dark)] px-4 py-3 text-[13px] font-medium text-[var(--pga-tier-header-text)]">
                    Tier 1 &mdash; Strong model + sweet spot odds
                  </div>
                  <div className="p-4">
                    <BetList bets={content.tierOneBets} tier="tier1" />
                  </div>
                </div>

                <div className="grid gap-4 sm:gap-6">
                  <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                    <div className="bg-secondary/70 px-4 py-3 text-[13px] font-medium text-muted-foreground">
                      Tier 2 &mdash; Solid value
                    </div>
                    <div className="p-4">
                      <BetList bets={content.tierTwoBets} tier="tier2" />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                    <div className="bg-secondary/40 px-4 py-3 text-[13px] font-medium text-muted-foreground">
                      Tier 3 &mdash; Upside Plays
                    </div>
                    <div className="p-4">
                      <BetList bets={content.tierThreeBets} tier="tier3" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Top 40 Parlay Golfers" eyebrow="Safe Plays">
            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
                  {content.top40Intro}
                </p>
                <Link to="/pga/model?preset=top40" className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary sm:px-5 sm:py-2.5">
                  Top 40 golf picks
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--pga-green-bar)]" />
                  Strong fit
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--pga-orange)]" />
                  Moderate fit
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-[color:var(--pga-border)] bg-card">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[color:var(--pga-border)] text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Player</th>
                        <th className="px-4 py-3">Course fit</th>
                        <th className="px-4 py-3">Why They're a Strong Top 40 Play</th>
                      </tr>
                    </thead>
                    <tbody>
                      {content.top40Rows.map((row, index) => (
                        <tr key={row[0]} className="border-t border-[color:var(--pga-border)] align-top first:border-t-0">
                          <td className="px-4 py-3 sm:py-4">
                            <span className={`pga-rank-circle ${index < 3 ? "pga-rank-circle-top" : "pga-rank-circle-rest"}`}>{index + 1}</span>
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground sm:py-4">{row[0]}</td>
                          <td className="px-4 py-3 sm:py-4">
                            <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                              <span className={`h-2.5 w-2.5 rounded-full ${getCourseFit(row[0]) === "strong" ? "bg-[var(--pga-green-bar)]" : "bg-[var(--pga-orange)]"}`} />
                              {getCourseFit(row[0]) === "strong" ? "Strong fit" : "Moderate fit"}
                            </span>
                          </td>
                          <td className="px-4 py-3 leading-6 text-muted-foreground sm:py-4 sm:leading-7">{row[1]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-6 sm:gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <SectionCard title="Notable Fades" eyebrow="Fades">
              <div className="grid gap-2">
                {content.fades.map((fade) => (
                  <article key={fade} className="pga-fade-card">
                    <div className="text-[13px] font-medium text-[var(--pga-fade-text)]">{fade.split(" -> ")[0]}</div>
                    <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{fade.split(" -> ")[1] ?? ""}</p>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Summary Table" eyebrow="Quick Board">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--pga-border)] text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="px-3 py-3">Player</th>
                      <th className="px-3 py-3">Odds</th>
                      <th className="px-3 py-3">Edge</th>
                      <th className="px-3 py-3">Key Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.summaryRows.map((row) => (
                      <tr key={row[0]} className="border-t border-[color:var(--pga-border)] first:border-t-0">
                        <td className="px-3 py-3 font-medium text-foreground sm:py-4">{row[0]}</td>
                        <td className="px-3 py-3 text-muted-foreground sm:py-4">{row[1]}</td>
                        <td className="px-3 py-3 sm:py-4">
                          <span className={`pga-edge-chip ${getSummaryEdgeTone(row[2])}`}>{row[2]}</span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground sm:py-4">{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Harbour Town Betting Strategy" eyebrow="Course Strategy">
            <div className="grid gap-3 sm:grid-cols-2">
              {content.strategyBullets.map((item) => (
                <div key={item} className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4 text-sm leading-6 text-muted-foreground sm:leading-7">
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="How to Build Golf Parlays" eyebrow="Parlay Strategy">
            <div className="grid gap-3 sm:grid-cols-2">
              {content.parlayBullets.map((item, index) => {
                const meta = PARLAY_CARD_META[index];
                const Icon = meta.icon;

                return (
                  <div key={item} className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4">
                    <IconFrame>
                      <Icon className="h-4 w-4 text-[var(--pga-green-dark)]" />
                    </IconFrame>
                    <h3 className="mt-3 text-[13px] font-medium text-foreground">{meta.title}</h3>
                    <p className="mt-2 text-[12px] leading-6 text-muted-foreground">{item}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title={`${content.heroTitle.replace(" Picks & Best Bets", "")} FAQ`} eyebrow="FAQ">
            <div className="grid gap-3">
              {content.faqs.map((entry) => (
                <article key={entry.question} className="rounded-lg border border-[color:var(--pga-border)] bg-card p-4">
                  <h3 className="text-[15px] font-medium text-foreground">{entry.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{entry.answer}</p>
                </article>
              ))}
            </div>
          </SectionCard>

          <section className="pga-card p-4 text-center md:p-10">
            <div className="pga-label">Golf betting model</div>
            <h2 className="pga-section-title mt-2">
              Use the full model room to tune the Harbour Town board before you lock in the bets below.
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:mt-4 sm:text-base sm:leading-8">
              Open the interactive board, adjust the real sliders, and compare the full-field rankings against the written outrights, Top 40 plays, and fades on this page.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3 sm:mt-7 sm:gap-4">
              <Link to="/pga/model" className="inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 sm:px-6 sm:py-3 sm:text-base">
                Open Full Model
              </Link>
              <a href="#best-bets" className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary sm:px-6 sm:py-3 sm:text-base">
                Back to picks
              </a>
            </div>
          </section>
        </div>

        <div className="fixed inset-x-4 bottom-4 z-30 md:hidden">
          <Link
            to="/pga/model"
            className="flex items-center justify-center rounded-2xl bg-[#1a3a2a] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(26,58,42,0.28)]"
          >
            Open Full Model
          </Link>
        </div>
      </main>
    </SiteShell>
  );
}
