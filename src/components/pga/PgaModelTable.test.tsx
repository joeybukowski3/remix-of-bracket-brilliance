import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PgaModelControls } from "./PgaModelTable";
import {
  PGA_CUSTOM_MODEL_KEY,
  PGA_TOP_20_PROFILE_KEY,
  PGA_TOP_20_PROFILE_WEIGHTS,
  withPermanentPgaPresets,
} from "@/lib/pga/pgaWeights";
import type { PgaWeights } from "@/lib/pga/pgaTypes";

const defaultWeights: PgaWeights = {
  sgApproach: 22,
  par4: 14,
  drivingAccuracy: 11,
  bogeyAvoidance: 11,
  sgAroundGreen: 9,
  trendRank: 11,
  birdie125150: 7,
  sgPutting: 6,
  birdieUnder125: 3,
  courseTrueSg: 6,
};

const presets = withPermanentPgaPresets([{
  key: "balanced",
  label: "Balanced",
  description: "Default model",
  weights: defaultWeights,
}]);

function renderControls({
  selectedPreset = PGA_CUSTOM_MODEL_KEY,
  draftWeights = defaultWeights,
  appliedWeights = defaultWeights,
} = {}) {
  const handlers = {
    onPresetSelect: vi.fn(),
    onWeightChange: vi.fn(),
    onApply: vi.fn(),
    onNormalize: vi.fn(),
    onLoadTop20: vi.fn(),
    onReset: vi.fn(),
  };
  render(
    <PgaModelControls
      draftWeights={draftWeights}
      appliedWeights={appliedWeights}
      selectedPreset={selectedPreset}
      activeModelLabel={selectedPreset === PGA_CUSTOM_MODEL_KEY ? "Custom Model" : "Top 20 Profile"}
      presetOptions={presets}
      {...handlers}
    />,
  );
  return handlers;
}

describe("PgaModelControls", () => {
  it("shows Top 20 Profile and Custom Model in the selector", () => {
    renderControls({ selectedPreset: PGA_TOP_20_PROFILE_KEY });
    const select = screen.getByLabelText("Model preset") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.text)).toEqual(["Balanced", "Top 20 Profile", "Custom Model"]);
    expect(screen.getByText(/comparative model rating/i)).toBeInTheDocument();
    expect(screen.queryByText(/guaranteed outcome/i)).not.toBeInTheDocument();
  });

  it("exposes compact custom actions and every registered weight on desktop and mobile-sized viewports", () => {
    for (const width of [1280, 390]) {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      const { unmount } = render(
        <PgaModelControls
          draftWeights={defaultWeights}
          appliedWeights={defaultWeights}
          selectedPreset={PGA_CUSTOM_MODEL_KEY}
          activeModelLabel="Custom Model"
          presetOptions={presets}
          onPresetSelect={vi.fn()}
          onWeightChange={vi.fn()}
          onApply={vi.fn()}
          onNormalize={vi.fn()}
          onLoadTop20={vi.fn()}
          onReset={vi.fn()}
        />,
      );
      expect(screen.getByText("Edit Weights")).toBeInTheDocument();
      expect(screen.getAllByRole("spinbutton")).toHaveLength(10);
      expect(screen.getByRole("button", { name: "Load Top 20" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Normalize" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset Default" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
      unmount();
    }
  });

  it("accepts valid edits and rejects negative, nonnumeric, and over-100 input", () => {
    const handlers = renderControls();
    const input = screen.getByLabelText("SG: Approach weight") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "30" } });
    expect(handlers.onWeightChange).toHaveBeenCalledWith("sgApproach", 30);

    fireEvent.change(input, { target: { value: "-1" } });
    fireEvent.change(input, { target: { value: "not-a-number" } });
    fireEvent.change(input, { target: { value: "101" } });
    expect(handlers.onWeightChange).toHaveBeenCalledTimes(1);
  });

  it("warns on a non-100 total and wires Normalize, Reset, Load, and Apply", () => {
    const draftWeights = { ...defaultWeights, trendRank: 21 };
    const handlers = renderControls({ draftWeights });

    expect(screen.getByRole("alert")).toHaveTextContent("110%");
    fireEvent.click(screen.getByRole("button", { name: "Normalize" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Default" }));
    fireEvent.click(screen.getByRole("button", { name: "Load Top 20" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(handlers.onNormalize).toHaveBeenCalledOnce();
    expect(handlers.onReset).toHaveBeenCalledOnce();
    expect(handlers.onLoadTop20).toHaveBeenCalledOnce();
    expect(handlers.onApply).toHaveBeenCalledOnce();
    expect(Object.values(PGA_TOP_20_PROFILE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });
});
