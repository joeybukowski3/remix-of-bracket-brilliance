import { areWeightsEqual, getWeightTotal } from "@/lib/pga/pgaModelHelpers";
import { RBC_HERITAGE_WEIGHTS, PGA_WEIGHT_DEFINITIONS } from "@/lib/pga/pgaWeights";
import PgaWeightSection from "@/components/pga/PgaWeightSection";
import PgaWeightSlider from "@/components/pga/PgaWeightSlider";
import type { PgaWeights } from "@/lib/pga/pgaTypes";

type Props = {
  draftWeights: PgaWeights;
  appliedWeights: PgaWeights;
  onWeightChange: (key: keyof PgaWeights, value: number) => void;
  onApply: () => void;
  onReset: () => void;
};

const categories = ["Ball Striking", "Short Game", "Scoring", "Form"] as const;

export default function PgaCustomizationPanel({ draftWeights, appliedWeights, onWeightChange, onApply, onReset }: Props) {
  const draftTotal = getWeightTotal(draftWeights);
  const appliedTotal = getWeightTotal(appliedWeights);
  const hasDraftChanges = !areWeightsEqual(draftWeights, appliedWeights);
  const isPreset = areWeightsEqual(draftWeights, RBC_HERITAGE_WEIGHTS) && areWeightsEqual(appliedWeights, RBC_HERITAGE_WEIGHTS);

  return (
    <div className="rounded-[30px] bg-card p-5 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)] xl:sticky xl:top-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Model Customization</h2>
          <p className="mt-1 text-sm text-muted-foreground">Adjust draft weights, then apply them to refresh the live board.</p>
        </div>
        <div className="rounded-2xl bg-secondary px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Draft Total</p>
          <p className="mt-1 text-sm font-medium text-foreground">{draftTotal} / 100%</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[22px] bg-secondary/65 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Draft Weights</p>
          <p className="mt-1 text-sm font-medium text-foreground">{draftTotal}% total</p>
          <p className="mt-1 text-xs text-muted-foreground">{hasDraftChanges ? "Pending changes not yet applied" : "Draft matches the live model"}</p>
        </div>
        <div className="rounded-[22px] bg-secondary/65 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Applied Weights</p>
          <p className="mt-1 text-sm font-medium text-foreground">{appliedTotal}% total</p>
          <p className="mt-1 text-xs text-muted-foreground">The table and ranking use this live set.</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        Weights are normalized automatically before scoring, so totals do not need to equal exactly 100 to produce a valid board.
      </p>

      <div className="mt-6 space-y-5">
        {categories.map((category) => (
          <PgaWeightSection key={category} title={category}>
            {PGA_WEIGHT_DEFINITIONS.filter((definition) => definition.category === category).map((definition) => (
              <PgaWeightSlider
                key={definition.key}
                label={definition.label}
                value={draftWeights[definition.key]}
                min={definition.min}
                max={definition.max}
                step={definition.step}
                onChange={(value) => onWeightChange(definition.key, value)}
              />
            ))}
          </PgaWeightSection>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={isPreset}
          className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-55"
        >
          Reset Preset
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!hasDraftChanges}
          className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/45"
        >
          Apply Weights
        </button>
      </div>
    </div>
  );
}
