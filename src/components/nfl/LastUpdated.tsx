import type { NflDataMeta } from "@/lib/nfl/standings";

/**
 * Small metadata stamp for NFL data surfaces: source + generated time,
 * optional season/week. Renders nothing if metadata is missing.
 */
export default function LastUpdated({ meta, className = "" }: { meta: NflDataMeta | null | undefined; className?: string }) {
  if (!meta?.generatedAt) return null;
  const generated = new Date(meta.generatedAt);
  const when = Number.isNaN(generated.getTime())
    ? meta.generatedAt
    : generated.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <p className={`text-[11px] leading-5 text-slate-400 ${className}`} data-testid="nfl-last-updated">
      Data: {meta.source}
      {meta.season ? ` · Season ${meta.season}` : ""}
      {meta.week != null ? ` · Week ${meta.week}` : ""}
      {" · Last updated "}
      {when}
    </p>
  );
}
