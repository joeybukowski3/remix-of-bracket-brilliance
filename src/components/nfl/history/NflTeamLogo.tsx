import { useState } from "react";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { cn } from "@/lib/utils";

const SIZE_CLASS = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

/**
 * Shared NFL team-logo badge with a lettered fallback. Backed by the app's
 * single canonical logo mapping (`nflLogoUrl` in `@/data/nflPreseason2026`),
 * the same source `@/components/TeamLogo` and the matchup pills use -- no
 * redundant per-feature logo table. `size` defaults to "md" (20px); "sm"
 * (16px) is for denser contexts like the Opponent Last 10 table's Opp QB cell.
 */
export function TeamLogo({ abbr, size = "md" }: { abbr: string; size?: keyof typeof SIZE_CLASS }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-slate-700 text-[7px] font-black text-white", SIZE_CLASS[size])}>
        {abbr.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={nflLogoUrl(abbr)}
      alt=""
      loading="lazy"
      className={cn("shrink-0 object-contain", SIZE_CLASS[size])}
      onError={() => setFailed(true)}
    />
  );
}
