import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateRandomDraftSlot } from "../engine/createLocalRun";
import { DraftPositionPicker } from "./landing/DraftPositionPicker";
import { FeatureCardsSection } from "./landing/FeatureCardsSection";
import { FinalCtaSection } from "./landing/FinalCtaSection";
import { HeroProductPreview } from "./landing/HeroProductPreview";
import { HowItWorksSection } from "./landing/HowItWorksSection";
import { LandingFooter } from "./landing/LandingFooter";
import { ProductPreviewSection } from "./landing/ProductPreviewSection";
import { QuickValueStrip } from "./landing/QuickValueStrip";
import { SeasonProgressionSection } from "./landing/SeasonProgressionSection";
import { SixteenZeroHeader } from "./SixteenZeroHeader";

export function LandingHero({
  onStart,
  initializing,
}: {
  onStart: (draftSlot: number) => void;
  initializing: boolean;
}) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [pickSource, setPickSource] = useState<"manual" | "random" | null>(null);

  const handleSelectSlot = (slot: number) => {
    setSelectedSlot(slot);
    setPickSource("manual");
  };

  const handleRandomize = () => {
    setSelectedSlot(generateRandomDraftSlot());
    setPickSource("random");
  };

  const handleEnterDraftRoom = () => {
    if (selectedSlot === null) {
      document.getElementById("draft-setup")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onStart(selectedSlot);
  };

  return (
    <div className="min-h-screen bg-[#06101d] text-white">
      <SixteenZeroHeader
        eyebrow={
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-black tracking-tight text-white">16-0</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
              2026 Fantasy Draft Simulator
            </span>
          </span>
        }
      />

      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,211,238,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.08) 1px, transparent 1px), radial-gradient(circle at 70% 30%, rgba(14,165,233,.3), transparent 36%)",
              backgroundSize: "72px 72px, 72px 72px, auto",
            }}
          />
          <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_400px] lg:py-20">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
                2026 Fantasy Football Projections
              </p>
              <h1 className="mt-4 text-[clamp(2.25rem,4vw+1rem,4rem)] font-black leading-[1.05] tracking-tight text-white">
                Can You Build the <span className="text-cyan-300">Perfect</span> Fantasy Team?
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Draft a 17-player roster against 11 CPU teams, simulate the full season, and see
                whether your team can finish 16-0.
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Powered by 2026 Fantasy Football Projections
              </p>

              <div className="mt-7 max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <DraftPositionPicker
                  selectedSlot={selectedSlot}
                  pickSource={pickSource}
                  onSelectSlot={handleSelectSlot}
                  onRandomize={handleRandomize}
                />
              </div>

              <Button
                size="lg"
                onClick={handleEnterDraftRoom}
                disabled={initializing}
                className="mt-6 h-14 min-w-48 bg-cyan-400 px-8 text-base font-black text-slate-950 shadow-lg shadow-cyan-400/20 hover:bg-cyan-300"
              >
                {initializing ? "Opening draft…" : "Start Draft"}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Button>
              <p className="mt-3 text-xs text-slate-500">
                Free to Play · No Account Required · No Pick Clock
              </p>
            </div>

            <HeroProductPreview />
          </div>
        </section>

        <QuickValueStrip />
        <HowItWorksSection />
        <ProductPreviewSection />
        <FeatureCardsSection />
        <SeasonProgressionSection />
        <FinalCtaSection onEnterDraftRoom={handleEnterDraftRoom} disabled={initializing} />
      </main>

      <LandingFooter />
    </div>
  );
}
