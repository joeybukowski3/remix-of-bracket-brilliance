/**
 * ModelPreviewRowList.test.tsx
 * Generic row renderer used by the new ML Edges and Pitcher Regression
 * mobile preview accordions (no odds badges, unlike PropPreviewCard's rows).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelPreviewRowList, type ModelPreviewRow } from "./ModelPreviewRowList";

const rows: ModelPreviewRow[] = [
  {
    key: "tb-nyy",
    player: "TB @ NYY",
    team: "TB",
    opponent: "NYY",
    badge: { label: "Strong lean", bg: "#0f2748", color: "#ffffff" },
  },
  {
    key: "pitcher-1",
    player: "Gerrit Cole",
    team: "NYY",
    scoreText: "+6.4",
    badge: { label: "Likely Improving", bg: "#166534", color: "#86efac" },
  },
];

describe("ModelPreviewRowList", () => {
  it("renders every row's player name in source order", () => {
    render(<ModelPreviewRowList rows={rows} />);
    const names = screen.getAllByText(/TB @ NYY|Gerrit Cole/).map((el) => el.textContent);
    expect(names).toEqual(["TB @ NYY", "Gerrit Cole"]);
  });

  it("renders the opponent line only when opponent is provided", () => {
    render(<ModelPreviewRowList rows={rows} />);
    expect(screen.getByText("vs NYY")).toBeInTheDocument();
    expect(screen.queryByText(/^vs $/)).not.toBeInTheDocument();
  });

  it("renders the badge label for each row", () => {
    render(<ModelPreviewRowList rows={rows} />);
    expect(screen.getByText("Strong lean")).toBeInTheDocument();
    expect(screen.getByText("Likely Improving")).toBeInTheDocument();
  });

  it("renders scoreText only when provided", () => {
    render(<ModelPreviewRowList rows={rows} />);
    expect(screen.getByText("+6.4")).toBeInTheDocument();
  });

  it("never renders a percentage sign anywhere in the row list", () => {
    render(<ModelPreviewRowList rows={rows} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
