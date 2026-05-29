import MlbValuePill from "@/components/mlb/MlbValuePill";
import type { MlbPropAngleData } from "@/lib/mlb/mlbTypes";

export default function MlbPropAngleCard({ angle }: { angle: MlbPropAngleData }) {
  return (
    <article className="rounded-xl bg-secondary/25 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{angle.title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{angle.rationale}</p>
        </div>
        {angle.tag ? <MlbValuePill>{angle.tag}</MlbValuePill> : null}
      </div>
      <ul className="mt-2 space-y-1 text-[11px] text-foreground">
        {angle.signals.map((signal) => (
          <li key={signal} className="rounded-lg bg-card/80 px-2 py-1 leading-5">
            {signal}
          </li>
        ))}
      </ul>
    </article>
  );
}
