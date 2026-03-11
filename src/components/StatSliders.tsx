import { Slider } from "@/components/ui/slider";
import type { StatWeight } from "@/data/ncaaTeams";

interface StatSlidersProps {
  weights: StatWeight[];
  onWeightChange: (key: string, value: number) => void;
  compact?: boolean;
}

export default function StatSliders({ weights, onWeightChange, compact }: StatSlidersProps) {
  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
      {weights.map((w) => (
        <div key={w.key} className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground truncate mr-2">
              {w.label}
            </span>
            <span className="text-xs font-bold text-primary tabular-nums">
              {w.weight}
            </span>
          </div>
          <Slider
            value={[w.weight]}
            min={0}
            max={100}
            step={5}
            onValueChange={([val]) => onWeightChange(w.key, val)}
            className="w-full"
          />
        </div>
      ))}
    </div>
  );
}
