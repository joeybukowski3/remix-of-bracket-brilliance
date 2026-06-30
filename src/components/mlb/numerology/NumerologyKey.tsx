import { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type KeyTerm = { term: string; definition: string };
type KeyGroup = { title: string; terms: KeyTerm[] };

// Every term here was confirmed against the actual implementation:
// - field/type names from src/types/mlbNumerology.ts (NumerologySignal, DailyProfile)
// - scoring logic from src/lib/numerology/mlbScoreAudit.ts
// - filter chip labels from ExplorerFilters.tsx
// - Model Rating confirmed as the JoeKnowsBall HR Props score, displayed as
//   context only and never used for numerology ranking (see
//   scripts/generate-mlb-numerology.mjs baseballScore() + the page's own
//   methodology note: "Numerology determines every score and ranking.
//   Model Rating is supplemental context only.")
export const NUMEROLOGY_KEY_GROUPS: KeyGroup[] = [
  {
    title: "Daily numbers",
    terms: [
      { term: "Universal Day", definition: "The overall numerical theme of the day. Every player is compared against this same daily number." },
      { term: "Primary Family", definition: "The group of related numbers that receives the strongest positive weight for the day." },
      { term: "Secondary Numbers", definition: "Additional numbers considered relevant to the day, but weighted less than the primary family." },
      { term: "Complement", definition: "A secondary number that balances or supports the main daily number instead of matching it directly." },
      { term: "Countercurrent", definition: "A number that works against the main daily theme. The model treats this as a caution signal rather than a positive match, and may subtract points for it." },
    ],
  },
  {
    title: "Player numbers",
    terms: [
      { term: "Personal Day", definition: "The player's personal number for today, calculated from their birth date and today's date. It shows whether today aligns with that individual player's own cycle." },
      { term: "Life Path", definition: "A long-term core number calculated from the player's full birth date. Think of it as the player's main numerology profile." },
      { term: "Birthday Number", definition: "A simpler birth-date signal based only on the day of the month the player was born, such as being born on the 7th, 16th, or 25th." },
      { term: "Age", definition: "Checks whether the player's current age connects with today's important numbers." },
      { term: "Jersey Number", definition: "Checks whether the player's uniform number matches or relates to today's numerical theme." },
      { term: "Batting Order", definition: "Checks whether the player's position in the lineup (1st, 2nd, 3rd, and so on) creates a numerical match with the day." },
      { term: "Expression Number", definition: "A number derived from the letters of the player's name as it appears on the roster, using a letter-to-number system. It represents the numerical pattern of that name." },
      { term: "Repeated Digit", definition: "A number that appears more than once across today's date or the daily profile, making that signal more noticeable when it also lines up with the player." },
    ],
  },
  {
    title: "Match types",
    terms: [
      { term: "Exact Match", definition: "The player's number directly matches one of today's primary numbers." },
      { term: "Root Match", definition: "The numbers are different on the surface but reduce to the same core digit. For example, 19 and 1 both reduce to 1." },
      { term: "Family Support", definition: "The player's number is not an exact match, but it belongs to the same related number family used by the model." },
      { term: "Contextual Echo", definition: "A weaker supporting connection created by a repeated date digit reinforcing an existing field, such as the jersey number or batting order." },
    ],
  },
  {
    title: "Scores",
    terms: [
      { term: "Numerology Score", definition: "The total score from the numerology signals only. Higher means the player has more or stronger numerical alignments for the day." },
      { term: "Model Rating", definition: "JoeKnowsBall's separate HR Props model score, shown here as extra context. It is not used to calculate the Numerology Score or to rank players on this page." },
    ],
  },
];

const SESSION_STORAGE_KEY = "mlb-numerology-key-open";

function readSessionOpenState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSessionOpenState(open: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, String(open));
  } catch {
    // sessionStorage may be unavailable (private browsing, etc.) - the
    // collapsed-by-default fallback below handles this gracefully.
  }
}

/**
 * Collapsible, beginner-friendly glossary of every numerology term used on
 * the page. Collapsed by default; remembers open/closed state for the
 * current browser session via sessionStorage (best-effort, never throws).
 */
export function NumerologyKey() {
  const [open, setOpen] = useState(readSessionOpenState);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    writeSessionOpenState(next);
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="mt-3 border-t border-[#494454] pt-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-[#cbc3d7] transition hover:bg-[#282a32] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a078ff]"
        >
          <span className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Numerology Key
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-lg border border-[#2a304d] bg-[#0c0e16] p-2.5 text-xs leading-snug">
          {NUMEROLOGY_KEY_GROUPS.map((group) => (
            <div key={group.title} className="mb-3 last:mb-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">{group.title}</p>
              <dl className="space-y-1.5">
                {group.terms.map((item) => (
                  <div key={item.term}>
                    <dt className="font-semibold text-[#d0bcff]">{item.term}</dt>
                    <dd className="text-[#cbc3d7]">{item.definition}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Shared content used by both the desktop sidebar and the mobile sheet/drawer variant. */
export function NumerologyKeyContent() {
  return (
    <div className="space-y-3 text-xs leading-snug">
      {NUMEROLOGY_KEY_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">{group.title}</p>
          <dl className="space-y-1.5">
            {group.terms.map((item) => (
              <div key={item.term}>
                <dt className="font-semibold text-[#d0bcff]">{item.term}</dt>
                <dd className="text-[#cbc3d7]">{item.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
