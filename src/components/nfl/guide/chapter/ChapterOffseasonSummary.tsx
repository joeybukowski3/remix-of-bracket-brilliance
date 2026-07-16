import { GuideSectionHeading, SourceTag } from "@/components/nfl/guide/GuideAtoms";
import type { NflGuideRecord } from "@/lib/nfl/guideRecord";

/**
 * Coaching & offseason context (Section F): verified structured data only.
 * No subjective judgement of a transaction's quality is rendered here.
 */
export function ChapterOffseasonSummary({ team }: { team: NflGuideRecord }) {
  const { offseason } = team;
  if (!offseason) return null;
  const additions = offseason.additions ?? [];
  const departures = offseason.departures ?? [];

  return (
    <section className="break-inside-avoid border border-slate-200 bg-white p-3">
      <GuideSectionHeading as="h3" eyebrow="Offseason" title="Coaching & verified movement" />
      <div className="mt-3 flex items-center gap-2">
        <SourceTag kind="editorial" />
        <span className="text-[10px] text-slate-500">Verified through {offseason.verifiedAt}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-black text-slate-900">{offseason.headCoach2026}</span>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
            offseason.status === "Changed" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          {offseason.status === "Changed" ? "New head coach" : "Returning head coach"}
        </span>
      </div>
      {offseason.note ? <p className="mt-1 text-xs leading-5 text-slate-600">{offseason.note}</p> : null}

      {additions.length > 0 || departures.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {additions.length > 0 ? (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-emerald-800">
                Verified additions
              </div>
              <ul className="mt-1 space-y-0.5">
                {additions.map((move) => (
                  <li key={`${move.player}-${move.position}`} className="text-xs text-slate-700">
                    <span className="font-bold text-slate-900">{move.player}</span>{" "}
                    <span className="text-slate-500">
                      {move.position} · {move.method}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {departures.length > 0 ? (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-red-800">
                Verified departures
              </div>
              <ul className="mt-1 space-y-0.5">
                {departures.map((move) => (
                  <li key={`${move.player}-${move.position}`} className="text-xs text-slate-700">
                    <span className="font-bold text-slate-900">{move.player}</span>{" "}
                    <span className="text-slate-500">
                      {move.position} · {move.method}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 text-[9px] text-slate-500">Not a complete roster transaction log.</p>
    </section>
  );
}
