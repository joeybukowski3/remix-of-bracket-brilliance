import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StarterPropDirection } from "@/types/nfl/performance";
import { directionTone } from "./directionTone";

export function DirectionBadge({ direction, projected = false }: { direction: StarterPropDirection; projected?: boolean }) {
  const Icon = direction === "OVER" ? ArrowUp : direction === "UNDER" ? ArrowDown : Minus;
  return <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", directionTone[direction].badge)}><Icon className="h-3 w-3" aria-hidden="true" />{projected && <span>Projected</span>}{direction === "NEUTRAL" ? "Neutral" : direction === "OVER" ? "Over" : "Under"}</span>;
}
