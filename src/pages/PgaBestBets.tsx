import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";

type BestBetPick = {
  player: string;
  tournamentRank: number;
  powerRank: number;
  topStats: string[];
  bullets: string[];
  odds?: {
    outright?: string | null;
    top5?: string | null;
    top10?: string | null;
    top20?: string | null;
  } | null;
};

type BestBetsPayload = {
  tournament: string;
  course: string;
  generatedAt: string;
  preview?: {
    tournamentOverview: string;
    modelExplainer: string;
    pickApproach: string;
  } | null;
  valueBets?: Array<{
    player: string;
    market: string;
    americanOdds: string;
    modelRank: number;
    impliedProbability: string;
    modelEdge: string;
  }>;
  outrights: BestBetPick[];
  top5: BestBetPick[];
  top10: BestBetPick[];
  top20: BestBetPick[];
};

const EMPTY_MESSAGE = "This week's analysis generates every Monday. Check back after the picks drop.";

const SECTIONS: Array<{
  key: keyof Pick<BestBetsPayload, "outrights" | "top5" | "top10" | "top20">;
  title: string;
  description: string;
  tierNote: string;
}> = [
  {
    key: "outrights",
    title: "Outright Winners",
    description: "High upside plays - model value against the field price.",
    tierNote: "Outright: High upside, lower probability - use small unit.",
  },
  {
    key: "top5",
    title: "Top 5 Finishes",
    description: "Mixed exposure - one anchor and a pair of high-end value names.",
    tierNote: "Top 5: Elevated floor with win equity.",
  },
  {
    key: "top10",
    title: "Top 10 Finishes",
    description: "Higher-floor builds leaning on approach, short game, and clean scoring.",
    tierNote: "Top 10: Strong model floor - target around the number.",
  },
  {
    key: "top20",
    title: "Top 20 Finishes",
    description: "Safer placement targets built around consistency, not volatility.",
    tierNote: "Top 20: Consistency play - high probability placement.",
  },
];

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date);
}

function isEmpty(payload: BestBetsPayload | null) {
  if (!payload) return true;
  return SECTIONS.every(({ key }) => !payload[key]?.length);
}

function PreviewCard({ label, text }: { label: string; text: string }) {
  return (
    <article className="rounded-xl border border-gray-200 border-t-4 border-t-[#166534] bg-white p-4 shadow-sm">
      <div className="text-sm font-bold text-[#166534]">{label}</div>
      <p className="mt-3 text-sm leading-7 text-gray-700">{text}</p>
    </article>
  );
}

function ValueBetCard({
  bet,
}: {
  bet: {
    player: string;
    market: string;
    americanOdds: string;
    modelRank: number;
    impliedProbability: string;
    modelEdge: string;
  };
}) {
  return (
    <article className="rounded-xl border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-amber-950">{bet.player}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              {bet.market}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              {bet.americanOdds}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Model #{bet.modelRank}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm font-medium text-amber-900">Implied probability: {bet.impliedProbability}</div>
      <p className="mt-3 text-sm leading-6 text-amber-950/84">{bet.modelEdge}</p>
    </article>
  );
}

function PickCard({ pick, tierNote }: { pick: BestBetPick; tierNote: string }) {
  return (
    <article className="rounded-xl border border-gray-200 border-l-4 border-l-[#166534] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-gray-900">{pick.player}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800">
              Tournament #{pick.tournamentRank}
            </span>
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800">
              Power #{pick.powerRank}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {pick.topStats.map((stat) => (
          <span key={stat} className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800">
            {stat}
          </span>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {pick.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-sm leading-6 text-gray-700">
            <span className="mt-[8px] h-1.5 w-1.5 rounded-full bg-green-600" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-gray-200 pt-3 text-xs italic text-gray-500">{tierNote}</div>
    </article>
  );
}

export default function PgaBestBets() {
  const [data, setData] = useState<BestBetsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  usePageSeo({
    title: "PGA Championship Best Bets & Model Picks - Joe Knows Ball",
    description: "Data-driven PGA Championship picks for outright winners, top 5, top 10, and top 20 finishes. Built from course-weighted strokes gained models, not gut feelings.",
    path: "/pga/best-bets",
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/data/pga/best-bets.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Missing best bets JSON.");
        return response.json();
      })
      .then((json) => {
        if (!cancelled) setData(json as BestBetsPayload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasContent = useMemo(() => !isEmpty(data), [data]);

  return (
    <SiteShell>
      <main className="site-page bg-gray-50 pb-16 pt-4 text-gray-900">
        <div className="site-container space-y-6">
          <div className="sticky top-0 z-10 hidden rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:flex md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-gray-900">{data?.tournament ?? "PGA Best Bets"}</div>
              <div className="truncate text-sm text-gray-500">{data?.course ?? "Course-weighted betting board"}</div>
            </div>
            <div className="text-xs text-gray-500">
              {data?.generatedAt ? `Generated ${formatGeneratedAt(data.generatedAt)}` : "Awaiting this week's board"}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-green-700/80">PGA Best Bets</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-gray-900 sm:text-4xl">
                {data?.tournament ?? "PGA Best Bets"}
              </h1>
              <div className="mt-2 text-sm text-gray-500">
                {data ? `${data.course} | Generated ${formatGeneratedAt(data.generatedAt)}` : "Course-weighted picks generated from the tournament model."}
              </div>
            </div>

            <Link
              to="/pga"
              className="rounded-full bg-[#166534] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#14532d]"
            >
              Back to PGA Hub
            </Link>
          </div>

          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-sm text-gray-500 shadow-sm">
              Loading best bets analysis...
            </div>
          ) : !hasContent ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-sm text-gray-500 shadow-sm">
              {EMPTY_MESSAGE}
            </div>
          ) : (
            <>
              {data?.preview ? (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-900">Tournament Preview</h2>
                    <p className="mt-1 text-sm text-gray-500">Course context, active model logic, and how the betting tiers are being handled this week.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <PreviewCard label="The Tournament" text={data.preview.tournamentOverview} />
                    <PreviewCard label="How Our Model Works This Week" text={data.preview.modelExplainer} />
                    <PreviewCard label="How We're Approaching the Picks" text={data.preview.pickApproach} />
                  </div>
                </section>
              ) : null}

              {Array.isArray(data?.valueBets) && data.valueBets.length ? (
                <section id="value" className="space-y-4 scroll-mt-24">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-amber-950">Value Bets</h2>
                    <p className="mt-1 text-sm text-amber-900/70">Best model-versus-market mismatches from the current board.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.valueBets.map((bet) => (
                      <ValueBetCard key={`${bet.player}-${bet.market}`} bet={bet} />
                    ))}
                  </div>
                </section>
              ) : null}

              {SECTIONS.map((section) => (
              <section key={section.key} id={section.key} className="space-y-4 scroll-mt-24">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-900">{section.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">{section.description}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data?.[section.key].map((pick) => (
                    <PickCard key={`${section.key}-${pick.player}`} pick={pick} tierNote={section.tierNote} />
                  ))}
                </div>
              </section>
              ))}
            </>
          )}
        </div>
      </main>
    </SiteShell>
  );
}
