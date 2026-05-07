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
};

type BestBetsPayload = {
  tournament: string;
  course: string;
  generatedAt: string;
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
}> = [
  {
    key: "outrights",
    title: "Outright Winners",
    description: "High upside plays - model value against the field price.",
  },
  {
    key: "top5",
    title: "Top 5 Finishes",
    description: "Mixed exposure - one anchor and a pair of high-end value names.",
  },
  {
    key: "top10",
    title: "Top 10 Finishes",
    description: "Higher-floor builds leaning on approach, short game, and clean scoring.",
  },
  {
    key: "top20",
    title: "Top 20 Finishes",
    description: "Safer placement targets built around consistency, not volatility.",
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

function PickCard({ pick }: { pick: BestBetPick }) {
  return (
    <article className="rounded-[22px] border border-emerald-500/20 bg-[#06100c] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">{pick.player}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/12 px-2.5 py-1 text-xs font-semibold text-emerald-200">
              Tournament #{pick.tournamentRank}
            </span>
            <span className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-xs font-semibold text-emerald-50/80">
              Power #{pick.powerRank}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {pick.topStats.map((stat) => (
          <span key={stat} className="rounded-full bg-emerald-500/14 px-2.5 py-1 text-xs font-semibold text-emerald-300">
            {stat}
          </span>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {pick.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-sm leading-6 text-emerald-50/76">
            <span className="mt-[8px] h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
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
      <main className="site-page bg-[#020806] pb-16 pt-4 text-white">
        <div className="site-container space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/72">PGA Best Bets</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                {data?.tournament ?? "PGA Best Bets"}
              </h1>
              <div className="mt-2 text-sm text-emerald-50/70">
                {data ? `${data.course} | Generated ${formatGeneratedAt(data.generatedAt)}` : "Course-weighted picks generated from the tournament model."}
              </div>
            </div>

            <Link
              to="/pga"
              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/16"
            >
              Back to PGA Hub
            </Link>
          </div>

          {loading ? (
            <div className="rounded-[24px] border border-white/8 bg-[#06100c] px-4 py-8 text-sm text-emerald-50/68">
              Loading best bets analysis...
            </div>
          ) : !hasContent ? (
            <div className="rounded-[24px] border border-white/8 bg-[#06100c] px-4 py-8 text-sm text-emerald-50/68">
              {EMPTY_MESSAGE}
            </div>
          ) : (
            SECTIONS.map((section) => (
              <section key={section.key} className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">{section.title}</h2>
                  <p className="mt-1 text-sm text-emerald-50/64">{section.description}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {data?.[section.key].map((pick) => (
                    <PickCard key={`${section.key}-${pick.player}`} pick={pick} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </SiteShell>
  );
}
