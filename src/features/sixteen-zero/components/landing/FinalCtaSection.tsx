import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FinalCtaSectionProps {
  onEnterDraftRoom: () => void;
  disabled: boolean;
}

export function FinalCtaSection({ onEnterDraftRoom, disabled }: FinalCtaSectionProps) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
      <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
        Your Draft Starts Now.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-400">
        Choose your draft position, build your roster, and find out whether your team has what it
        takes.
      </p>
      <Button
        size="lg"
        onClick={onEnterDraftRoom}
        disabled={disabled}
        className="mt-7 h-14 min-w-56 bg-cyan-400 px-8 text-base font-black text-slate-950 shadow-lg shadow-cyan-400/20 hover:bg-cyan-300"
      >
        Enter the Draft Room
        <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
      </Button>
      <p className="mt-3 text-xs text-slate-500">Free to Play · No Login Required</p>
    </section>
  );
}
