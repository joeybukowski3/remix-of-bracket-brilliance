import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NflDfsUploadPanel from "@/components/nfl/dfs/NflDfsUploadPanel";
import { DK_NFL_CLASSIC_HEADERS } from "@/lib/nfl/dfs/contracts";

const HEADER_LINE = DK_NFL_CLASSIC_HEADERS.join(",");
const VALID_ROW = "QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,";
const VALID_CSV = [HEADER_LINE, VALID_ROW].join("\n");
const INVALID_CSV = "Name,Salary\nDerek Sample,7200";
const WARNING_CSV = [HEADER_LINE, "QB,Derek Sample (39001101),Derek Sample,39001101,QB,7200,NO@DET 09/13/2026 01:00PM ET,NO,19.86,GTD"].join("\n");

function makeFile(content: string, name = "slate.csv") {
  return new File([content], name, { type: "text/csv" });
}

describe("NflDfsUploadPanel", () => {
  it("accepts a valid CSV and reports the parsed result", async () => {
    const onResult = vi.fn();
    render(<NflDfsUploadPanel onResult={onResult} />);

    const input = screen.getByLabelText(/choose draftkings salary csv/i);
    fireEvent.change(input, { target: { files: [makeFile(VALID_CSV)] } });

    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const [result, fileName] = onResult.mock.calls[onResult.mock.calls.length - 1];
    expect(result.accepted).toBe(true);
    expect(fileName).toBe("slate.csv");
    expect(await screen.findByText(/1 rows parsed successfully/i)).toBeInTheDocument();
  });

  it("shows structured, human-readable errors for an invalid file instead of raw diagnostics", async () => {
    const onResult = vi.fn();
    render(<NflDfsUploadPanel onResult={onResult} />);

    fireEvent.change(screen.getByLabelText(/choose draftkings salary csv/i), { target: { files: [makeFile(INVALID_CSV)] } });

    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(await screen.findByText(/cannot analyze this file/i)).toBeInTheDocument();
    expect(screen.queryByText(/MISSING_REQUIRED_COLUMN/)).not.toBeInTheDocument();
  });

  it("shows warnings without blocking analysis", async () => {
    const onResult = vi.fn();
    render(<NflDfsUploadPanel onResult={onResult} />);

    fireEvent.change(screen.getByLabelText(/choose draftkings salary csv/i), { target: { files: [makeFile(WARNING_CSV)] } });

    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const [result] = onResult.mock.calls[onResult.mock.calls.length - 1];
    expect(result.accepted).toBe(true);
    expect(await screen.findByText(/warning\(s\) in this file/i)).toBeInTheDocument();
  });

  it("allows resetting/changing the file", async () => {
    const onResult = vi.fn();
    render(<NflDfsUploadPanel onResult={onResult} />);

    fireEvent.change(screen.getByLabelText(/choose draftkings salary csv/i), { target: { files: [makeFile(VALID_CSV)] } });
    await waitFor(() => expect(screen.getByText("slate.csv")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/remove file and choose a different csv/i));

    expect(onResult).toHaveBeenLastCalledWith(null, null);
    expect(screen.queryByText("slate.csv")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/drag and drop or press enter to browse/i)).toBeInTheDocument();
  });

  it("states that analysis happens in the browser and never uploads to a server", () => {
    render(<NflDfsUploadPanel onResult={vi.fn()} />);
    expect(screen.getByText(/parsed entirely in your browser/i)).toBeInTheDocument();
  });

  it("supports keyboard activation of the drop zone", () => {
    render(<NflDfsUploadPanel onResult={vi.fn()} />);
    const dropzone = screen.getByLabelText(/drag and drop or press enter to browse/i);
    const input = screen.getByLabelText(/choose draftkings salary csv/i) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.keyDown(dropzone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalled();
  });
});
