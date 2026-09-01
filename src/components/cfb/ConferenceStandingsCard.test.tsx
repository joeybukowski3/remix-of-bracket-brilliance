import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getConferenceBySlug, getTeamsByConference } from "@/data/cfb";
import ConferenceStandingsCard from "./ConferenceStandingsCard";

function renderCard() {
  const conference = getConferenceBySlug("sec");
  if (!conference) throw new Error("expected SEC conference fixture");
  const teams = getTeamsByConference(conference.id);
  return {
    conference,
    teams,
    ...render(
      <MemoryRouter>
        <ConferenceStandingsCard conference={conference} teams={teams} />
      </MemoryRouter>,
    ),
  };
}

describe("ConferenceStandingsCard", () => {
  it("renders the desktop standings through the shared dense-table scroll region", () => {
    const { container, conference } = renderCard();
    const region = container.querySelector(
      `[role="region"][aria-label="${conference.name} standings"]`,
    );
    expect(region).toBeInTheDocument();
    expect(region).toHaveClass("relative", "overflow-x-auto", "hidden", "sm:block");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(container.querySelector("thead tr")).toHaveClass("bg-slate-100", "text-[10px]");
  });

  it("preserves the column labels and one row per team", () => {
    const { container, teams } = renderCard();
    const headers = Array.from(container.querySelectorAll("thead th")).map(
      (th) => th.textContent,
    );
    expect(headers).toEqual(["Team", "Conf", "Overall", "JKB", "SOS", "Rem"]);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(teams.length);
  });
});
