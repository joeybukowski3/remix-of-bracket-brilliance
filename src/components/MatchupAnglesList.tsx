import { useState } from "react";
import type { MatchupAngle } from "@/lib/matchupAngles";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MatchupAnglesListProps {
  angles: MatchupAngle[];
  teamAName: string;
  teamBName: string;
  initialCount?: number;
}

const severityColors = {
  major: "border-l-primary bg-primary/5",
  moderate: "border-l-accent bg-accent/5",
  minor: "border-l-muted-foreground bg-muted/30",
};

const severityBadge = {
  major: "bg-primary/20 text-primary",
  moderate: "bg-accent/20 text-accent-foreground",
  minor: "bg-muted text-muted-foreground",
};

const categoryIcons: Record<string, string> = {
  offense: "🏀",
  defense: "🛡️",
  efficiency: "📊",
  pace: "⚡",
  shooting: "🎯",
  rebounding: "💪",
};

export default function MatchupAnglesList({
  angles,
  teamAName,
  teamBName,
  initialCount = 5,
}: MatchupAnglesListProps) {
  const [expanded, setExpanded] = useState(false);
  const displayAngles = expanded ? angles : angles.slice(0, initialCount);
  const hasMore = angles.length > initialCount;

  if (angles.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No significant matchup angles detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayAngles.map((angle) => (
        <div
          key={angle.id}
          className={`border-l-4 rounded-r-md p-3 ${severityColors[angle.severity]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">{categoryIcons[angle.category] || "📈"}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{angle.title}</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${severityBadge[angle.severity]}`}>
                    {angle.severity}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {angle.description}
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {angle.favors === "teamA" ? (
                <span className="text-xs font-bold text-primary flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {teamAName}
                </span>
              ) : (
                <span className="text-xs font-bold text-destructive flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  {teamBName}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 text-xs font-medium text-primary hover:text-primary/80 py-2 transition-colors"
        >
          {expanded ? (
            <>Show Less <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>Show All {angles.length} Angles <ChevronDown className="w-3 h-3" /></>
          )}
        </button>
      )}
    </div>
  );
}
