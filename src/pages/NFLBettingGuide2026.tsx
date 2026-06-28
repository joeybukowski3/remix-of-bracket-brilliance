import { ArrowRight, BookOpen, CheckCircle2, Clock3, Database, FileText, Printer } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  NFL_BETTING_GUIDE_CHAPTER_COUNT,
  NFL_BETTING_GUIDE_PARTS,
} from "@/data/nflBettingGuide2026Framework";

const GUIDE_VERSION = "0.1 Framework Draft";
const GUIDE_DATE = "June 28, 2026";

export default function NFLBettingGuide2026() {
  usePageSeo({
    title: "2026 NFL Betting Guide Preview | Joe Knows Ball",
    description: "Framework preview for the JoeKnowsBall 2026 NFL Betting Guide.",
    path: "/nfl/2026-betting-guide",
    noindex: true,
  });

  return (
    <SiteShell>
      <main className="min-h-screen bg-[#f3f5f8] text-slate-950 print:bg-white">
        <Cover />

        <div className="mx-auto grid max-w-[1500px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
          <aside className="self-start lg:sticky lg:top-4 print:hidden">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Guide navigation</div>
                <div className="mt-1 text-lg font-black">Table of Contents</div>
              </div>
              <nav className="max-h-[72vh] overflow-y-auto p-3" aria-label="2026 NFL Betting Guide sections">
                {NFL_BETTING_GUIDE_PARTS.map((part) => (
                  <a
                    key={part.id}
                    href={`#${part.id}`}
                    className="group flex items-center justify-between rounded-xl px-3 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <span>
                      <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">{part.label}</span>
                      <span className="mt-0.5 block">{part.title}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </a>
                ))}
              </nav>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
              <div className="font-black">Personal working edition</div>
              <p className="mt-1">
                This draft establishes the guide structure only. Statistics, projections, odds and written conclusions will be added chapter by chapter.
              </p>
            </div>
          </aside>

          <div className="space-y-8">
            <GuideStatus />

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Draft contents</div>
                  <h2 className="mt-2 text-3xl font-black tracking-tight">Guide Framework</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Each card below represents a planned chapter or reference section. The framework intentionally excludes team rankings, betting recommendations and long-form analysis until the underlying methodology is approved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-800 shadow-sm transition hover:bg-slate-50 print:hidden"
                >
                  <Printer className="h-4 w-4" />
                  Print framework
                </button>
              </div>
            </section>

            {NFL_BETTING_GUIDE_PARTS.map((part) => (
              <section
                key={part.id}
                id={part.id}
                className="scroll-mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm print:break-inside-avoid"
              >
                <header className="border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-5 py-5 text-white sm:px-7">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">{part.label}</div>
                  <h2 className="mt-1 text-2xl font-black tracking-tight">{part.title}</h2>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">{part.description}</p>
                </header>

                <div className="grid gap-4 p-5 sm:p-7 xl:grid-cols-2">
                  {part.chapters.map((chapter) => (
                    <article key={`${part.id}-${chapter.number}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-slate-950 px-2 text-xs font-black text-white">
                            {chapter.number}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-black leading-5 text-slate-950">{chapter.title}</h3>
                            <p className="mt-2 text-xs leading-5 text-slate-600">{chapter.summary}</p>
                          </div>
                        </div>
                        <StatusBadge status={chapter.status} />
                      </div>

                      {chapter.items?.length ? (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {chapter.items.map((item) => (
                            <div key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600">
                              {item}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-[11px] font-semibold text-slate-400">
                        Content placeholder — statistics and analysis not yet added
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-sm leading-6 text-blue-950 print:break-inside-avoid">
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <h2 className="font-black">Source and citation framework</h2>
                  <p className="mt-1">
                    The completed personal edition may incorporate official statistics, public datasets, sportsbook markets and referenced research publications. Sources will be identified in chapter notes and consolidated in the Sources & Citations appendix with publication names, URLs, access dates and page references when applicable.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}

function Cover() {
  return (
    <section className="relative overflow-hidden border-b border-slate-800 bg-slate-950 text-white print:min-h-[92vh] print:border-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,.42),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,.18),_transparent_38%)]" />
      <div className="relative mx-auto flex max-w-[1500px] flex-col justify-between px-4 py-12 sm:px-6 lg:min-h-[520px] lg:px-8 lg:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-5">
          <div className="flex items-center gap-3">
            <img src="/images/jkb-icon-trimmed.png" alt="Joe Knows Ball" className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
            <div>
              <div className="text-sm font-black">Joe Knows Ball</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Personal Research Edition</div>
            </div>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200">
            {GUIDE_VERSION}
          </div>
        </div>

        <div className="max-w-5xl py-14 lg:py-20">
          <div className="text-xs font-black uppercase tracking-[0.26em] text-sky-300">2026 Season</div>
          <h1 className="mt-4 text-5xl font-black leading-[0.94] tracking-[-0.045em] sm:text-6xl lg:text-8xl">
            NFL Betting
            <span className="block text-sky-300">Guide</span>
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            An original JoeKnowsBall reference guide covering 2025 performance, 2026 projections, schedule analysis, divisions, awards and all 32 teams.
          </p>
        </div>

        <div className="grid gap-3 border-t border-white/15 pt-5 text-xs sm:grid-cols-3">
          <CoverMeta label="Draft date" value={GUIDE_DATE} />
          <CoverMeta label="Current stage" value="Framework & navigation" />
          <CoverMeta label="Content status" value="Analysis pending" />
        </div>
      </div>
    </section>
  );
}

function CoverMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-200">{value}</div>
    </div>
  );
}

function GuideStatus() {
  const cards = [
    { icon: BookOpen, label: "Framework sections", value: String(NFL_BETTING_GUIDE_PARTS.length), detail: "Opening through appendices" },
    { icon: FileText, label: "Chapter placeholders", value: String(NFL_BETTING_GUIDE_CHAPTER_COUNT), detail: "Ready for section-by-section development" },
    { icon: CheckCircle2, label: "Completed now", value: "Shell", detail: "Cover, contents and chapter organization" },
    { icon: Clock3, label: "Next stage", value: "Models", detail: "Data and methodology added after review" },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
      {cards.map(({ icon: Icon, label, value, detail }) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
            <Icon className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
        </div>
      ))}
    </section>
  );
}

function StatusBadge({ status }: { status: "framework" | "planned" }) {
  const complete = status === "framework";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${complete ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
      {complete ? "Framework" : "Planned"}
    </span>
  );
}
