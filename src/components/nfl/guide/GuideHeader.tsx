import { SourceTag } from "@/components/nfl/guide/GuideAtoms";
import { NFL_GUIDE_MODEL_STATUS, NFL_GUIDE_SEASON } from "@/lib/nfl/guideRecord";

export function formatGeneratedAt(iso: string | null): string {
  if (!iso) return "Generated date unavailable";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Generated date unavailable";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/**
 * Header shared by the live guide and the print view. `variant` only controls
 * the interactive affordances; the content contract is identical.
 */
export function GuideHeader({ variant }: { variant: "live" | "print" }) {
  const { modelVersion, validationStatus, generatedAt, sourceSeason } = NFL_GUIDE_MODEL_STATUS;

  return (
    <header className="border-b-4 border-slate-900 pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-700">
            JoeKnowsBall · Season {NFL_GUIDE_SEASON}
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {NFL_GUIDE_SEASON} NFL Guide
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Every team ranked by the JoeKnowsBall power model, set against the market, the completed{" "}
            {sourceSeason ?? "prior"} season, and schedule context — organised by conference and division for
            fast reference.
          </p>
        </div>

        {variant === "live" ? (
          <button
            type="button"
            onClick={() => window.print()}
            data-print-hidden
            className="rounded-md border-2 border-slate-900 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-white hover:text-slate-900"
          >
            Save as PDF
          </button>
        ) : null}
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusItem label="Model" value={modelVersion ?? "Unavailable"} tag="model" />
        <StatusItem
          label="Model generated"
          value={formatGeneratedAt(generatedAt)}
          tag="model"
        />
        <StatusItem
          label="Rating inputs"
          value={sourceSeason ? `${sourceSeason} regular season` : "Unavailable"}
          tag="previous-season"
        />
        <StatusItem label="Preview season" value={String(NFL_GUIDE_SEASON)} tag="model" />
      </dl>

      {validationStatus && validationStatus !== "validated" ? (
        <p
          role="note"
          data-testid="guide-validation-notice"
          className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"
        >
          <span className="font-black uppercase tracking-wider">
            Validation status: {validationStatus}
          </span>{" "}
          — these power ratings are an internal {validationStatus} artifact of the {modelVersion ?? "model"}{" "}
          pipeline. They are published here for review and are not betting advice.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">
          How to read this guide:
        </span>
        <SourceTag kind="model" />
        <SourceTag kind="market" />
        <SourceTag kind="previous-season" />
        <SourceTag kind="schedule" />
        <SourceTag kind="external" />
        <SourceTag kind="editorial" />
      </div>
    </header>
  );
}

function StatusItem({
  label,
  value,
  tag,
}: {
  label: string;
  value: string;
  tag: "model" | "previous-season";
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">
        {label}
        <SourceTag kind={tag} />
      </dt>
      <dd className="mt-1 truncate text-sm font-bold tabular-nums text-slate-900" title={value}>
        {value}
      </dd>
    </div>
  );
}
