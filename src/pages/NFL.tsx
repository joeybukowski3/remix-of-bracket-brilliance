import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";

const PDF_PREVIEW_PATH = "/nfl-guide/";

export default function NFL() {
  usePageSeo({
    title: "JoeKnowsBall 2026 NFL Guide Preview",
    description: "Branch-only development home for the JoeKnowsBall 2026 NFL Guide and its printable PDF-style preview.",
    path: "/nfl",
    noindex: true,
  });

  return (
    <SiteShell>
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="relative overflow-hidden border-b border-slate-800">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.25),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.18),transparent_46%)]" />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-sky-300">
              Branch-only development preview
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
              JoeKnowsBall 2026 NFL Guide
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
              This branch is the working visual reference for the standalone NFL season guide. It is intentionally isolated from main and is not intended to be merged into production.
            </p>

            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              <Link
                to="/nfl/guide"
                className="rounded-2xl bg-sky-500 px-6 py-5 text-center text-sm font-black text-white shadow-lg shadow-sky-950/40 transition hover:bg-sky-400"
              >
                Open Live NFL Guide
                <span className="mt-1 block text-xs font-medium text-sky-100">Team pages, futures, schedules, stats, and analysis</span>
              </Link>
              <a
                href={PDF_PREVIEW_PATH}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5 text-center text-sm font-black text-white transition hover:border-sky-400 hover:bg-slate-800"
              >
                Open Printable Report Preview
                <span className="mt-1 block text-xs font-medium text-slate-400">Review the PDF-style layout and save it as a PDF</span>
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-3 lg:px-8">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="text-xs font-black uppercase tracking-wider text-sky-300">Live guide</div>
            <h2 className="mt-2 text-xl font-black">Development source</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">Use the existing guide and team-dashboard routes to develop the analysis and integrate NFL data already stored on this branch.</p>
          </article>
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="text-xs font-black uppercase tracking-wider text-amber-300">Report preview</div>
            <h2 className="mt-2 text-xl font-black">PDF visual reference</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">The printable preview is the publication-facing version. Use the browser print dialog to save the latest review copy as a PDF.</p>
          </article>
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="text-xs font-black uppercase tracking-wider text-emerald-300">Branch policy</div>
            <h2 className="mt-2 text-xl font-black">Never merge to main</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">Changes here can be experimental and guide-specific. Production behavior on main should remain independent from this preview environment.</p>
          </article>
        </section>
      </main>
    </SiteShell>
  );
}
