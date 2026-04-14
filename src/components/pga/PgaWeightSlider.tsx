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
    <div className="rounded-[22px] bg-secondary/65 p-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-foreground">{label}</label>
        <span className="text-sm font-medium text-primary">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 h-2 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}
