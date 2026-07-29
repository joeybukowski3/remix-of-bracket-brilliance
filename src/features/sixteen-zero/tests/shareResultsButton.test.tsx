import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareResultsButton } from "../components/ShareResultsButton";
import { buildShareMessage, SHARE_TITLE, SHARE_URL } from "../lib/shareResult";
import type { PickOutcome } from "../engine/draftPickValue";
import type { SeasonResult } from "../types";

function buildResult(overrides: Partial<SeasonResult> = {}): SeasonResult {
  return {
    finalWins: 16,
    finalLosses: 0,
    regularWins: 14,
    regularLosses: 0,
    playoffResult: "League Champion",
    averageWeeklyScore: 120.4,
    startingRoster: {} as SeasonResult["startingRoster"],
    schedule: [],
    ...overrides,
  } as SeasonResult;
}

const bestPick: PickOutcome = {
  playerId: "player-1",
  playerName: "Star Receiver",
  team: "TST",
  round: 1,
  overallPick: 1,
  simulatedContributionPPG: 20,
  projectedContributionPPG: 15,
  pickOutcomeScore: 5,
};

describe("ShareResultsButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- test cleanup of a jsdom-added global
    delete navigator.share;
  });

  it("calls navigator.share with the correct record, result, and URL", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    // @ts-expect-error -- jsdom does not implement navigator.share
    navigator.share = shareMock;
    const result = buildResult();

    render(<ShareResultsButton result={result} bestPick={bestPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Share your 16-0 results" }));

    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    const call = shareMock.mock.calls[0][0];
    expect(call.title).toBe(SHARE_TITLE);
    expect(call.url).toBe(SHARE_URL);
    expect(call.text).toContain("16-0");
    expect(call.text).toContain("League Champion");
    expect(call.text).toContain("Star Receiver");
  });

  it("falls back to clipboard when native share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const result = buildResult();

    render(<ShareResultsButton result={result} bestPick={bestPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Share your 16-0 results" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("16-0");
    expect(copiedText).toContain(SHARE_URL);
  });

  it("omits Best Pick safely when unavailable", () => {
    const result = buildResult();
    const message = buildShareMessage(result, null);
    expect(message).not.toContain("Best pick");
    expect(message).toContain("16-0");
    expect(message).toContain("joeknowsball.com/16-0");
  });

  it("does not show an error when the user cancels the native share dialog", async () => {
    const abortError = new DOMException("Share canceled", "AbortError");
    const shareMock = vi.fn().mockRejectedValue(abortError);
    // @ts-expect-error -- jsdom does not implement navigator.share
    navigator.share = shareMock;
    const result = buildResult();

    render(<ShareResultsButton result={result} bestPick={bestPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Share your 16-0 results" }));

    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share your 16-0 results" })).toBeInTheDocument();
  });

  it("temporarily shows Copied! after the clipboard fallback succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const result = buildResult();

    render(<ShareResultsButton result={result} bestPick={bestPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Share your 16-0 results" }));

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copied!"));
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Share Results"), {
      timeout: 3000,
    });
  });
});
