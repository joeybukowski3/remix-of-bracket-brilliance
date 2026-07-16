import { useState, type ReactNode } from "react";
import type { NflGuideRecord } from "@/lib/nfl/guideRecord";

/**
 * Provenance categories. Every number in the guide is tagged with exactly one so
 * model output is never mistaken for market data or editorial judgement.
 */
export type GuideSourceKind =
  | "model"
  | "market"
  | "previous-season"
  | "schedule"
  | "external"
  | "editorial"
  | "unavailable";

const SOURCE_LABELS: Record<GuideSourceKind, string> = {
  model: "JoeKnowsBall Model",
  market: "Market",
  "previous-season": "Previous Season",
  schedule: "Schedule",
  external: "External Reference",
  editorial: "Editorial Outlook",
  unavailable: "Data Unavailable",
};

const SOURCE_CLASSES: Record<GuideSourceKind, string> = {
  model: "border-indigo-300 bg-indigo-50 text-indigo-900",
  market: "border-amber-300 bg-amber-50 text-amber-900",
  "previous-season": "border-slate-300 bg-slate-100 text-slate-700",
  schedule: "border-teal-300 bg-teal-50 text-teal-900",
  external: "border-violet-300 bg-violet-50 text-violet-900",
  editorial: "border-stone-300 bg-stone-100 text-stone-700",
  unavailable: "border-slate-200 bg-white text-slate-400",
};

export function SourceTag({ kind, children }: { kind: GuideSourceKind; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.09em] ${SOURCE_CLASSES[kind]}`}
    >
      {children ?? SOURCE_LABELS[kind]}
    </span>
  );
}

/**
 * The guide's only team-logo implementation. Falls back to the canonical
 * abbreviation on a team-colored chip so every team always resolves to
 * something meaningful, in print as well as on screen.
 */
export function TeamLogo({
  team,
  size = 32,
  className = "",
}: {
  team: Pick<NflGuideRecord, "abbr" | "name" | "logoUrl" | "primaryColor">;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = { width: size, height: size };

  if (failed) {
    return (
      <span
        role="img"
        aria-label={`${team.name} logo`}
        data-testid={`team-logo-fallback-${team.abbr}`}
        style={{ ...dimensions, background: team.primaryColor, fontSize: size * 0.3 }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-black uppercase text-white ${className}`}
      >
        {team.abbr}
      </span>
    );
  }

  return (
    <img
      src={team.logoUrl}
      alt={`${team.name} logo`}
      data-testid={`team-logo-${team.abbr}`}
      style={dimensions}
      className={`shrink-0 object-contain ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** A labelled figure. Renders nothing when the underlying value is absent. */
export function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number | null | undefined;
  sub?: string | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</div>
      <div className="text-lg font-black tabular-nums leading-tight text-slate-900">{value}</div>
      {sub ? <div className="truncate text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function GuideSectionHeading({
  eyebrow,
  title,
  description,
  id,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  id?: string;
}) {
  return (
    <div id={id} className="border-b-2 border-slate-900 pb-2">
      {eyebrow ? (
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">{eyebrow}</div>
      ) : null}
      <h2 className="mt-0.5 text-xl font-black tracking-tight text-slate-900">{title}</h2>
      {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">{description}</p> : null}
    </div>
  );
}
