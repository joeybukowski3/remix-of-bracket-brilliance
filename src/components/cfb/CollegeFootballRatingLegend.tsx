import { CFB_RATING_TIERS } from "@/lib/cfb/ratingPresentation";
import { cn } from "@/lib/utils";

export default function CollegeFootballRatingLegend() {
  return (
    <aside
      aria-label="College Football rating color key"
      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Rating key
        </span>
        {CFB_RATING_TIERS.map((tier) => (
          <span
            key={tier.band}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold",
              tier.className,
            )}
          >
            {tier.label} <span className="opacity-75">{tier.range}</span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] font-medium text-slate-500">
        SOS: <span className="text-rose-800">#1 Hardest</span> →{" "}
        <span className="text-emerald-800">#138 Easiest</span>
      </p>
    </aside>
  );
}
