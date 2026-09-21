import { CFB_RANK_TIERS } from "@/lib/cfb/rankTierPalette";

export default function CollegeFootballRankTierKey() {
  return (
    <aside aria-label="National rank color key" className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">National rank</span>
      {CFB_RANK_TIERS.map((tier) => (
        <span
          key={tier.id}
          data-rank-tier-key={tier.id}
          style={tier.style}
          className="whitespace-nowrap px-1.5 py-0.5 text-[10px] font-semibold"
        >
          {tier.label}
        </span>
      ))}
    </aside>
  );
}
