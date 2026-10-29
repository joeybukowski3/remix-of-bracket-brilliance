import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivateAccess from "./PrivateAccess";

afterEach(() => vi.unstubAllGlobals());

describe("PrivateAccess", () => {
  it("masks the passphrase field, posts it once, clears it and reports success", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onSignedIn = vi.fn();
    render(<PrivateAccess onSignedIn={onSignedIn} />);
    const input = screen.getByLabelText("Passphrase") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "a long passphrase value" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });

  it("shows a fixed message on a rejected passphrase and does not sign in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const onSignedIn = vi.fn();
    render(<PrivateAccess onSignedIn={onSignedIn} />);
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "wrong passphrase value" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That passphrase was not accepted.");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("does not submit an empty passphrase", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivateAccess onSignedIn={() => undefined} />);
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText("Passphrase").closest("form") as HTMLFormElement);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
