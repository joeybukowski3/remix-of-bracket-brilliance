type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

export default function PgaWeightSlider({ label, value, min, max, step, onChange }: Props) {
  return (
    <div className="min-w-0 rounded-[22px] bg-secondary/65 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <label className="min-w-0 truncate text-sm text-foreground">{label}</label>
        <span className="shrink-0 text-sm font-medium text-primary">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 block h-2 w-full min-w-0 cursor-pointer accent-primary"
      />
    </div>
  );
}
