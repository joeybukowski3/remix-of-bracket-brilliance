import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import StevePoolDashboard, { StevePoolDashboardContent } from "@/pages/StevePoolDashboard";
import {
  CHATGPT_POOL_DATA_PATH,
  parseChatGptPoolData,
  type ChatGptPoolData,
  type MainPoolWager,
} from "@/lib/nfl/chatGptPool";

const ROOT = process.cwd();
const CANONICAL_DATA = JSON.parse(
  readFileSync(join(ROOT, "public", "data", "nfl", "chatgpt-pool-2026.json"), "utf8"),
) as unknown;
const INITIAL_DATA = parseChatGptPoolData(CANONICAL_DATA)!;

const SAMPLE_WAGER: MainPoolWager = {
  week: 1,
  date: "2026-09-10",
  matchup: "DAL at PHI",
  selection: "PHI",
  poolLine: -2.5,
  marketLineAtDecision: -3.5,
  closingMarketLine: -4,
  jkbProjectedSpread: -4.2,
  chatgptEstimatedCoverProbability: 0.56,
  confidence: "HIGH",
  wager: 400,
  bankrollBefore: 3600,
  bankrollAfter: 4000,
  bankrollPctRisked: 400 / 3600,
  status: "FINAL",
  result: "WIN",
  pointsResult: 400,
  finalScore: "PHI 27, DAL 20",
  notes: "Closing market confirmed the pool-line advantage.",
  decisionReason: "Frozen pool line offered one point of market value at decision time.",
  poolLineValue: 1,
  selectionRole: "FAVORITE",
  venue: "HOME",
  beatClosingLine: true,
  agreesWithJkb: true,
};

function withWagers(wagers: MainPoolWager[]): ChatGptPoolData {
  return {
    ...INITIAL_DATA,
    mainPool: {
      ...INITIAL_DATA.mainPool,
      currentBankroll: 4000,
      totalPointsWagered: wagers.reduce((sum, wager) => sum + wager.wager, 0),
      netPoints: 400,
      atsWins: 1,
      atsWinPct: 1,
      roiOnPointsWagered: 1,
    },
    mainPoolWagers: wagers,
  };
}

function renderContent(data = INITIAL_DATA) {
  return render(<StevePoolDashboardContent data={data} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StevePoolDashboard canonical data", () => {
  it("accepts the checked-in 2026 ledger and rejects malformed input without throwing", () => {
    expect(INITIAL_DATA.entryName).toBe("JoeKnowsBall.com");
    expect(INITIAL_DATA.mainPool.currentBankroll).toBe(3600);
    expect(parseChatGptPoolData({ season: 2026 })).toBeNull();
    expect(parseChatGptPoolData({ ...INITIAL_DATA, mainPoolWagers: [{ status: "BROKEN" }] })).toBeNull();
  });
});

describe("StevePoolDashboard rendering", () => {
  it("renders at /steve, loads the canonical source, and installs noindex/nofollow metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => CANONICAL_DATA,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/steve"]}>
        <Routes>
          <Route path="/steve" element={<StevePoolDashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "ChatGPT Pool Entry" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(CHATGPT_POOL_DATA_PATH, { cache: "no-store" });
    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    });
  });

  it("displays the 3,600 starting bankroll and honest null placement values", () => {
    renderContent();
    expect(screen.getByText("Started 3,600")).toBeInTheDocument();
    const status = screen.getByRole("heading", { name: "Main Pool Status" }).closest("section")!;
    const rankLabel = within(status).getByText("Current Rank");
    expect(rankLabel.nextElementSibling).toHaveTextContent("—");
    expect(within(status).getByText("Leader TBD")).toBeInTheDocument();
    expect(within(status).getByText("Cutoff TBD")).toBeInTheDocument();
  });

  it("shows clean Main Pool and Side Pool empty states before Week 1 picks exist", () => {
    renderContent();
    expect(screen.getByText("No Week 1 wagers yet")).toBeInTheDocument();
    expect(screen.getByText("The season ledger is ready")).toBeInTheDocument();
    expect(screen.getByText("No Side Pool prediction yet")).toBeInTheDocument();
  });

  it("renders a complete sample wager in the running ledger", () => {
    renderContent(withWagers([SAMPLE_WAGER]));
    const ledger = screen.getByRole("region", { name: "Full season main pool wager ledger" });
    expect(within(ledger).getByText(/PHI 27, DAL 20/)).toBeInTheDocument();
    expect(within(ledger).getByText("56.0%")).toBeInTheDocument();
    expect(within(ledger).getByText("+400")).toBeInTheDocument();
    expect(within(ledger).getByText("Decision notes")).toBeInTheDocument();
  });

  it("renders every wager decision and result state", () => {
    const statuses = ["LEAN", "OFFICIAL", "LOCKED", "FINAL"] as const;
    const results = ["WIN", "LOSS", "PUSH", "PENDING"] as const;
    const wagers = statuses.map((status, index) => ({
      ...SAMPLE_WAGER,
      selection: `TEAM ${index + 1}`,
      status,
      result: results[index],
      pointsResult: results[index] === "WIN" ? 400 : results[index] === "LOSS" ? -400 : results[index] === "PUSH" ? 0 : null,
      bankrollAfter: results[index] === "PENDING" ? null : 3600,
    }));
    renderContent(withWagers(wagers));

    for (const status of statuses) expect(screen.getAllByText(status).length).toBeGreaterThan(0);
    for (const result of results) expect(screen.getAllByText(result).length).toBeGreaterThan(0);
  });

  it("contains no Veteran Pool content", () => {
    renderContent();
    expect(document.body).not.toHaveTextContent(/Veteran Pool/i);
    expect(JSON.stringify(CANONICAL_DATA)).not.toMatch(/Veteran Pool/i);
  });
});

describe("StevePoolDashboard discovery isolation", () => {
  it("registers the direct route outside the NFL platform layout", () => {
    const app = readFileSync(join(ROOT, "src", "App.tsx"), "utf8");
    expect(app).toContain('path="/steve"');
    expect(app).toContain('lazy(() => import("./pages/StevePoolDashboard"))');
    const nflLayoutEnd = app.indexOf('</Route>\n          <Route element={<NflPlatformLayout />}>');
    expect(app.indexOf('path="/steve"')).toBeGreaterThan(nflLayoutEnd);
  });

  it("keeps /steve out of visible navigation and sitemap sources", () => {
    const publicDiscoveryFiles = [
      "src/components/layout/SiteHeader.tsx",
      "src/components/layout/SiteFooter.tsx",
      "src/components/nfl/NflSectionSidebar.tsx",
      "src/lib/nfl/sectionNav.ts",
      "scripts/generate-seo-files.mjs",
      "public/sitemap.xml",
      "public/robots.txt",
    ];

    for (const relative of publicDiscoveryFiles) {
      expect(readFileSync(join(ROOT, relative), "utf8"), relative).not.toContain("/steve");
    }
  });
});
