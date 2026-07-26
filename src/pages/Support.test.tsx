import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportPage } from "./Support";

const configuredStripeUrl = new URL("/support", "https://payments.example.test").toString();
const configuredBitcoinAddress = `bc1q${"a".repeat(48)}`;

function renderSupport({
  stripeSupportUrl,
  bitcoinAddress,
}: {
  stripeSupportUrl?: string;
  bitcoinAddress?: string;
} = {}) {
  return render(
    <MemoryRouter initialEntries={["/support"]}>
      <Routes>
        <Route
          path="/support"
          element={<SupportPage stripeSupportUrl={stripeSupportUrl} bitcoinAddress={bitcoinAddress} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Support page", () => {
  it("renders at /support", () => {
    renderSupport();

    expect(
      screen.getByRole("heading", { level: 1, name: "Independent sports analytics, built for the public." }),
    ).toBeInTheDocument();
  });

  it("renders a safe external Stripe CTA when a valid support URL is configured", () => {
    renderSupport({ stripeSupportUrl: configuredStripeUrl });

    const stripeLinks = screen.getAllByRole("link", { name: "Support with Stripe" });
    expect(stripeLinks).toHaveLength(2);
    stripeLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", configuredStripeUrl);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("renders a disabled Stripe action instead of a broken link when configuration is missing or invalid", () => {
    const { rerender } = renderSupport();

    expect(screen.getByRole("button", { name: "Support with Stripe" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Support with Stripe" })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={["/support"]}>
        <SupportPage stripeSupportUrl="javascript:alert('nope')" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Support with Stripe" })).toBeDisabled();
  });

  it("renders the Bitcoin block only when an address is configured", () => {
    renderSupport({ bitcoinAddress: configuredBitcoinAddress });

    expect(screen.getByRole("heading", { level: 2, name: "Support with Bitcoin" })).toBeInTheDocument();
    expect(screen.getByText(configuredBitcoinAddress)).toBeInTheDocument();
  });

  it("hides the Bitcoin block when the address is missing", () => {
    renderSupport();

    expect(screen.queryByRole("heading", { name: "Support with Bitcoin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy address" })).not.toBeInTheDocument();
  });

  it("allows the configured Bitcoin address to wrap safely", () => {
    renderSupport({ bitcoinAddress: configuredBitcoinAddress });

    const address = screen.getByText(configuredBitcoinAddress);
    expect(address).toHaveClass("min-w-0", "break-all");
    expect(address.parentElement).toHaveClass("min-w-0");
  });

  it("reports a successful Bitcoin copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderSupport({ bitcoinAddress: configuredBitcoinAddress });

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(configuredBitcoinAddress));
    expect(screen.getByRole("status")).toHaveTextContent("Bitcoin address copied.");
  });

  it("reports clipboard failure without hiding the address", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderSupport({ bitcoinAddress: configuredBitcoinAddress });

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Copy failed. Select the address to copy it manually.",
    );
    expect(screen.getByText(configuredBitcoinAddress)).toBeInTheDocument();
  });

  it("contains no placeholder payment details or hash-link fallback for Stripe", () => {
    const { container } = renderSupport();

    expect(container.querySelector('a[href="#"]')).not.toBeInTheDocument();
    expect(container.querySelector("code")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/placeholder address/i);
  });

  it("uses one h1 followed by section-level h2 headings without skipped levels", () => {
    const { container } = renderSupport({ bitcoinAddress: configuredBitcoinAddress });
    const headings = Array.from(container.querySelectorAll("h1, h2, h3")).map((heading) => heading.tagName);

    expect(headings[0]).toBe("H1");
    expect(headings.filter((heading) => heading === "H1")).toHaveLength(1);
    expect(headings.slice(1).every((heading) => heading === "H2")).toBe(true);
  });

  it("includes narrow-screen overflow guards near a 390px viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const { container } = renderSupport({ bitcoinAddress: configuredBitcoinAddress });

    expect(container.querySelector("main")).toHaveClass("min-w-0");
    expect(screen.getByText(configuredBitcoinAddress)).toHaveClass("break-all");
    expect(container.querySelector(".overflow-x-auto")).not.toBeInTheDocument();
  });
});
