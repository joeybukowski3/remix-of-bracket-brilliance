import type { PgaFreshnessResult } from "@/lib/pga/pgaFreshness";

export type PgaFreshnessStatusPanelItem = {
  label: string;
  freshness: PgaFreshnessResult;
  impactText?: string;
  actualLabel?: string;
};

type Props = {
  freshness?: PgaFreshnessResult;
  items?: PgaFreshnessStatusPanelItem[];
  cleanTitle?: string;
  warningTitle?: string;
  cleanMessage?: string;
  actualLabel?: string;
  className?: string;
};

export default function PgaFreshnessStatusPanel({
  freshness,
  items,
  cleanTitle = "PGA data status",
  warningTitle = "PGA data freshness warning",
  cleanMessage,
  actualLabel = "Current payload",
  className = "",
}: Props) {
  const panelItems = items ?? (freshness ? [{ label: "", freshness, actualLabel }] : []);
  const warnings = panelItems.filter((item) => !item.freshness.isUsable);

  if (items && panelItems.length === 0) return null;

  if (warnings.length === 0 && !cleanMessage && panelItems.length !== 1) return null;

  if (warnings.length > 0) {
    return (
      <section className={`rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950 shadow-sm ${className}`}>
        <div className="font-semibold">{warningTitle}</div>
        {panelItems.length === 1 ? (
          <>
            <p className="mt-1 leading-6">{panelItems[0].freshness.reason}</p>
            <FreshnessMetadata item={panelItems[0]} actualLabel={panelItems[0].actualLabel ?? actualLabel} />
          </>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {warnings.map((item) => (
              <li key={`${item.label}-${item.freshness.status}-${item.freshness.reason}`}>
                {buildFreshnessWarning(item)}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (panelItems.length === 1) {
    return (
      <section className={`rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-950 shadow-sm ${className}`}>
        <div className="font-semibold">{cleanTitle}</div>
        <p className="mt-1 leading-6">{panelItems[0].freshness.reason}</p>
        <FreshnessMetadata item={panelItems[0]} actualLabel={panelItems[0].actualLabel ?? actualLabel} />
      </section>
    );
  }

  return (
    <section className={`rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ${className}`}>
      <strong>{cleanTitle}</strong> {cleanMessage}
    </section>
  );
}

function FreshnessMetadata({ item, actualLabel }: { item: PgaFreshnessStatusPanelItem; actualLabel: string }) {
  const { freshness } = item;
  return (
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <MetadataValue label="Expected tournament" value={freshness.expectedTournament ?? "Unknown"} />
      <MetadataValue label={actualLabel} value={freshness.actualTournament ?? "Unavailable"} />
      <MetadataValue label="Generated" value={formatNullableDate(freshness.generatedAt)} />
      <MetadataValue label="Fetched" value={formatNullableDate(freshness.fetchedAt)} />
      <MetadataValue label="Rows" value={freshness.rowCount ?? "Unknown"} />
      <MetadataValue label="Age" value={freshness.daysOld != null ? `${freshness.daysOld} days old` : "Unknown"} />
      <MetadataValue label="Source" value={freshness.source ?? "Unknown"} />
    </div>
  );
}

function MetadataValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span className="font-semibold">{label}:</span> {value}
    </div>
  );
}

function buildFreshnessWarning(item: PgaFreshnessStatusPanelItem) {
  const { freshness } = item;
  const details = [
    freshness.expectedTournament ? `expected ${freshness.expectedTournament}` : null,
    freshness.actualTournament ? `loaded ${freshness.actualTournament}` : null,
    freshness.generatedAt ? `generated ${formatStatusDate(freshness.generatedAt)}` : null,
    freshness.fetchedAt ? `fetched ${formatStatusDate(freshness.fetchedAt)}` : null,
    freshness.daysOld != null ? `${freshness.daysOld} days old` : null,
    freshness.rowCount != null ? `${freshness.rowCount} rows` : null,
    freshness.source ? `source ${freshness.source}` : null,
  ].filter(Boolean).join("; ");

  return `${item.label}: ${freshness.reason}${details ? ` (${details})` : ""}${item.impactText ? ` ${item.impactText}` : ""}`;
}

function formatNullableDate(value: string | null) {
  return value ? formatStatusDate(value) : "Missing";
}

function formatStatusDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(date);
}
