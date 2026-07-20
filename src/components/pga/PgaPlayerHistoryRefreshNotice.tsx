import type { PgaHistoryLastRefresh } from "@/lib/pga/historyModel";
import { buildRefreshNoticeContent } from "@/lib/pga/pgaHistoryRefreshNotice";

type Props = {
  lastRefresh: PgaHistoryLastRefresh | null | undefined;
};

export default function PgaPlayerHistoryRefreshNotice({ lastRefresh }: Props) {
  const content = buildRefreshNoticeContent(lastRefresh);
  if (!content) return null;

  return (
    <section
      role="status"
      className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <p>{content.summarySentence}</p>
      {content.isCollapsed ? (
        <details className="mt-1">
          <summary className="cursor-pointer font-bold text-amber-900">View affected players</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {content.names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {content.timestampSentence ? <p className="mt-1 text-[10px] text-amber-700">{content.timestampSentence}</p> : null}
    </section>
  );
}
