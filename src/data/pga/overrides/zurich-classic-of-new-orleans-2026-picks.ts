import type { PgaTournamentOverride } from "@/lib/pga/tournamentOverrides";

export const zurichClassicOfNewOrleans2026PicksOverride: PgaTournamentOverride = {
  hero: {
    badge: "Zurich Classic picks",
    title: "Zurich Classic of New Orleans 2026 Picks, Fades & Team-Event Angles",
    intro:
      "The Zurich card is now centered on the actual tournament setup at TPC Louisiana, with a live team-event board at the top and the written card focused on outrights, placement angles, and week-specific strategy.",
    support:
      "Use this page for the editorial side of the board: best bets, safer placement targets, fades, and notes on how the course and format change the way this week should be bet.",
    primaryCtaLabel: "Open Full Model",
    primaryCtaHref: "model",
    secondaryCtaLabel: "View PGA Rankings Hub",
    secondaryCtaHref: "hub",
  },
  seo: {
    faqs: [
      {
        question: "What matters most for the Zurich Classic of New Orleans 2026 board?",
        answer:
          "TPC Louisiana puts the focus on approach play, par-5 scoring, birdie conversion, and enough flexibility to account for the team-event format.",
      },
      {
        question: "What is this page for?",
        answer:
          "This page is the written tournament card for Zurich week, built for outrights, fades, Top 40 angles, and event-specific betting notes around the live model board.",
      },
      {
        question: "Where can I customize the rankings?",
        answer:
          "Use the PGA model room on /pga/model to adjust weights, rerank the field, and compare how different stat profiles reshape the Zurich board.",
      },
      {
        question: "How are the rankings updated?",
        answer:
          "The rankings are re-run from the active Zurich tournament dataset and scored through the shared PGA model pipeline used across the site.",
      },
    ],
  },
  model: {
    previewEyebrow: "Zurich model preview",
    previewHeadline: "This week's board starts with TPC Louisiana fit.",
    previewBody: "Use the quick leaderboard to see who the live model favors before opening the full slider room.",
    previewCtaLabel: "Open Full Model",
    previewTableEyebrow: "Mini Zurich rankings",
    previewRankingTitle: "Current Zurich leaderboard preview",
    previewRankingBody: "Lower stat ranks are stronger. This snapshot shows who is rising on the live Zurich board right now.",
    previewTableCtaLabel: "Customize full board",
    previewRailCtaTitle: "Full PGA model room",
    previewRailCtaBody: "Open the full rankings board, adjust weights, and compare the entire Zurich field.",
    heroSteps: [
      {
        title: "Start with the live board",
        body: "Use the current leaderboard preview to see which players and profiles the model is already pushing to the top for Zurich week.",
      },
      {
        title: "Separate ceiling from floor",
        body: "Use the top of the board for outright conversations, then shift to steadier profiles for Top 20 and Top 40 placement angles.",
      },
      {
        title: "Respect the team-event wrinkle",
        body: "TPC Louisiana still rewards iron play and scoring, but the Zurich format means you should be more selective about how aggressively you bet the board.",
      },
      {
        title: "Use the writeup as the tiebreaker",
        body: "The written card below is where the rankings turn into week-specific picks, fades, and market strategy.",
      },
    ],
    heroStats: [
      {
        value: "Team Event",
        label: "Format"
      },
      {
        value: "TPC Louisiana",
        label: "Course fit lens"
      },
      {
        value: "Approach + scoring",
        label: "Core build"
      },
      {
        value: "April 23-26",
        label: "Tournament week"
      },
      {
        value: "/pga/model",
        label: "Model room"
      }
    ],
    valueStrip: [
      {
        title: "Read the board quickly",
        body: "The top of the page gives you the live rankings context first so every pick below starts from the actual Zurich leaderboard."
      },
      {
        title: "Use the model without leaving the week",
        body: "The same tournament dataset powers the preview here and the full model room, so the board stays consistent across both pages."
      },
      {
        title: "Keep the written card separate",
        body: "This page now behaves like the editorial tournament card, not the overall PGA landing page."
      }
    ],
    weightShiftNotes: [
      {
        title: "Outright build",
        body: "Lean into scoring pressure and top-end upside when you want the board to surface more ceiling for winner markets."
      },
      {
        title: "Placement build",
        body: "Keep approach, accuracy, and bogey control steady when you want safer Top 20 and Top 40 candidates."
      },
      {
        title: "Course-fit check",
        body: "Use the board to see whether a player is winning on venue fit, trend strength, or a more balanced all-around profile."
      }
    ],
    courseInsights: [
      {
        title: "Course summary",
        body: "TPC Louisiana rewards approach play, birdie conversion, and enough par-5 scoring to keep pressure on the field."
      },
      {
        title: "Key traits",
        body: "The strongest Zurich profiles this week combine clean iron play with the ability to turn scoring holes into birdie runs."
      },
      {
        title: "Weekly note",
        body: "Because this is a team event, the written card below should be used to separate strong model fits from the best betting fits."
      }
    ],
  },
  picksPage: {
    top10Intro:
      "The outrights and aggressive betting angles should start with the top of the live Zurich board, but this week matters more as a team-event card than a pure power-ranking exercise. Focus on players whose approach play and scoring profile already place them near the top, then tighten the list to the names you trust most at TPC Louisiana.",
    top40Intro:
      "The safest placement targets this week are the players who stay near the top of the Zurich board without needing a ceiling-only case. Top 40 and parlay exposure should lean on steadier profiles with enough approach quality and scoring floor to survive the volatility of the format.",
  },
  manual: {
    featuredNarrative:
      "Zurich week now feeds the PGA hub and written card from the same live board, with TPC Louisiana context pushing approach quality, par-5 scoring, and birdie conversion to the front of the conversation.",
    modelFocusNote:
      "This week's Zurich board should reward approach quality, scoring efficiency, and enough birdie-making to create separation on a course where the field still needs to take advantage of scoring holes. The team-event format matters, but the model should still begin with clear stat-based leaders before the written card narrows the betting angles.",
    courseFitNotes: [
      "Approach play, scoring opportunities, par-5 performance, and overall birdie conversion should stay near the center of the Zurich build.",
      "Use the written card to separate strong stat fits from the best outright and placement-market decisions in the team-event format.",
    ],
  },
};
