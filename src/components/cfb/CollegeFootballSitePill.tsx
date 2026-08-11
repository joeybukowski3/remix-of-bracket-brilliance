import { cn } from "@/lib/utils";
import {
  getCfbSitePillClass,
  type CfbScheduleSite,
} from "@/lib/cfb/schedulePresentation";

export default function CollegeFootballSitePill({ site }: { site: CfbScheduleSite }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        getCfbSitePillClass(site),
      )}
    >
      {site}
    </span>
  );
}
