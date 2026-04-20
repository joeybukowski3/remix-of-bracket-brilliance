import { definePgaTournamentConfig, type PgaTournamentConfigInput } from "@/lib/pga/tournamentConfig";
import { applyPgaTournamentOverride } from "@/lib/pga/tournamentOverrides";
import { cadillacChampionship2026PicksOverride } from "@/data/pga/overrides/cadillac-championship-2026-picks";

const basecadillacChampionship2026PicksTournament = {
  "id": "cadillac-championship-2026",
  "slug": "cadillac-championship-2026-picks",
  "season": 2026,
  "name": "Cadillac Championship",
  "shortName": "Cadillac Championship",
  "courseName": "Trump National Doral (Blue Monster)",
  "location": "Miami, FL",
  "schedule": {
    "weekLabel": "April 30, 2026 - May 3",
    "startDate": "2026-04-30",
    "endDate": "2026-05-03"
  },
  "summary": {
    "blurb": "The Blue Monster should reward complete tee-to-green players with enough power, control, and scoring resilience to handle a difficult, high-visibility setup.",
    "bullets": [
      "Longer, more demanding driving profile than Zurich.",
      "Approach quality and bogey avoidance should matter more than a pure birdie chase.",
      "Baseline page can go live before tournament-specific notes are finalized."
    ],
    "modelFocus": "The default Cadillac shell should stay balanced until manual adjustments are added, with enough emphasis on approach quality, tee-to-green stability, and difficult-hole scoring to act as a clean baseline."
  },
  "homepageFeature": {
    "eyebrow": "Next week's event",
    "ctaLabel": "Open full Cadillac Championship board"
  },
  "tournamentInfo": {
    "purse": "$20,000,000",
    "winningScore": "Official score archive unavailable in current feed",
    "averageCutLineLast5Years": "Historical cut-line average unavailable in current feed",
    "courseFitProfile": [
      "Tee-to-green strength",
      "Approach play",
      "Bogey avoidance",
      "Long-course control"
    ]
  },
  "hero": {
    "badge": "PGA tournament model",
    "title": "Cadillac Championship 2026 Picks & Best Bets",
    "intro": "The Cadillac Championship page is live with the active model, rankings table, and tournament routing already wired into the weekly PGA workflow.",
    "support": "Use the override file to sharpen the writeup, weekly emphasis, player boosts, and market-specific angles without rebuilding the page shell.",
    "primaryCtaLabel": "Open Full Model",
    "secondaryCtaLabel": "Read written picks"
  },
  "seo": {
    "title": "Cadillac Championship 2026 Picks, Best Bets & PGA Model",
    "description": "Cadillac Championship 2026 picks and model-driven PGA rankings for Trump National Doral (Blue Monster).",
    "faqs": [
      {
        "question": "What matters most for Cadillac Championship 2026?",
        "answer": "The Blue Monster should reward complete tee-to-green players with enough power, control, and scoring resilience to handle a difficult, high-visibility setup."
      },
      {
        "question": "How should you use the Cadillac Championship model?",
        "answer": "Start with the balanced preset, review the leaderboard, then use the override file to push the board toward the profile you want to bet."
      },
      {
        "question": "Where do manual weekly adjustments go?",
        "answer": "Edit src/data/pga/overrides/cadillac-championship-2026-picks.ts to change weights, narrative copy, and player adjustments without regenerating the package."
      },
      {
        "question": "How are the rankings updated?",
        "answer": "The player table is generated from the weekly PGA workbook export and re-ranked automatically through the shared PGA model pipeline."
      }
    ]
  },
  "model": {
    "dataPath": "/data/pga/cadillac-championship-2026.json",
    "eventType": "Signature Event",
    "fieldAverage": "Baseline field build",
    "cutLine": "No-cut signature benchmark",
    "noCutLabel": "No cut",
    "courseHistoryDisplay": "Blue Monster",
    "previewEyebrow": "Build your Cadillac Championship model",
    "previewHeadline": "Shift the weights. See who rises.",
    "previewBody": "Preview the board, then open the full model room to customize every ranking.",
    "previewRankingTitle": "Blue Monster ranking preview",
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
        "value": "April 30, 2026 - May 3",
        "label": "Tournament week"
      },
      {
        "value": "/pga/cadillac-championship-2026-picks/model",
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
        "body": "The Blue Monster should reward complete tee-to-green players with enough power, control, and scoring resilience to handle a difficult, high-visibility setup."
      },
      {
        "title": "Key traits",
        "body": "Longer, more demanding driving profile than Zurich."
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
    "top10Intro": "This is the baseline Cadillac Championship top-10 intro. Replace it in the override file once you finalize the weekly betting angle.",
    "top40Intro": "This is the baseline Cadillac Championship top-40 intro. Replace it in the override file after the automated board is generated.",
    "strategyBullets": [
      "Longer, more demanding driving profile than Zurich.",
      "Approach quality and bogey avoidance should matter more than a pure birdie chase.",
      "Baseline page can go live before tournament-specific notes are finalized."
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
    "modelFocusNote": "The default Cadillac shell should stay balanced until manual adjustments are added, with enough emphasis on approach quality, tee-to-green stability, and difficult-hole scoring to act as a clean baseline.",
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

export const cadillacChampionship2026PicksTournament = definePgaTournamentConfig(
  applyPgaTournamentOverride(basecadillacChampionship2026PicksTournament, cadillacChampionship2026PicksOverride),
);
