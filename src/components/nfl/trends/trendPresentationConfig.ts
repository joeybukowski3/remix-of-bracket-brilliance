import type { LucideIcon } from "lucide-react";
import { BookOpen, Info, Star } from "lucide-react";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { NFL_GUIDE_TEAM_BY_ABBR } from "@/lib/nfl/guide2026";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import { nflTeamColor } from "@/lib/nfl/nflTeamColor";
import type { TrendTier } from "@/lib/nfl/situationalTrends";

const FALLBACK_TEAM_COLOR = "#334155";

export const TREND_TIER_PRESENTATION: Record<TrendTier, {
  Icon: LucideIcon;
  badge: string;
  card: string;
  header: string;
  label: string;
}> = {
  NOTEWORTHY: {
    Icon: Star,
    badge: "border-amber-300 bg-amber-100 text-amber-950",
    card: "border-slate-400 bg-amber-50/30",
    header: "bg-slate-950 text-white",
    label: "text-amber-300",
  },
  CONTEXTUAL: {
    Icon: Info,
    badge: "border-sky-300 bg-sky-100 text-sky-950",
    card: "border-sky-300 bg-white",
    header: "bg-sky-50 text-slate-950",
    label: "text-sky-800",
  },
  CLASSIC_ANGLE: {
    Icon: BookOpen,
    badge: "border-slate-300 bg-slate-100 text-slate-800",
    card: "border-slate-300 bg-white",
    header: "bg-slate-100/80 text-slate-950",
    label: "text-slate-700",
  },
};

export function resolveTrendTeam(abbr: string, name?: string) {
  const normalized = normalizeNflTeamAbbr(abbr) ?? abbr.trim().toLowerCase();
  const metadata = NFL_GUIDE_TEAM_BY_ABBR.get(normalized);
  return {
    abbr: normalized.toUpperCase(),
    name: name ?? metadata?.team ?? abbr.toUpperCase(),
    color: nflTeamColor(normalized) ?? FALLBACK_TEAM_COLOR,
    logo: nflLogoUrl(normalized),
  };
}
