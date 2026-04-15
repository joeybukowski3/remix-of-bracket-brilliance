export default function MlbLineupMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/45 px-2.5 py-2 text-center">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs font-semibold text-foreground">{value}</div>
    </div>
  );
}
