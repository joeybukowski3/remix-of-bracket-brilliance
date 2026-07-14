import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNflV03Artifacts } from "@/hooks/useNflV03Artifacts";
import NflV03Review from "@/pages/NflV03Review";
import {
  NFL_V03_REVIEW_SEASONS,
  buildCrossArtifactChecks,
  sortFullSeasonTeams,
  validateNflV03ReviewArtifact,
  type NflV03ArtifactKind,
  type NflV03ReviewSeason,
} from "@/lib/nfl/v03Review";

const ROOT = resolve(__dirname, "../../..");
const NFL_DATA = join(ROOT, "public", "data", "nfl");
const HIDDEN_ROUTE = "/internal/jkb-nfl-v03-review-7f3c9a";
const FILENAMES = [
  "full-season-team-metrics.json",
  "final-eight-team-metrics.json",
  "preseason-power-ratings.json",
  "context-flags.json",
  "manual-adjustments.json",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

async function committedArtifactFetch(input: RequestInfo | URL): Promise<Response> {
  const requestPath = String(input);
  const relative = requestPath.replace(/^\/data\/nfl\//, "").replaceAll("/", "\\");
  const path = join(NFL_DATA, relative);
  if (!existsSync(path)) return new Response("not found", { status: 404 });
  return new Response(readFileSync(path, "utf8"), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function installCommittedFetch() {
  vi.stubGlobal("fetch", vi.fn(committedArtifactFetch));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NFL v0.3 internal review validation and loading", () => {
  it("validates every committed Stage-1 artifact without mutating source input", () => {
    const matrix: Array<[NflV03ReviewSeason, NflV03ArtifactKind, string]> = [];
    for (const season of NFL_V03_REVIEW_SEASONS) {
      matrix.push([season, "fullSeason", FILENAMES[0]], [season, "finalEight", FILENAMES[1]], [season, "contextFlags", FILENAMES[3]]);
      if (season >= 2023) matrix.push([season, "preseason", FILENAMES[2]], [season, "manualAdjustments", FILENAMES[4]]);
    }
    expect(matrix).toHaveLength(23);
    for (const [season, kind, filename] of matrix) {
      const path = join(NFL_DATA, String(season), filename);
      const source = readFileSync(path, "utf8");
      const json: unknown = JSON.parse(source);
      const snapshot = JSON.stringify(json);
      const artifact = validateNflV03ReviewArtifact(kind, season, json, path);
      expect(artifact._meta).toMatchObject({ modelVersion: "nfl-power-v0.3.0", validationStatus: "stage-1", season });
      expect(JSON.stringify(json)).toBe(snapshot);
      expect(readFileSync(path, "utf8")).toBe(source);
    }
  });

  it("hard-fails malformed shapes, inconsistent metrics, and non-finite numbers", () => {
    const path = join(NFL_DATA, "2025", FILENAMES[0]);
    const source = JSON.parse(readFileSync(path, "utf8"));
    const malformed = structuredClone(source);
    malformed.teams = "bad";
    expect(() => validateNflV03ReviewArtifact("fullSeason", 2025, malformed, path)).toThrow(/teams must be an array/);
    const keys = structuredClone(source);
    delete keys.teams[0].metrics.netEpaPerPlay;
    expect(() => validateNflV03ReviewArtifact("fullSeason", 2025, keys, path)).toThrow(/metric-key set/);
    const nonFinite = structuredClone(source);
    nonFinite.teams[0].rawComposite = Number.POSITIVE_INFINITY;
    expect(() => validateNflV03ReviewArtifact("fullSeason", 2025, nonFinite, path)).toThrow(/non-finite/);
  });

  it("loads all supported seasons and preserves honest missing artifact types", async () => {
    for (const season of NFL_V03_REVIEW_SEASONS) {
      const data = await loadNflV03Artifacts(season, committedArtifactFetch);
      expect(data.season).toBe(season);
      expect(Object.isFrozen(data)).toBe(true);
      expect(data.slots.fullSeason.status).toBe("loaded");
      expect(data.slots.finalEight.status).toBe("loaded");
      expect(data.slots.contextFlags.status).toBe("loaded");
      if (season === 2022) {
        expect(data.slots.preseason.status).toBe("missing");
        expect(data.slots.manualAdjustments.status).toBe("missing");
      } else {
        expect(data.slots.preseason.status).toBe("loaded");
        expect(data.slots.manualAdjustments.status).toBe("loaded");
      }
    }
  });

  it("returns a file-specific error without falling back", async () => {
    const fetcher = async (input: RequestInfo | URL) => String(input).endsWith(FILENAMES[1])
      ? new Response("failed", { status: 503 })
      : committedArtifactFetch(input);
    const data = await loadNflV03Artifacts(2025, fetcher);
    expect(data.slots.finalEight).toMatchObject({ status: "error" });
    expect(data.slots.finalEight.error).toContain(`/data/nfl/2025/${FILENAMES[1]}`);
    expect(data.artifacts.finalEight).toBeUndefined();
  });

  it("sorts deterministically without mutating artifact rows", async () => {
    const data = await loadNflV03Artifacts(2025, committedArtifactFetch);
    const rows = data.artifacts.fullSeason?.teams ?? [];
    const snapshot = JSON.stringify(rows);
    const first = sortFullSeasonTeams(rows, "adjustedComposite", "desc").map((row) => row.abbr);
    const second = sortFullSeasonTeams(rows, "adjustedComposite", "desc").map((row) => row.abbr);
    expect(first).toEqual(second);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(rows).toHaveLength(32);
  });

  it("reports the complete metadata and 2026 empty-state consistency checks", async () => {
    const complete = await loadNflV03Artifacts(2025, committedArtifactFetch);
    expect(buildCrossArtifactChecks(complete.artifacts, 2025).every((check) => check.pass)).toBe(true);
    const empty = await loadNflV03Artifacts(2026, committedArtifactFetch);
    const checks = buildCrossArtifactChecks(empty.artifacts, 2026);
    expect(checks.find((check) => check.label === "2026 honest empty state")?.pass).toBe(true);
    expect(empty.artifacts.fullSeason?.teams).toEqual([]);
    expect(empty.artifacts.finalEight?.teams).toEqual([]);
    expect(empty.artifacts.preseason?.ratings).toHaveLength(32);
  });
});

describe("NFL v0.3 hidden route and public isolation", () => {
  it("registers only the exact lazy hidden route outside the NFL layout", () => {
    const app = readFileSync(join(ROOT, "src", "App.tsx"), "utf8");
    expect(app).toContain(`path="${HIDDEN_ROUTE}"`);
    expect(app).toContain('lazy(() => import("./pages/NflV03Review"))');
    expect(app).not.toContain('path="/admin/nfl/power-ratings"');
    expect(app.indexOf(`path="${HIDDEN_ROUTE}"`)).toBeGreaterThan(app.indexOf("</Route>\n          <Route"));
  });

  it("keeps the hidden route out of navigation, sitemap, footer, and public metadata sources", () => {
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
      expect(readFileSync(join(ROOT, relative), "utf8"), relative).not.toContain(HIDDEN_ROUTE);
    }
  });

  it("allows Stage-1 artifact filenames only in the dedicated internal loader", () => {
    const references = sourceFiles(join(ROOT, "src"))
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => FILENAMES.some((filename) => readFileSync(path, "utf8").includes(filename)))
      .map((path) => basename(path));
    expect(references).toEqual(["useNflV03Artifacts.ts"]);
  });

  it("leaves the public preseason source and all public NFL consumers untouched by the feature diff", () => {
    const changed = readFileSync(join(ROOT, ".git"), "utf8");
    expect(changed).toContain("gitdir:");
    const page = readFileSync(join(ROOT, "src", "pages", "NflV03Review.tsx"), "utf8");
    expect(page).not.toContain("nflPreseason2026");
    expect(page).not.toContain("NflPlatformLayout");
  });

  it("declares exact noindex/nofollow metadata, warning copy, and responsive containment", () => {
    const page = readFileSync(join(ROOT, "src", "pages", "NflV03Review.tsx"), "utf8");
    expect(page).toContain('robots.content = "noindex, nofollow"');
    expect(page).toContain('document.title = "Internal NFL Model Review"');
    expect(page).toContain("Hidden URL only — not authentication");
    expect(page).toContain("overflow-x-clip");
    expect(page).toContain("overflow-x-auto");
    expect(page).toContain("data-responsive-table");
    expect(page).toContain('scope="col"');
    expect(page).toContain('aria-label="Search teams"');
    expect(page).not.toMatch(/\b(?:betting|odds?|moneyline|spread|markets?|picks?|probabilit(?:y|ies)|edge)\b/i);
  });
});

describe("NFL v0.3 internal review rendering and interactions", () => {
  it("renders loading, warning, all supported seasons, and overview constants", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    expect(screen.getByText(/Loading Stage-1 artifact files/)).toBeInTheDocument();
    expect(screen.getByText("Hidden URL only — not authentication")).toBeInTheDocument();
    const seasonSelect = screen.getByLabelText("Review season");
    expect(within(seasonSelect).getAllByRole("option").map((option) => option.textContent)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
    expect(await screen.findByText("Completed REG games")).toBeInTheDocument();
    expect(screen.getByText(/0.733/)).toBeInTheDocument();
    expect(screen.getAllByText(/lambda 0/).length).toBeGreaterThan(0);
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("renders full-season teams, accessible headings, filtering, and deterministic sorting", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    fireEvent.click(screen.getByRole("tab", { name: "Full Season" }));
    expect(await screen.findByRole("heading", { name: "Full-season team metrics" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(10);
    expect(screen.getAllByRole("row")).toHaveLength(33);
    fireEvent.change(screen.getByLabelText("Search teams"), { target: { value: "Buffalo" } });
    expect(screen.getByText("Buffalo Bills")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    const before = screen.getByText("Buffalo Bills").closest("tr")?.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Sort by Adj comp" }));
    expect(screen.getByText("Buffalo Bills").closest("tr")?.textContent).toBe(before);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("distinguishes canonical/alternate L8 views and exposes deep fields", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    fireEvent.click(screen.getByRole("tab", { name: "Final Eight" }));
    expect(await screen.findByRole("heading", { name: "Final-eight team metrics" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(33);
    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    expect(screen.getByText("Canonical metrics — all selected games")).toBeInTheDocument();
    expect(screen.getByText("Alternate metrics — confirmed manual exclusions only")).toBeInTheDocument();
    expect(screen.getByText("Trigger values")).toBeInTheDocument();
    expect(screen.getByText(/Screen candidates remain canonical/)).toBeInTheDocument();
  });

  it("shows first-publication movement and 2026 ratings derived from 2025", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    fireEvent.change(screen.getByLabelText("Review season"), { target: { value: "2026" } });
    fireEvent.click(screen.getByRole("tab", { name: "Preseason Ratings" }));
    expect(await screen.findByRole("heading", { name: "2026 preseason power ratings" })).toBeInTheDocument();
    expect(screen.getByText(/Derived from completed 2025 regular-season data/)).toBeInTheDocument();
    expect(screen.getAllByText("First publication")).toHaveLength(32);
  });

  it("renders the honest 2026 performance empty state", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    fireEvent.change(screen.getByLabelText("Review season"), { target: { value: "2026" } });
    expect(await screen.findByText("2026 performance data is intentionally empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Full Season" }));
    expect(screen.getByText("2026 full-season metrics unavailable")).toBeInTheDocument();
  });

  it("labels screen flags as candidates and never as exclusions", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    fireEvent.change(screen.getByLabelText("Review season"), { target: { value: "2022" } });
    fireEvent.click(screen.getByRole("tab", { name: "Context Flags" }));
    expect(await screen.findByRole("heading", { name: "Context flags" })).toBeInTheDocument();
    expect(screen.getAllByText("screen candidate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not an exclusion").length).toBeGreaterThan(0);
    expect(screen.queryByText("Eligible for alternate-view exclusion")).not.toBeInTheDocument();
  });

  it("shows manual governance and an honest empty owner-entry state", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    fireEvent.click(screen.getByRole("tab", { name: "Manual Adjustments" }));
    expect(await screen.findByText("QB absolute limit")).toBeInTheDocument();
    expect(screen.getByText("≤ 0.75 z")).toBeInTheDocument();
    expect(screen.getByText("≤ 0.25 z")).toBeInTheDocument();
    expect(screen.getByText("≤ 1.0 z")).toBeInTheDocument();
    expect(screen.getByText("No owner-maintained adjustments")).toBeInTheDocument();
  });

  it("renders metadata consistency checks and metric-key identity", async () => {
    installCommittedFetch();
    render(<NflV03Review />);
    fireEvent.click(screen.getByRole("tab", { name: "Metadata / Validation" }));
    expect(await screen.findByText("Cross-file consistency checks")).toBeInTheDocument();
    expect(screen.getByText("Model version uniformity")).toBeInTheDocument();
    expect(screen.getByText("Full/L8 metric-key identity")).toBeInTheDocument();
    expect(screen.getAllByText("0.733").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/lambda = 0/).length).toBeGreaterThan(0);
  });

  it("renders a file-specific error without hiding other loaded files", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith(FILENAMES[1])
      ? new Response("failure", { status: 500 })
      : committedArtifactFetch(input)));
    render(<NflV03Review />);
    expect(await screen.findByText(/Final-eight metrics failed:/)).toBeInTheDocument();
    expect(screen.getByText("Full-season teams")).toBeInTheDocument();
  });
});
