import { Check, Shuffle } from "lucide-react";

const SLOTS = Array.from({ length: 12 }, (_, index) => index + 1);

interface DraftPositionPickerProps {
  selectedSlot: number | null;
  pickSource: "manual" | "random" | null;
  onSelectSlot: (slot: number) => void;
  onRandomize: () => void;
}

export function DraftPositionPicker({
  selectedSlot,
  pickSource,
  onSelectSlot,
  onRandomize,
}: DraftPositionPickerProps) {
  return (
    <div id="draft-setup" className="scroll-mt-24">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Choose your draft slot
        </span>
        <button
          type="button"
          onClick={onRandomize}
          aria-pressed={pickSource === "random"}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
            pickSource === "random"
              ? "border-cyan-300 bg-cyan-400/10 text-cyan-200"
              : "border-white/15 bg-white/[0.03] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
          }`}
        >
          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
          {pickSource === "random" ? "Randomize again" : "Random"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-2">
        {SLOTS.map((slot) => {
          const selected = selectedSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              data-draft-slot-option={slot}
              aria-pressed={selected}
              aria-label={`Draft position ${slot}${selected ? ", selected" : ""}`}
              onClick={() => onSelectSlot(slot)}
              className={`relative flex h-12 items-center justify-center rounded-lg border-2 text-base font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06101d] sm:h-14 sm:text-lg ${
                selected
                  ? "border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/30"
                  : "border-white/15 bg-white/[0.03] text-slate-200 hover:border-cyan-400/40"
              }`}
            >
              {slot}
              {selected ? (
                <Check
                  className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-slate-950 p-0.5 text-cyan-300"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
