import type { MatchupAdvantageNote } from "@/lib/nfl/matchupComparison";

/** Concise, deterministic list of clear team advantages derived from the comparison. */
export default function MatchupAdvantages({ notes }: { notes: MatchupAdvantageNote[] }) {
  if (notes.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        The teams grade out evenly across the model's core metrics.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note.key} className="flex items-start gap-2 text-sm leading-5 text-slate-700">
          <span aria-hidden className="mt-0.5 text-emerald-600">▸</span>
          <span>
            <span className="sr-only">Advantage {note.teamName}: </span>
            {note.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
