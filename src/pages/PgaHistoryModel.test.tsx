import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PgaHistoryModel from "./PgaHistoryModel";

const schedule = [
  {
    id: "genesis-scottish-open-2026",
    slug: "genesis-scottish-open-2026-picks",
    name: "Genesis Scottish Open",
    shortName: "Genesis Scottish Open",
    courseName: "The Renaissance Club",
    location: "North Berwick, Scotland",
    startDate: "2026-07-09",
    endDate: "2026-07-12",
    dateLabel: "Jul 9",
    eventType: "PGA TOUR Event",
    category: "standard",
    status: "scheduled",
    winner: "",
    dataFile: "genesis-scottish-open-2026.json",
    sourceTour: "PGA TOUR",
    sourceCountry: "USA",
  },
];

const playerStats = [
  {
    player: "Scottie Scheffler",
    sgTotal: 2.1,
    sgOTT: 0.8,
    sgApp: 1.2,
    sgAtG: 0.2,
    sgPutt: 0.1,
    trendRank: 1,
    drivingAccuracy: 65,
    bogeyAvoidance: 0.1,
    birdieBogeyRatio: 1.8,
  },
];

const currentField = {
  tournament: "Genesis Scottish Open",
  tournamentSlug: "genesis-scottish-open-2026-picks",
  localScheduleId: "genesis-scottish-open-2026",
  source: "pga-tour",
  validated: true,
  fieldCount: 1,
  fetchedAt: "2026-07-06T12:00:00.000Z",
  players: ["Scottie Scheffler"],
};

const playerStatsMeta = {
  source: "datagolf",
  syncedAt: "2026-07-06T12:00:00.000Z",
  playerCount: 1,
};

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as Response;
}

function renderPage({
  fieldPayload = currentField,
  metaPayload = playerStatsMeta,
  metaOk = true,
}: {
  fieldPayload?: unknown;
  metaPayload?: unknown;
  metaOk?: boolean;
} = {}) {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.includes("schedule.json")) return Promise.resolve(jsonResponse(schedule));
    if (url.includes("course-weights.json")) return Promise.resolve(jsonResponse([]));
    if (url.includes("player-stats-raw.json")) return Promise.resolve(jsonResponse(playerStats));
    if (url.includes("current-field.json")) return Promise.resolve(jsonResponse(fieldPayload));
    if (url.includes("player-stats-meta.json")) return Promise.resolve(jsonResponse(metaPayload, metaOk));
    if (url.includes("player-history.json")) {
      return Promise.resolve(jsonResponse({ version: 1, source: "test", generatedAt: "2026-07-06", players: [] }));
    }
    if (url.includes("major-history.json")) {
      return Promise.resolve(jsonResponse({ version: 1, source: "test", generatedAt: "2026-07-06", years: [], players: [] }));
    }
    return Promise.resolve(jsonResponse({}, false));
  }));

  return render(
    <MemoryRouter initialEntries={["/pga"]}>
      <PgaHistoryModel />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PgaHistoryModel freshness warnings", () => {
  it("shows a clean PGA data status when field and metadata are current", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("PGA data status:")).toBeInTheDocument());
    expect(screen.getByText(/Field and player-stat metadata are within freshness checks/)).toBeInTheDocument();
    expect(screen.getByText(/Official PGA TOUR field:/)).toBeInTheDocument();
  });

  it("warns when the current field is stale and mismatched", async () => {
    renderPage({
      fieldPayload: {
        ...currentField,
        tournament: "Travelers Championship",
        tournamentSlug: "travelers-championship-2026-picks",
        localScheduleId: "travelers-championship-2026",
        fetchedAt: "2026-06-20T12:00:00.000Z",
      },
    });

    await waitFor(() => expect(screen.getByText("PGA data freshness warning")).toBeInTheDocument());
    expect(screen.getByText(/Current field:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Current field filtering may be disabled or unreliable/).length).toBeGreaterThan(0);
    expect(screen.getByText(/The saved field is for/)).toBeInTheDocument();
  });

  it("warns when player stats metadata is missing", async () => {
    renderPage({ metaPayload: null, metaOk: false });

    await waitFor(() => expect(screen.getByText("PGA data freshness warning")).toBeInTheDocument());
    expect(screen.getByText(/Player stats metadata:/)).toBeInTheDocument();
    expect(screen.getByText(/Displayed model inputs may be stale or unverified/)).toBeInTheDocument();
  });

  it("handles malformed current-field payloads without crashing", async () => {
    renderPage({ fieldPayload: [] });

    await waitFor(() => expect(screen.getByText("PGA data freshness warning")).toBeInTheDocument());
    expect(screen.getByText(/Current field: Payload is unavailable or malformed/)).toBeInTheDocument();
  });
});
