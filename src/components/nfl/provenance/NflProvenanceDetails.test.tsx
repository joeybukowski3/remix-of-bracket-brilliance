import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NflOptionalValue from "@/components/nfl/provenance/NflOptionalValue";
import NflProvenanceDetails, {
  NflValidationStatus,
} from "@/components/nfl/provenance/NflProvenanceDetails";
import NflSourceTag from "@/components/nfl/provenance/NflSourceTag";
import {
  NFL_SOURCE_KIND_LABELS,
  NFL_SOURCE_KINDS,
} from "@/lib/nfl/provenance";

describe("NFL provenance primitives", () => {
  it("renders a visible, distinct text label for every supported source kind", () => {
    const { rerender } = render(<NflSourceTag kind="model" />);

    for (const kind of NFL_SOURCE_KINDS) {
      rerender(<NflSourceTag kind={kind} />);
      const tag = screen.getByText(NFL_SOURCE_KIND_LABELS[kind]);
      expect(tag.textContent).toBeTruthy();
      expect(tag.getAttribute("data-source-kind")).toBe(kind);
    }

    expect(NFL_SOURCE_KIND_LABELS.model).not.toBe(NFL_SOURCE_KIND_LABELS.market);
    expect(NFL_SOURCE_KIND_LABELS.market).not.toBe(NFL_SOURCE_KIND_LABELS.editorial);
  });

  it("omits missing optional metadata without inventing freshness claims", () => {
    render(<NflProvenanceDetails provenance={{ sourceKind: "model" }} />);

    expect(screen.getByLabelText("Data provenance").textContent).toBe("Model");
    expect(screen.queryByText(/Generated|Retrieved|Source updated|Season|Week|Validation|live|current/i)).toBeNull();
  });

  it("preserves numeric zero and omits null or undefined values", () => {
    const { rerender } = render(<NflOptionalValue value={0} />);
    expect(screen.getByText("0").getAttribute("data-value-state")).toBe("available");

    rerender(<NflOptionalValue value={null} />);
    expect(screen.queryByText("0")).toBeNull();
    expect(document.querySelector("[data-value-state]")).toBeNull();

    rerender(<NflOptionalValue value={undefined} unavailableLabel="Unavailable" />);
    expect(screen.getByText("Unavailable").getAttribute("data-value-state")).toBe("unavailable");
  });

  it("renders supplied validation status and treats unknown values neutrally", () => {
    const { rerender } = render(<NflValidationStatus status="stage-1" />);
    expect(screen.getByText("Validation: stage-1").getAttribute("data-validation-tone")).toBe("warning");

    rerender(<NflValidationStatus status="vendor-specific-state" />);
    expect(screen.getByText("Validation: vendor-specific-state").getAttribute("data-validation-tone")).toBe("neutral");

    rerender(<NflValidationStatus status={undefined} />);
    expect(screen.queryByText(/Validation:/)).toBeNull();
  });

  it("renders date-only freshness without inventing time precision", () => {
    render(
      <NflProvenanceDetails
        provenance={{ sourceKind: "editorial", sourceUpdatedAt: "2026-06-23" }}
      />,
    );

    expect(screen.getByText("Source updated Jun 23, 2026")).toBeTruthy();
    expect(screen.queryByText(/AM|PM/)).toBeNull();
  });

  it("renders deterministically for identical metadata", () => {
    const provenance = {
      sourceKind: "external" as const,
      sourceLabel: "Example source",
      generatedAt: "2026-08-04T12:00:00Z",
      retrievedAt: "2026-08-04T13:00:00Z",
      sourceUpdatedAt: "2026-08-03T12:00:00Z",
      season: 2026,
      week: 0,
      validationStatus: "validated",
    };

    expect(renderToStaticMarkup(<NflProvenanceDetails provenance={provenance} />)).toBe(
      renderToStaticMarkup(<NflProvenanceDetails provenance={provenance} />),
    );
  });
});
