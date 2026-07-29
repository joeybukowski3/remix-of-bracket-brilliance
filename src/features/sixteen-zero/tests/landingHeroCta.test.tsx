import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LandingHero } from "../components/LandingHero";

describe("landing hero results preview", () => {
  it("no longer labels the preview as a Draft Room Preview", () => {
    render(
      <MemoryRouter>
        <LandingHero onStart={() => undefined} initializing={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Draft Room Preview")).not.toBeInTheDocument();
    expect(screen.getByText("Example Season Summary")).toBeInTheDocument();
    expect(screen.getByText("Sample result · not an actual result")).toBeInTheDocument();
  });

  it("shows an 11-3 record and Eliminated in Semifinal with a red X icon", () => {
    render(
      <MemoryRouter>
        <LandingHero onStart={() => undefined} initializing={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText("11-3")).toBeInTheDocument();
    const outcome = screen.getByText("Eliminated in Semifinal");
    expect(outcome).toBeInTheDocument();
    expect(outcome).toHaveClass("text-rose-300");
    const icon = outcome.querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute("class")).toMatch(/lucide/);
  });

  it("does not imply the example team went undefeated", () => {
    render(
      <MemoryRouter>
        <LandingHero onStart={() => undefined} initializing={false} />
      </MemoryRouter>,
    );
    const preview = document.querySelector("[data-hero-preview]");
    expect(preview).toBeTruthy();
    expect(preview?.textContent).not.toContain("16-0");
  });
});

describe("landing hero start-draft CTAs", () => {
  it("Start Draft launches the draft room with the manually selected slot preserved", () => {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <LandingHero onStart={onStart} initializing={false} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^draft position 5$/i }));
    fireEvent.click(screen.getByRole("button", { name: /start draft/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(5);
  });

  it("Enter the Draft Room launches the draft room even when no slot was manually selected", () => {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <LandingHero onStart={onStart} initializing={false} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /enter the draft room/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
    const [slot] = onStart.mock.calls[0];
    expect(slot).toBeGreaterThanOrEqual(1);
    expect(slot).toBeLessThanOrEqual(12);
  });

  it("Enter the Draft Room uses the already-selected slot when one was chosen", () => {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <LandingHero onStart={onStart} initializing={false} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^draft position 9$/i }));
    fireEvent.click(screen.getByRole("button", { name: /enter the draft room/i }));
    expect(onStart).toHaveBeenCalledWith(9);
  });

  it("does not initialize twice on rapid repeated clicks", () => {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <LandingHero onStart={onStart} initializing={false} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: /start draft/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
