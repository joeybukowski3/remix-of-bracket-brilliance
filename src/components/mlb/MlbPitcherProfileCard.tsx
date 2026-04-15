import MlbValuePill from "@/components/mlb/MlbValuePill";
import { computeK9, formatIp } from "@/lib/mlb/mlbFormatters";
import type { MlbStarterProfile } from "@/lib/mlb/mlbTypes";

export default function MlbPitcherProfileCard({
  label,
  pitcher,
  align = "left",
}: {
  label: string;
  pitcher: MlbStarterProfile;
  align?: "left" | "right";
}) {
  const k9 = computeK9(pitcher.strikeOuts, pitcher.inningsPitched);
  const alignment = align === "right" ? "text-left sm:text-right" : "text-left";

  return (
    <div className="rounded-[24px] bg-secondary/35 p-4">
      <div className={`flex flex-wrap items-center gap-2 ${align === "right" ? "sm:justify-end" : ""}`}>
        <MlbValuePill>{label}</MlbValuePill>
        <span className="text-xs text-muted-foreground">{pitcher.hand}</span>
      </div>
      <div className={`mt-3 ${alignment}`}>
        <div className="text-lg font-semibold tracking-[-0.03em] text-foreground">{pitcher.name}</div>
        <div className="text-sm text-muted-foreground">{pitcher.record}</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card/80 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">ERA</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{pitcher.era ?? "—"}</div>
        </div>
        <div className="rounded-2xl bg-card/80 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">WHIP</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{pitcher.whip ?? "—"}</div>
        </div>
        <div className="rounded-2xl bg-card/80 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">IP</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{formatIp(pitcher.inningsPitched)}</div>
        </div>
      </div>
      <div className={`mt-3 text-xs text-muted-foreground ${alignment}`}>K/9 {k9 != null ? k9.toFixed(1) : "—"}</div>
    </div>
  );
}
