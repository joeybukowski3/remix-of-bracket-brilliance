import { useState } from "react";
import type { MatchupAngle } from "@/lib/matchupAngles";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";

interface MatchupAnglesListProps {
  angles: MatchupAngle[];
  teamAName: string;
  teamBName: string;
  initialCount?: number;
  teamAColor?: string;
  teamBColor?: string;
}

const severitySurface = {
  major: "bg-primary/[0.07]",
  moderate: "bg-accent/[0.08]",
  minor: "bg-muted/50",
};

const severityBadge = {
  major: "border border-primary/30 bg-primary/15 text-primary",
  moderate: "border border-accent/30 bg-accent/15 text-accent-foreground",
  minor: "border border-border bg-muted text-muted-foreground",
};

const categoryIcons = {
  offense: Trophy,
  defense: Shield,
  efficiency: Sparkles,
  pace: Activity,
  shooting: Target,
  rebounding: TrendingUp,
};

const fallbackAccent = {
  teamA: "#2563eb",
  teamB: "#dc2626",
};

function buildAccentStyle(color: string) {
  return {
    borderColor: color,
    boxShadow: `inset 0 3px 0 ${color}`,
  };
}

export default function MatchupAnglesList({
  angles,
  teamAName,
  teamBName,
  initialCount = 5,
  teamAColor,
  teamBColor,
}: MatchupAnglesListProps) {
  const [expanded, setExpanded] = useState(false);
  const displayAngles = expanded ? angles : angles.slice(0, initialCount);
  const hasMore = angles.length > initialCount;

  if (angles.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No significant matchup angles detected
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {displayAngles.map((angle) => {
          const Icon = categoryIcons[angle.category] ?? Sparkles;
          const favoredTeam = angle.favors === "teamA" ? teamAName : teamBName;
          const favoredTone = angle.favors === "teamA" ? "text-primary" : "text-destructive";
          const favoredBg = angle.favors === "teamA" ? "bg-primary/10" : "bg-destructive/10";
          const accentColor =
            angle.favors === "teamA"
              ? teamAColor ?? fallbackAccent.teamA
              : teamBColor ?? fallbackAccent.teamB;

          return (
            <article
              key={angle.id}
              className={`rounded-2xl border p-3 transition-colors sm:p-3.5 ${severitySurface[angle.severity]}`}
              style={buildAccentStyle(accentColor)}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/80 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold leading-tight text-foreground">
                      {angle.title}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severityBadge[angle.severity]}`}
                    >
                      {angle.severity}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {angle.description}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${favoredBg} ${favoredTone}`}
                >
                  {angle.favors === "teamA" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {favoredTeam}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Edge
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-card/90 py-2 text-xs font-medium text-primary transition-colors hover:bg-secondary/60 hover:text-primary/80"
        >
          {expanded ? (
            <>
              Show Less <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Show All {angles.length} Angles <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
