import { useState } from "react";
import { ArrowRight, Dices, ListOrdered, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateRandomDraftSlot } from "../engine/createLocalRun";
import { SixteenZeroHeader } from "./SixteenZeroHeader";

const SLOTS = Array.from({ length: 12 }, (_, index) => index + 1);

type Mode = "choose" | "menu" | "random";

export function DraftSlotSelector({
  onConfirm,
}: {
  onConfirm: (draftSlot: number) => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [chosenSlot, setChosenSlot] = useState<number | null>(null);
  const [randomSlot, setRandomSlot] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#06101d] text-white">
      <SixteenZeroHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl shadow-black/20">
          <div className="border-b border-white/10 px-6 py-8 text-center sm:px-10">
            <p className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-black uppercase tracking-[0.24em] text-cyan-300">
              Before the draft
            </p>
            <h1 className="mt-2 text-[clamp(1.5rem,1.2rem+1.5vw,2.5rem)] font-black tracking-tight text-white">
              Pick your draft position
            </h1>
            <p className="mt-2 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] text-slate-400">
              Your slot sets the snake draft order for all 17 rounds. Every slot 1–12
              is equally weighted.
            </p>
          </div>

          {mode === "menu" ? (
            <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-10">
              <button
                type="button"
                data-slot-mode="choose"
                onClick={() => setMode("choose")}
                className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.06]"
              >
                <ListOrdered className="h-8 w-8 text-cyan-300" aria-hidden="true" />
                <span className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-black text-white">
                  Choose draft position
                </span>
                <span className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] text-slate-400">
                  Pick any of the 12 draft slots yourself.
                </span>
              </button>
              <button
                type="button"
                data-slot-mode="random"
                onClick={() => {
                  setRandomSlot(generateRandomDraftSlot());
                  setMode("random");
                }}
                className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.06]"
              >
                <Dices className="h-8 w-8 text-cyan-300" aria-hidden="true" />
                <span className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-black text-white">
                  Random draft position
                </span>
                <span className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] text-slate-400">
                  Draw a random slot from 1–12.
                </span>
              </button>
            </div>
          ) : null}

          {mode === "choose" ? (
            <div className="p-6 sm:p-10">
              <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                {SLOTS.map((slot) => {
                  const selected = chosenSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      data-draft-slot-option={slot}
                      aria-pressed={selected}
                      onClick={() => setChosenSlot(slot)}
                      className={`flex h-16 items-center justify-center rounded-xl border-2 text-[clamp(1.125rem,1rem+0.5vw,1.5rem)] font-black transition ${
                        selected
                          ? "border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/30"
                          : "border-white/15 bg-white/[0.03] text-slate-200 hover:border-cyan-400/40"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMode("menu");
                    setChosenSlot(null);
                  }}
                  className="border-white/15 bg-transparent text-slate-300 hover:bg-white/5"
                >
                  Back
                </Button>
                <Button
                  size="lg"
                  disabled={chosenSlot === null}
                  onClick={() => chosenSlot !== null && onConfirm(chosenSlot)}
                  className="h-12 min-w-48 bg-cyan-400 font-black text-slate-950 hover:bg-cyan-300"
                >
                  {chosenSlot === null ? "Select a slot" : `Start Draft from Slot ${chosenSlot}`}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "random" && randomSlot !== null ? (
            <div className="p-6 text-center sm:p-10">
              <p className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-bold uppercase tracking-[0.2em] text-slate-500">
                Your assigned slot
              </p>
              <div
                data-random-slot-value={randomSlot}
                className="mx-auto mt-4 flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-cyan-300 bg-cyan-400 text-[clamp(2rem,1.6rem+1.6vw,3rem)] font-black text-slate-950 shadow-lg shadow-cyan-400/30"
              >
                {randomSlot}
              </div>
              <div className="mt-6 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setRandomSlot(generateRandomDraftSlot())}
                  className="border-white/15 bg-transparent text-slate-300 hover:bg-white/5"
                >
                  <Shuffle className="mr-2 h-4 w-4" />
                  Randomize again
                </Button>
                <Button
                  size="lg"
                  onClick={() => onConfirm(randomSlot)}
                  className="h-12 min-w-48 bg-cyan-400 font-black text-slate-950 hover:bg-cyan-300"
                >
                  Start Draft from Slot {randomSlot}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMode("menu");
                  setRandomSlot(null);
                }}
                className="mt-4 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-semibold text-slate-500 hover:text-slate-300"
              >
                Back
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
