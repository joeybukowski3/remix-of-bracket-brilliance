import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import CollegeFootballWeekSelector from "./CollegeFootballWeekSelector";

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
  });
});

describe("CollegeFootballWeekSelector", () => {
  it("renders as a dropdown, not a button grid, showing only supported weeks", () => {
    render(<CollegeFootballWeekSelector weeks={[1, 2, 3]} value={2} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Select week" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Select week" })).not.toBeInTheDocument();
  });

  it("collapsed value shows the currently selected week", () => {
    render(<CollegeFootballWeekSelector weeks={[1, 2, 3]} value={2} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Week 2");
  });

  it("calls onChange with the selected week when an option is chosen", () => {
    const onChange = vi.fn();
    render(<CollegeFootballWeekSelector weeks={[1, 2, 3]} value={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Week 3" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("shows a message rather than an empty dropdown when no weeks exist", () => {
    render(<CollegeFootballWeekSelector weeks={[]} value={0} onChange={vi.fn()} />);
    expect(screen.getByText("No schedule weeks available.")).toBeInTheDocument();
  });
});
