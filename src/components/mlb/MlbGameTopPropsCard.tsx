import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TopPropsCard, TopPropsCardStatus } from "@/lib/mlb/topProps/types";
import { cn } from "@/lib/utils";

const STATUS_COPY_TONE: Record<Exclude<TopPropsCardStatus, "ok">, string> = {
  empty: "text-slate-500",
  stale: "text-amber-700",
  closed: "text-slate-400",
};

export interface MlbGameTopPropsCardProps<T> {
  title: string;
  icon: ReactNode;
  iconClassName: string;
  card: TopPropsCard<T>;
  renderItem: (item: T, index: number) => ReactNode;
  ctaLabel?: string;
  className?: string;
}

/**
 * Shared shell for every data-backed Top Props card (HR, Strikeouts, Batter
 * vs Pitcher, Numerology). Presentation only -- all filtering/ranking/status
 * decisions already happened in buildGameTopProps(); this component just
 * renders whatever TopPropsCard it is handed.
 */
export function MlbGameTopPropsCard<T>({
  title,
  icon,
  iconClassName,
  card,
  renderItem,
  ctaLabel = "View Full Model",
  className,
}: MlbGameTopPropsCardProps<T>) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconClassName)}>{icon}</span>
        <span className="text-[15px] font-bold text-[#031635]">{title}</span>
      </div>

      <div className="flex-1 px-4 py-3">
        {card.status === "ok" ? (
          <div className="space-y-2.5">
            {card.message ? (
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{card.message}</p>
            ) : null}
            <div className="space-y-2">{card.items.map((item, index) => renderItem(item, index))}</div>
          </div>
        ) : (
          <div className={cn("py-3 text-center text-[12px] font-medium", STATUS_COPY_TONE[card.status])}>
            {card.message}
          </div>
        )}
      </div>

      {card.ctaHref ? (
        <Link
          to={card.ctaHref}
          className="block border-t border-slate-200 px-4 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 hover:underline"
        >
          {ctaLabel} →
        </Link>
      ) : null}
    </div>
  );
}
