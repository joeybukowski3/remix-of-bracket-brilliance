import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import CollegeFootballConferenceSelector from "./CollegeFootballConferenceSelector";

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
  });
});

describe("CollegeFootballConferenceSelector", () => {
  it("renders as a dropdown with 'All Conferences' as the first option", () => {
    render(<CollegeFootballConferenceSelector value="all" onChange={vi.fn()} />);
    const trigger = screen.getByRole("combobox", { name: "Select conference" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("All Conferences");
  });

  it("lists full official conference names, not abbreviations", () => {
    render(<CollegeFootballConferenceSelector value="all" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Southeastern Conference" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Big Ten Conference" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Atlantic Coast Conference" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "SEC" })).not.toBeInTheDocument();
  });

  it("calls onChange with the selected conference id", () => {
    const onChange = vi.fn();
    render(<CollegeFootballConferenceSelector value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Southeastern Conference" }));
    expect(onChange).toHaveBeenCalledWith("sec");
  });
});
