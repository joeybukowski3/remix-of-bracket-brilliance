import { definePgaTournamentConfig, type PgaTournamentConfigInput } from "@/lib/pga/tournamentConfig";
import { applyPgaTournamentOverride } from "@/lib/pga/tournamentOverrides";
import { zurichClassicOfNewOrleans2026PicksOverride } from "@/data/pga/overrides/zurich-classic-of-new-orleans-2026-picks";

const basezurichClassicOfNewOrleans2026PicksTournament = {
  "id": "zurich-classic-of-new-orleans-2026",
  "slug": "zurich-classic-of-new-orleans-2026-picks",
  "season": 2026,
  "name": "Zurich Classic of New Orleans",
  "shortName": "Zurich Classic",
  "courseName": "TPC Louisiana",
  "location": "Avondale, LA • USA",
  "schedule": {
    "weekLabel": "April 23, 2026 - 26",
    "startDate": "2026-04-23",
    "endDate": "2026-04-26"
  },
  "summary": {
    "blurb": "TPC Louisiana rewards strong approach play, scoring opportunities, par-5 efficiency, and steady birdie conversion, with team-event dynamics adding extra volatility to the board.",
    "bullets": [
      "Approach play and birdie conversion should carry added weight.",
      "Par-5 scoring opportunities matter more than a generic baseline week.",
      "Team-event context means course-fit and chemistry notes should stay flexible until manual adjustments are layered in."
    ],
    "modelFocus": "This week's tournament-specific model places added weight on the stats that best translate to TPC Louisiana and the Zurich format, while still grounding player evaluation in the site's core power-ranking framework. The emphasis should lean toward scoring efficiency, iron play, and the player traits most likely to convert opportunities at this venue. Final tournament-specific adjustments can be layered in through the override system."
  },
  "homepageFeature": {
    "eyebrow": "Current upcoming event",
    "ctaLabel": "Open full Zurich Classic board"
  },
  "tournamentInfo": {
    "previousWinner": "A. Novak / B. Griffin",
    "purse": "$9,500,000",
    "winningScore": "Official score archive unavailable in current feed",
    "averageCutLineLast5Years": "Historical cut-line average unavailable in current feed",
    "courseFitProfile": [
      "Strong approach play",
      "Birdie-making / scoring",
      "Par-5 opportunities",
      "Flexible team-event view"
    ]
  },
  "hero": {
    "badge": "PGA tournament model",
    "title": "Zurich Classic of New Orleans 2026 Picks & Best Bets",
    "intro": "The Zurich Classic of New Orleans page is live with the active model, rankings table, and tournament routing already wired into the weekly PGA workflow.",
    "support": "Use the override file to sharpen the writeup, weekly emphasis, player boosts, and market-specific angles without rebuilding the page shell.",
    "primaryCtaLabel": "Open Full Model",
    "secondaryCtaLabel": "Read written picks"
  },
  "seo": {
    "title": "Zurich Classic of New Orleans 2026 Picks, Best Bets & PGA Model",
    "description": "Zurich Classic of New Orleans 2026 picks and model-driven PGA rankings for TPC Louisiana.",
    "faqs": [
      {
        "question": "What matters most for Zurich Classic of New Orleans 2026?",
        "answer": "TPC Louisiana rewards strong approach play, scoring opportunities, par-5 efficiency, and steady birdie conversion, with team-event dynamics adding extra volatility to the board."
      },
      {
        "question": "How should you use the Zurich Classic of New Orleans model?",
        "answer": "Start with the balanced preset, review the leaderboard, then use the override file to push the board toward the profile you want to bet."
      },
      {
        "question": "Where do manual weekly adjustments go?",
        "answer": "Edit src/data/pga/overrides/zurich-classic-of-new-orleans-2026-picks.ts to change weights, narrative copy, and player adjustments without regenerating the package."
      },
      {
        "question": "How are the rankings updated?",
        "answer": "The player table is generated from the weekly PGA workbook export and re-ranked automatically through the shared PGA model pipeline."
      }
    ]
  },
  "model": {
    "dataPath": "/data/pga/zurich-classic-of-new-orleans-2026.json",
    "eventType": "Team Event",
    "fieldAverage": "Baseline field build",
    "cutLine": "36-hole team cut",
    "noCutLabel": "Team-event cut",
    "courseHistoryDisplay": "TPC Louisiana",
    "previewEyebrow": "Build your Zurich Classic model",
    "previewHeadline": "Shift the weights. See who rises.",
    "previewBody": "Preview the board, then open the full model room to customize every ranking.",
    "previewRankingTitle": "TPC Louisiana ranking preview",
    "previewRankingBody": "Lower rank cells grade better. Use the preview to see how the board moves before opening the full slider room.",
    "previewRailCtaTitle": "Model room",
    "previewRailCtaBody": "Open the full PGA model room, apply presets, and scan the entire field.",
    "previewSliderKeys": [
      "sgApproach",
      "drivingAccuracy",
      "sgAroundGreen"
    ],
    "previewThemeKeys": [
      "default",
      "ballStriking",
      "accuracy",
      "shortGame"
    ],
    "topProjectionPrimaryStatKey": "sgApproachRank",
    "topProjectionPrimaryStatLabel": "Approach",
    "heroSteps": [
      {
        "title": "Generate the weekly shell",
        "body": "This page, the tournament route, and the base model wiring are created automatically from the schedule entry."
      },
      {
        "title": "Preview the live board",
        "body": "The ranking table updates from the exported tournament dataset without needing page-level rewrites."
      },
      {
        "title": "Apply manual overrides",
        "body": "Tune presets, narrative copy, and player boosts in the override file once the baseline package is live."
      },
      {
        "title": "Publish the final card",
        "body": "Use the existing picks page and full model room after manual edits tighten the weekly angle."
      }
    ],
    "heroStats": [
      {
        "value": "Auto",
        "label": "Workflow mode"
      },
      {
        "value": "4",
        "label": "Preset views"
      },
      {
        "value": "3",
        "label": "Preview sliders"
      },
      {
        "value": "April 23, 2026 - 26",
        "label": "Tournament week"
      },
      {
        "value": "/pga/zurich-classic-of-new-orleans-2026-picks/model",
        "label": "Model route"
      }
    ],
    "valueStrip": [
      {
        "title": "Generated tournament shell",
        "body": "Routing, page copy scaffolding, and the shared PGA model wiring are created together so the weekly workflow is repeatable."
      },
      {
        "title": "Manual override layer",
        "body": "Use the override file for narrative changes, weight shifts, player boosts, and course-specific tweaks without rebuilding the page."
      },
      {
        "title": "Homepage + landing page sync",
        "body": "The featured homepage PGA module and tournament landing page both point at the same featured-tournament configuration."
      }
    ],
    "weightShiftNotes": [
      {
        "title": "Balanced starting point",
        "body": "The default preset gives you a safe baseline before you add your weekly tournament-specific emphasis."
      },
      {
        "title": "Course-fit tweak lane",
        "body": "Use the override file to increase the stats you believe matter more for this course and field."
      },
      {
        "title": "Player adjustment lane",
        "body": "Add measured player boosts or downgrades after the first automated ranking pass is live."
      }
    ],
    "courseInsights": [
      {
        "title": "Course summary",
        "body": "TPC Louisiana rewards strong approach play, scoring opportunities, par-5 efficiency, and steady birdie conversion, with team-event dynamics adding extra volatility to the board."
      },
      {
        "title": "Key traits",
        "body": "Approach play and birdie conversion should carry added weight."
      },
      {
        "title": "Weekly note",
        "body": "Layer in manual notes after the automated baseline package is generated."
      }
    ],
    "statColumns": [
      {
        "key": "sgApproachRank",
        "abbr": "App",
        "mobileLabel": "Approach",
        "tooltip": "SG: Approach the Green rank for the current field."
      },
      {
        "key": "par4Rank",
        "abbr": "P4",
        "mobileLabel": "Par 4",
        "tooltip": "Par 4 scoring rank for the current field."
      },
      {
        "key": "drivingAccuracyRank",
        "abbr": "DA",
        "mobileLabel": "Drive Acc",
        "tooltip": "Driving accuracy rank for the current field."
      },
      {
        "key": "bogeyAvoidanceRank",
        "abbr": "BAvd",
        "mobileLabel": "Bogey Av",
        "tooltip": "Bogey avoidance rank for the current field."
      },
      {
        "key": "sgAroundGreenRank",
        "abbr": "ARG",
        "mobileLabel": "ARG",
        "tooltip": "Around-the-green rank for the current field."
      },
      {
        "key": "sgPuttingRank",
        "abbr": "Putt",
        "mobileLabel": "Putting",
        "tooltip": "Putting rank for the current field."
      }
    ],
    "previewThemes": [
      {
        "key": "default",
        "label": "Default Model",
        "description": "Balanced tournament weighting across approach, scoring pressure, and course-fit context.",
        "weights": {
          "sgApproach": 22,
          "par4": 14,
          "drivingAccuracy": 11,
          "bogeyAvoidance": 11,
          "sgAroundGreen": 9,
          "trendRank": 11,
          "birdie125150": 7,
          "sgPutting": 6,
          "birdieUnder125": 3,
          "courseTrueSg": 6
        }
      },
      {
        "key": "ballStriking",
        "label": "Ball Striking",
        "description": "Turns the board toward elite iron play and tougher-hole control.",
        "weights": {
          "sgApproach": 28,
          "par4": 16,
          "drivingAccuracy": 14,
          "bogeyAvoidance": 8,
          "sgAroundGreen": 5,
          "trendRank": 10,
          "birdie125150": 7,
          "sgPutting": 3,
          "birdieUnder125": 1,
          "courseTrueSg": 8
        }
      },
      {
        "key": "accuracy",
        "label": "Accuracy",
        "description": "Pushes the board toward fairways, bogey avoidance, and a steadier floor.",
        "weights": {
          "sgApproach": 18,
          "par4": 14,
          "drivingAccuracy": 23,
          "bogeyAvoidance": 17,
          "sgAroundGreen": 7,
          "trendRank": 8,
          "birdie125150": 4,
          "sgPutting": 3,
          "birdieUnder125": 1,
          "courseTrueSg": 5
        }
      },
      {
        "key": "shortGame",
        "label": "Short Game",
        "description": "Raises scrambling and putting when recovery skill matters more.",
        "weights": {
          "sgApproach": 17,
          "par4": 11,
          "drivingAccuracy": 9,
          "bogeyAvoidance": 11,
          "sgAroundGreen": 20,
          "trendRank": 9,
          "birdie125150": 5,
          "sgPutting": 11,
          "birdieUnder125": 2,
          "courseTrueSg": 5
        }
      }
    ],
    "presets": [
      {
        "key": "balanced",
        "label": "Balanced",
        "description": "Default weekly weighting across the full board.",
        "weights": {
          "sgApproach": 22,
          "par4": 14,
          "drivingAccuracy": 11,
          "bogeyAvoidance": 11,
          "sgAroundGreen": 9,
          "trendRank": 11,
          "birdie125150": 7,
          "sgPutting": 6,
          "birdieUnder125": 3,
          "courseTrueSg": 6
        }
      },
      {
        "key": "outright",
        "label": "Outright",
        "description": "More ceiling and recent-form pressure for outright and top-end betting.",
        "weights": {
          "sgApproach": 25,
          "par4": 14,
          "drivingAccuracy": 6,
          "bogeyAvoidance": 5,
          "sgAroundGreen": 5,
          "trendRank": 18,
          "birdie125150": 8,
          "sgPutting": 8,
          "birdieUnder125": 5,
          "courseTrueSg": 6
        }
      },
      {
        "key": "top20",
        "label": "Top 20",
        "description": "Balanced upside with enough course-fit and cut-making stability.",
        "weights": {
          "sgApproach": 20,
          "par4": 13,
          "drivingAccuracy": 14,
          "bogeyAvoidance": 13,
          "sgAroundGreen": 9,
          "trendRank": 9,
          "birdie125150": 5,
          "sgPutting": 6,
          "birdieUnder125": 2,
          "courseTrueSg": 9
        }
      },
      {
        "key": "top40",
        "label": "Top 40",
        "description": "Floor-first weighting for safer parlay and placement builds.",
        "weights": {
          "sgApproach": 16,
          "par4": 13,
          "drivingAccuracy": 17,
          "bogeyAvoidance": 17,
          "sgAroundGreen": 10,
          "trendRank": 7,
          "birdie125150": 4,
          "sgPutting": 5,
          "birdieUnder125": 1,
          "courseTrueSg": 10
        }
      }
    ]
  },
  "picksPage": {
    "top10Intro": "This is the baseline Zurich Classic top-10 intro. Replace it in the override file once you finalize the weekly betting angle.",
    "top40Intro": "This is the baseline Zurich Classic top-40 intro. Replace it in the override file after the automated board is generated.",
    "strategyBullets": [
      "Approach play and birdie conversion should carry added weight.",
      "Par-5 scoring opportunities matter more than a generic baseline week.",
      "Team-event context means course-fit and chemistry notes should stay flexible until manual adjustments are layered in."
    ],
    "parlayBullets": [
      "Use the top-40 preset to identify lower-volatility golfers for placement parlays.",
      "Avoid forcing outrights into parlays when the automated board shows a better floor-first path.",
      "Use manual overrides to add any tournament-specific player fades before publishing the final card."
    ],
    "tierOneBets": [
      {
        "player": "Baseline model leader",
        "odds": "Model lean",
        "analysis": "The auto-generated baseline highlights the strongest all-around fit at the top of the weighted board until manual betting adjustments are added."
      }
    ],
    "tierTwoBets": [
      {
        "player": "Secondary model value",
        "odds": "Model lean",
        "analysis": "Use this slot for the next-best fit once you review the initial ranking table and market board."
      }
    ],
    "tierThreeBets": [
      {
        "player": "Upside model play",
        "odds": "Model lean",
        "analysis": "This section can be sharpened later with manual outrights or placement targets after weekly tuning."
      }
    ],
    "fades": [
      "Use the baseline board to identify golfers whose public perception exceeds their weighted statistical fit this week."
    ],
    "top40Rows": [
      [
        "Baseline top-40 anchor",
        "Use the first model pass to identify the safest floor-first golfers before adding manual placement-market edits."
      ]
    ],
    "summaryRows": [
      [
        "Baseline board",
        "Model lean",
        "8",
        "Initial weekly summary generated from the active tournament configuration and live ranking table."
      ]
    ]
  },
  "manual": {
    "modelFocusNote": "This week's tournament-specific model places added weight on the stats that best translate to TPC Louisiana and the Zurich format, while still grounding player evaluation in the site's core power-ranking framework. The emphasis should lean toward scoring efficiency, iron play, and the player traits most likely to convert opportunities at this venue. Final tournament-specific adjustments can be layered in through the override system.",
    "elevatedGolfers": [
      {
        "player": "Baseline elevated golfer",
        "note": "This slot automatically yields to manual overrides once you add tournament-specific golfer adjustments."
      }
    ],
    "downgradedGolfers": [
      {
        "player": "Baseline downgraded golfer",
        "note": "This slot automatically yields to manual overrides once you add tournament-specific golfer adjustments."
      }
    ]
  }
} satisfies PgaTournamentConfigInput;

export const zurichClassicOfNewOrleans2026PicksTournament = definePgaTournamentConfig(
  applyPgaTournamentOverride(basezurichClassicOfNewOrleans2026PicksTournament, zurichClassicOfNewOrleans2026PicksOverride),
);
