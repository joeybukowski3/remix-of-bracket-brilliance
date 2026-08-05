import type { NflDataMeta } from "@/lib/nfl/standings";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";

/**
 * Small metadata stamp for NFL data surfaces: source + generated time,
 * optional season/week. Renders nothing if metadata is missing.
 */
export default function LastUpdated({ meta, className = "" }: { meta: NflDataMeta | null | undefined; className?: string }) {
  if (!meta?.generatedAt) return null;
  return (
    <p className={`text-[11px] leading-5 text-slate-400 ${className}`} data-testid="nfl-last-updated">
      Data: {meta.source}
      {meta.season ? ` · Season ${meta.season}` : ""}
      {meta.week != null ? ` · Week ${meta.week}` : ""}
      {" · Last updated "}
      {formatNflMetadataTimestamp(meta.generatedAt)}
    </p>
  );
}
