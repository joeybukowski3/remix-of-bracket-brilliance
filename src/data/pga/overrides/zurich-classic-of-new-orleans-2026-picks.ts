import type { PgaTournamentOverride } from "@/lib/pga/tournamentOverrides";

export const zurichClassicOfNewOrleans2026PicksOverride: PgaTournamentOverride = {
  manual: {
    featuredNarrative:
      "Zurich moves the featured PGA shell to TPC Louisiana, with the baseline page emphasizing approach quality, scoring efficiency, and the player traits most likely to convert birdie chances before manual team-specific adjustments are added.",
    modelFocusNote:
      "This week's tournament-specific model places added weight on the stats that best translate to TPC Louisiana and the Zurich format, while still grounding player evaluation in the site's core power-ranking framework. The emphasis should lean toward scoring efficiency, iron play, and the player traits most likely to convert opportunities at this venue. Final tournament-specific adjustments can be layered in through the override system.",
    courseFitNotes: [
      "Approach play, scoring opportunities, par-5 performance, and overall birdie conversion should stay near the center of the baseline model.",
      "Keep the course-fit view flexible until tournament-specific adjustments and any team-event context are finalized.",
    ],
    elevatedGolfers: [
      {
        player: "Use tournament override file",
        note: "Baseline generated output. Add golfers elevated versus the general power ranking once manual Zurich adjustments are ready.",
      },
    ],
    downgradedGolfers: [
      {
        player: "Use tournament override file",
        note: "Baseline generated output. Add golfers downgraded versus the general power ranking once manual Zurich adjustments are ready.",
      },
    ],
  },
};
