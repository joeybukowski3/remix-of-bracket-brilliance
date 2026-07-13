import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PGAModel from "./PGAModel";
import type { PgaWeights } from "@/lib/pga/pgaTypes";

vi.mock("@/hooks/usePgaTournamentPlayers", () => ({
  usePgaTournamentPlayers: () => ({ players: [], status: "ready", errorMessage: "" }),
}));

const remoteWeights: PgaWeights = {
  sgApproach: 10,
  par4: 10,
  drivingAccuracy: 10,
  bogeyAvoidance: 10,
  sgAroundGreen: 10,
  trendRank: 10,
  birdie125150: 10,
  sgPutting: 10,
  birdieUnder125: 10,
  courseTrueSg: 10,
};

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("PGAModel preset initialization", () => {
  it("waits for tournament model-config reconciliation before persisting a selection", async () => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        presets: [{
          key: "remote-default",
          label: "Remote Default",
          description: "Tournament model-config default",
          weights: remoteWeights,
        }],
      }),
    } as Response)));

    render(
      <MemoryRouter initialEntries={["/pga/model"]}>
        <PGAModel />
      </MemoryRouter>,
    );

    const select = await screen.findByLabelText("Model preset") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("remote-default"));
    expect(screen.getAllByText("Remote Default").length).toBeGreaterThan(0);
    expect(select.value).not.toBe("custom-model");
  });
});
