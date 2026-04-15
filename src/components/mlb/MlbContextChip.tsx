export default function MlbContextChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-foreground">
      {label}
    </span>
  );
}
