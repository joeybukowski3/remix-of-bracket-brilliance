import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";

type Props = {
  sport: string;        // e.g. "NBA"
  description?: string; // optional tagline
};

export default function ComingSoon({ sport, description }: Props) {
  usePageSeo({
    title: `${sport} — Coming Soon`,
    description: `${sport} analytics tools are coming soon to Joe Knows Ball.`,
    path: `/${sport.toLowerCase()}`,
    noindex: true,
  });

  return (
    <SiteShell>
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 shadow-lg">
          <span className="text-3xl">🏀</span>
        </div>
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-slate-900">
          {sport} Coming Soon
        </h1>
        <p className="mb-8 max-w-md text-base text-slate-600">
          {description ?? `${sport} analytics, props, and matchup tools are in active development. Check back soon for the full experience.`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Back to Home
          </Link>
          <Link
            to="/mlb"
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Explore MLB Tools
          </Link>
          <Link
            to="/pga"
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Explore PGA Tools
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
