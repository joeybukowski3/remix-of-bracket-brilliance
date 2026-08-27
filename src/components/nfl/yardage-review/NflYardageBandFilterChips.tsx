import { cn } from "@/lib/utils";
import type { NflMatchupScoreBand } from "@/lib/nfl/props/review/yardageMarketJoin";
import { matchupScoreHeatTone, weeklyHeatStyle, weeklyHeatTextClass } from "@/lib/nfl/props/review/yardageHeat";

export type NflYardageBandFilterOption = "all" | NflMatchupScoreBand;

const BAND_FILTER_OPTIONS: readonly NflYardageBandFilterOption[] = ["all", "elite", "strong", "average", "weak", "poor"];

/**
 * The Matchup Band filter is the one filter group whose options map directly
 * onto an existing heat scale (the Matchup Score band each option names), so
 * -- unlike the other filter groups, which get one uniform group accent --
 * each pill here is tinted with its own band's site-wide heat tone
 * (matchupScoreHeatTone, same mapping the Matchup Score tile uses). "All
 * Bands" stays neutral. Selected = filled heat color; unselected = a light
 * tint/border in that same tone so the row still reads as one group.
 */
export function NflYardageBandFilterChips({
  value,
  onChange,
  formatOption,
}: {
  value: NflYardageBandFilterOption;
  onChange: (next: NflYardageBandFilterOption) => void;
  formatOption: (option: NflYardageBandFilterOption) => string;
}) {
  return (
    <div role="group" aria-label="Matchup band" className="flex flex-wrap gap-1.5">
      {BAND_FILTER_OPTIONS.map((option) => {
        const selected = option === value;
        const tone = option === "all" ? "neutral" : matchupScoreHeatTone(option);
        const textClass = weeklyHeatTextClass(tone);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={selected}
            className={cn(
              "rounded border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
              selected
                ? "shadow-sm"
                : cn(textClass, textClass.replace("text-", "border-"), "bg-white/70 hover:bg-white"),
            )}
            style={selected ? weeklyHeatStyle(tone) : undefined}
          >
            {formatOption(option)}
          </button>
        );
      })}
    </div>
  );
}
