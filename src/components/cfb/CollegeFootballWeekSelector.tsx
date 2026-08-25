import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  weeks: number[];
  value: number;
  onChange: (week: number) => void;
};

export default function CollegeFootballWeekSelector({ weeks, value, onChange }: Props) {
  if (weeks.length === 0) {
    return (
      <p className="text-sm text-slate-500">No schedule weeks available.</p>
    );
  }

  return (
    <Select
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
    >
      <SelectTrigger
        aria-label="Select week"
        className="h-8 w-[9.5rem] rounded border-slate-200 bg-white text-xs font-semibold text-slate-700"
      >
        <SelectValue placeholder="Select week" />
      </SelectTrigger>
      <SelectContent>
        {weeks.map((week) => (
          <SelectItem key={week} value={String(week)}>
            Week {week}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
