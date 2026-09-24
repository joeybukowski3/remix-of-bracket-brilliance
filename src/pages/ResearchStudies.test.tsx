import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "@/App";
import { researchStudies, researchStudyPath } from "@/data/researchStudies";

afterEach(() => window.history.pushState({}, "", "/"));

describe("Research Studies routes and content", () => {
  it("renders the public index with all six phase links and evidence labels", () => {
    window.history.pushState({}, "", "/research-studies");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Research Studies" })).toBeInTheDocument();
    expect(researchStudies).toHaveLength(6);
    for (const study of researchStudies) {
      expect(screen.getByRole("link", { name: `Read ${study.title}` })).toHaveAttribute("href", researchStudyPath(study.slug));
      expect(screen.getAllByText(study.status).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("heading", { name: "Recent Team QB-Hit Exposure" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /5.02, 5.58, 6.11, 6.47, and 7.71 percent/ })).toBeInTheDocument();
    expect(screen.queryByText(/\b(?:winning angle|lock|proven betting edge|sharp signal)\b/i)).not.toBeInTheDocument();
  });

  it("filters the compact index without losing study routes", () => {
    window.history.pushState({}, "", "/research-studies");
    render(<App />);
    fireEvent.change(screen.getByLabelText("Evidence"), { target: { value: "Not supported" } });
    expect(screen.getByText("Showing 2 of 6 studies")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read QB Pressure Vulnerability × Pass-Rush Mismatch" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read Matchup Exploitability Study" })).toBeInTheDocument();
  });

  it("renders each study detail URL with required sections and verified figures", () => {
    for (const study of researchStudies) {
      window.history.pushState({}, "", researchStudyPath(study.slug));
      const view = render(<App />);
      expect(screen.getByRole("heading", { level: 1, name: study.title })).toBeInTheDocument();
      for (const heading of ["Research question", "Why we tested it", "Data", "Method", "Key findings", "What held up", "What didn’t hold up", "Interpretation", "JKB decision", "Limitations"]) {
        expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      }
      if (study.phase === 5) {
        expect(screen.getByText("+1.14 pp")).toBeInTheDocument();
        expect(screen.getByText("−0.054")).toBeInTheDocument();
      }
      view.unmount();
    }
  });
});
