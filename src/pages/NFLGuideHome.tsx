import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflGuideNav from "@/components/nfl/NflGuideNav";
import { SourceTag } from "@/components/nfl/guide/GuideAtoms";
import { formatGeneratedAt } from "@/components/nfl/guide/GuideHeader";
import { usePageSeo } from "@/hooks/usePageSeo";
import { NFL_GUIDE_CONFERENCES, NFL_GUIDE_MODEL_STATUS, NFL_GUIDE_SEASON } from "@/lib/nfl/guideRecord";

/**
 * `/nfl` — the guide development and preview home for this branch. It is the
 * starting point for the section: status, then the three primary surfaces
 * (full guide, print edition, power ratings), then quick team navigation.
 * Built entirely from the guide's existing data contracts and components; it
 * does not compute or duplicate any guide data itself.
 */
export default function NFLGuideHome() {
  usePageSeo({
    title: `${NFL_GUIDE_SEASON} NFL Guide — Development Home | Joe Knows Ball`,
    description: `Start here for the ${NFL_GUIDE_SEASON} JoeKnowsBall NFL Guide: open the full interactive guide, the print/PDF edition, power ratings, and team-by-team navigation.`,
    path: "/nfl",
  });

  const { modelVersion, validationStatus, generatedAt, sourceSeason } = NFL_GUIDE_MODEL_STATUS;

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-50 pb-16">
        <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          <NflGuideNav />

          <header className="border-b-4 border-slate-900 pb-5">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-700">
              JoeKnowsBall · Season {NFL_GUIDE_SEASON} · Guide development home
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              {NFL_GUIDE_SEASON} NFL Guide
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              This is the current guide preview. Model ratings, market prices and external reference
              statistics are pulled from the same data used across the section and are always labeled by
              source below.
            </p>

            {validationStatus && validationStatus !== "validated" ? (
              <p
                role="note"
                data-testid="guide-home-validation-notice"
                className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"
              >
                <span className="font-black uppercase tracking-wider">
                  Validation status: {validationStatus}
                </span>{" "}
                — the power model ({modelVersion ?? "current model"}) behind this guide is an internal{" "}
                {validationStatus} artifact, published here for review. Not betting advice.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">
                Data in this guide:
              </span>
              <SourceTag kind="model" />
              <SourceTag kind="market" />
              <SourceTag kind="previous-season" />
              <SourceTag kind="schedule" />
              <SourceTag kind="external" />
              <SourceTag kind="editorial" />
            </div>
          </header>

          <section aria-label="Guide entry points" className="grid gap-4 sm:grid-cols-3">
            <EntryCard
              eyebrow="Primary"
              title="Open Full Interactive Guide"
              description="Every conference, division and team, with model ratings, market lines, schedule and reference stats."
              to="/nfl/guide"
            />
            <EntryCard
              eyebrow="Same data, print-ready"
              title="Open Print / PDF Edition"
              description="The visual source for the eventual PDF. Save it from your browser's print dialog."
              to="/nfl-guide/"
            />
            <EntryCard
              eyebrow="Table view"
              title="Power Ratings"
              description="The full 32-team ratings table with offense, defense and overall grades."
              to="/nfl/power-ratings"
            />
          </section>

          <section aria-label="Team guide navigation" className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
              Team guide navigation
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {NFL_GUIDE_CONFERENCES.map(({ conference, divisions }) => (
                <div key={conference} className="min-w-0 border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-700">
                    {conference}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {divisions.map(({ division }) => (
                      <a
                        key={division}
                        href={`/nfl/guide#division-${division.toLowerCase().replace(/\s+/g, "-")}`}
                        className="rounded-sm border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                      >
                        {division.replace(`${conference} `, "")}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Methodology and model status" className="border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
              Methodology &amp; model status
            </h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatusItem label="Model" value={modelVersion ?? "Unavailable"} />
              <StatusItem label="Model generated" value={formatGeneratedAt(generatedAt)} />
              <StatusItem
                label="Rating inputs"
                value={sourceSeason ? `${sourceSeason} regular season` : "Unavailable"}
              />
              <StatusItem label="Preview season" value={String(NFL_GUIDE_SEASON)} />
            </dl>
            <a
              href="/nfl/guide#guide-methodology"
              className="mt-3 inline-block text-xs font-black text-indigo-700 underline-offset-2 hover:underline"
            >
              Read the full methodology &amp; attribution →
            </a>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}

function EntryCard({
  eyebrow,
  title,
  description,
  to,
}: {
  eyebrow: string;
  title: string;
  description: string;
  to: string;
}): ReactNode {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between border border-slate-200 bg-white p-4 transition hover:border-slate-900 hover:shadow-md"
    >
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">{eyebrow}</div>
        <h3 className="mt-1 text-base font-black text-slate-900">{title}</h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{description}</p>
      </div>
      <div className="mt-4 text-xs font-black text-indigo-700 group-hover:underline">Open →</div>
    </Link>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold tabular-nums text-slate-900" title={value}>
        {value}
      </dd>
    </div>
  );
}
