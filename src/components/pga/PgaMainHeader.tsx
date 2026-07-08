import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PgaTournamentMeta } from "@/lib/pga/pgaTypes";

type PgaModelSourceMeta = {
  modelSource?: "sheet" | "online-api" | "mixed" | "fallback";
  primaryDataSource?: string | null;
  generatedAt?: string | null;
  statsExportDate?: string | null;
  statsSyncedAt?: string | null;
  sourceFreshnessAgeDays?: number | null;
  sheetIsStale?: boolean;
  onlineFallbackUsed?: boolean;
  safeForCurrentTournament?: boolean;
  modelAvailable?: boolean;
  fieldTournament?: string | null;
  modelTournament?: string | null;
  formulaImpact?: string | null;
};

function getSlugFromPicksPath(path: string) {
  const parts = String(path ?? "").split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

function labelForSource(source?: string) {
  if (source === "sheet") return "Google Sheet";
  if (source === "fallback") return "PGA Tour API fallback";
  if (source === "online-api") return "PGA Tour API";
  if (source === "mixed") return "Mixed Sheet/API";
  return "Source metadata updating";
}

function ModelSourceNotice({ meta, picksPath }: { meta: PgaTournamentMeta; picksPath: string }) {
  const [sourceMeta, setSourceMeta] = useState<PgaModelSourceMeta | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSourceMeta() {
      const slug = getSlugFromPicksPath(picksPath);
      const candidates = [
        slug ? `/data/pga/${slug}-model-meta.json` : "",
        "/data/pga/model-source-meta.json",
      ].filter(Boolean);

      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate, { cache: "no-store" });
          if (!response.ok) continue;
          const payload = await response.json();
          if (active) setSourceMeta(payload as PgaModelSourceMeta);
          return;
        } catch {
          // Try the next metadata path.
        }
      }

      if (active) setSourceMeta(null);
    }

    void loadSourceMeta();
    return () => {
      active = false;
    };
  }, [picksPath]);

  if (!sourceMeta) return null;

  const sourceLabel = labelForSource(sourceMeta.modelSource);
  const sourceAge = typeof sourceMeta.sourceFreshnessAgeDays === "number"
    ? `${sourceMeta.sourceFreshnessAgeDays.toFixed(1)}d old`
    : "freshness age unavailable";
  const strongWarning = sourceMeta.safeForCurrentTournament === false || sourceMeta.modelAvailable === false;
  const sheetFallbackNote = Boolean(sourceMeta.sheetIsStale && (sourceMeta.onlineFallbackUsed || sourceMeta.primaryDataSource === "online-api"));

  if (strongWarning) {
    return (
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
        PGA model source warning: the current model is not marked safe for {meta.tournament}. Do not treat the board as fresh until the Monday automation passes validation.
      </div>
    );
  }

  if (sheetFallbackNote) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Source note: the Google Sheet model is stale, so this board is using fresh {sourceLabel} stats filtered to the official current field. Sheet-only fields remain unavailable rather than fabricated.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
      Model source: {sourceLabel} · {sourceAge}. Tournament: {sourceMeta.modelTournament ?? meta.tournament}.
    </div>
  );
}

export default function PgaMainHeader({
  meta,
  ctaLabel = "View Best Bets",
}: {
  meta: PgaTournamentMeta;
  ctaLabel?: string;
}) {
  return (
    <section className="rounded-[32px] bg-card px-6 py-6 shadow-[0_2px_12px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {meta.title}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-[1.85rem]">
            {meta.tournament}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{meta.venue}</p>
        </div>

        {/* Quick stats pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
            {meta.fieldSize} golfers
          </span>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
            {meta.eventType}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
            {meta.noCutLabel}
          </span>
        </div>
      </div>

      {/* Picks CTA */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
        <p className="text-xs text-muted-foreground">
          Model weights drive the table below. Adjust them in the panel →
        </p>
        <Link
          to={meta.picksPath}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {ctaLabel}
        </Link>
      </div>

      <ModelSourceNotice meta={meta} picksPath={meta.picksPath} />
    </section>
  );
}
