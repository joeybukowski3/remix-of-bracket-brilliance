import type { CfbConferenceId } from "@/data/cfb/types";
import { CFB_CONFERENCES, CFB_CONFERENCE_ORDER } from "@/data/cfb/conferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CollegeFootballConferenceLogo from "./CollegeFootballConferenceLogo";

export type CfbConferenceFilter = CfbConferenceId | "all";

type Props = {
  value: CfbConferenceFilter;
  onChange: (conference: CfbConferenceFilter) => void;
};

/**
 * Conference full names + logos come from CFB_CONFERENCES. A conference with
 * no verified logo asset renders name-only (CollegeFootballConferenceLogo
 * never shows a broken image icon).
 */
export default function CollegeFootballConferenceSelector({ value, onChange }: Props) {
  const selected = value !== "all" ? CFB_CONFERENCES[value] : null;

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as CfbConferenceFilter)}
    >
      <SelectTrigger
        aria-label="Select conference"
        className="h-8 w-[14rem] rounded border-slate-200 bg-white text-xs font-semibold text-slate-700"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <CollegeFootballConferenceLogo logo={selected.logo} />
            <span className="truncate">{selected.fullName}</span>
          </span>
        ) : (
          <SelectValue placeholder="All Conferences" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Conferences</SelectItem>
        {CFB_CONFERENCE_ORDER.map((id) => (
          <SelectItem key={id} value={id}>
            <span className="flex min-w-0 items-center gap-1.5">
              <CollegeFootballConferenceLogo logo={CFB_CONFERENCES[id].logo} />
              <span className="truncate">{CFB_CONFERENCES[id].fullName}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
