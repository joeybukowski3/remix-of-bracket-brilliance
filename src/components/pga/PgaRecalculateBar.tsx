type Props = {
  onApply: () => void;
  onReset: () => void;
  hasDraftChanges: boolean;
};

export default function PgaRecalculateBar({ onApply, onReset, hasDraftChanges }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-card p-4 shadow-[0_16px_36px_hsl(var(--foreground)/0.05)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">Refresh the model after adjusting weights.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasDraftChanges ? "Draft edits are ready to apply to the live table." : "Score remains the default sort and rank follows the live score order."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex rounded-full bg-secondary px-4 py-2 text-sm text-foreground transition hover:bg-accent"
        >
          Reset Preset
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!hasDraftChanges}
          className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/45"
        >
          Recalculate Model
        </button>
      </div>
    </div>
  );
}
