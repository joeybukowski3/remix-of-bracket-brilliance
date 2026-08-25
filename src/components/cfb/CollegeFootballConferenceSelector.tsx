import type { CfbConferenceId } from "@/data/cfb/types";
import { CFB_CONFERENCES, CFB_CONFERENCE_ORDER } from "@/data/cfb/conferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CfbConferenceFilter = CfbConferenceId | "all";

type Props = {
  value: CfbConferenceFilter;
  onChange: (conference: CfbConferenceFilter) => void;
};

/**
 * Conference full names come from CFB_CONFERENCES (no conference logo assets
 * exist in the repo yet — falls back to name-only; see redesign follow-up).
 */
export default function CollegeFootballConferenceSelector({ value, onChange }: Props) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as CfbConferenceFilter)}
    >
      <SelectTrigger
        aria-label="Select conference"
        className="h-8 w-[14rem] rounded border-slate-200 bg-white text-xs font-semibold text-slate-700"
      >
        <SelectValue placeholder="All Conferences" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Conferences</SelectItem>
        {CFB_CONFERENCE_ORDER.map((id) => (
          <SelectItem key={id} value={id}>
            {CFB_CONFERENCES[id].fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
