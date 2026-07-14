import { definePgaTournamentConfig, type PgaTournamentConfigInput } from "@/lib/pga/tournamentConfig";
import { applyPgaTournamentOverride } from "@/lib/pga/tournamentOverrides";
import { theOpen2026PicksOverride } from "@/data/pga/overrides/the-open-2026-picks";

const basetheOpen2026PicksTournament = {
  "id": "the-open-2026",
  "slug": "the-open-2026-picks",
  "season": 2026,
  "name": "The Open",
  "shortName": "The Open",
  "courseName": "Royal Birkdale GC",
  "location": "Southport, England",
  "schedule": {
    "weekLabel": "July 16, 2026 - 19",
    "startDate": "2026-07-16",
    "endDate": "2026-07-19"
  },
  "summary": {
    "blurb": "Royal Birkdale's 2026 championship setup is a par-70, 7,223-yard links test where approach play, controlled scoring, and Open history feed the existing detailed model.",
    "bullets": [
      "The official 2026 championship setup is par 70 at 7,223 yards.",
      "The detailed model uses current PGA Tour statistics and corrected JKB Trend without substituting missing player data.",
      "Royal Birkdale history is used when supported, with broader Open Championship history as the configured sparse-venue fallback."
    ],
    "modelFocus": "The shared detailed model uses current form, field-relative statistical ranks, and supported Open history. Missing categories remain unavailable and the scoring engine renormalizes only across observed evidence."
  },
  "homepageFeature": {
    "eyebrow": "Featured PGA model",
    "ctaLabel": "Open full The Open board"
  },
  "tournamentInfo": {
    "previousWinner": "Scottie Scheffler",
    "winningScore": "Official score archive unavailable in current feed",
    "averageCutLineLast5Years": "Historical cut-line average unavailable in current feed",
    "courseFitProfile": [
      "The official 2026 championship setup is par 70 at 7,223 yards.",
      "The detailed model uses current PGA Tour statistics and corrected JKB Trend without substituting missing player data.",
      "Royal Birkdale history is used when supported, with broader Open Championship history as the configured sparse-venue fallback."
    ]
  },
  "hero": {
    "badge": "PGA tournament model",
    "title": "The Open 2026 Detailed Model",
    "intro": "The detailed The Open model uses the current field and the shared PGA ranking architecture.",
    "support": "Switch presets or edit custom weights to compare the current normalized model inputs.",
    "primaryCtaLabel": "Open Full Model",
    "secondaryCtaLabel": "Tournament overview"
  },
  "seo": {
    "title": "The Open 2026 Detailed PGA Model",
    "description": "The Open 2026 detailed PGA model rankings for Royal Birkdale GC.",
    "faqs": [
      {
        "question": "What data feeds the The Open model?",
        "answer": "Royal Birkdale's 2026 championship setup is a par-70, 7,223-yard links test where approach play, controlled scoring, and Open history feed the existing detailed model."
      },
      {
        "question": "How are missing categories handled?",
        "answer": "Missing categories remain unavailable. The shared model applies its minimum-evidence gate and renormalizes across observed inputs."
      },
      {
        "question": "Can the model weights be changed?",
        "answer": "Yes. Use an existing preset, Top 20 Profile, or Custom Model on the detailed model page."
      },
      {
        "question": "How are the rankings updated?",
        "answer": "The validated weekly PGA refresh rebuilds the detailed artifact from the current field, player statistics, JKB Trend, and configured tournament history."
      }
    ]
  },
  "model": {
    "dataPath": "/data/pga/the-open-2026.json",
    "eventType": "Major Championship",
    "fieldAverage": "TBD",
    "cutLine": "TBD",
    "noCutLabel": "Major cut",
    "courseHistoryDisplay": "Royal Birkdale",
    "previewEyebrow": "Build your The Open model",
    "previewHeadline": "Shift the weights. See who rises.",
    "previewBody": "Preview the board, then open the full model room to customize every ranking.",
    "previewRankingTitle": "Royal Birkdale ranking preview",
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
        "value": "July 16, 2026 - 19",
        "label": "Tournament week"
      },
      {
        "value": "/pga/the-open-2026-picks/model",
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
        "body": "Royal Birkdale's 2026 championship setup is a par-70, 7,223-yard links test where approach play, controlled scoring, and Open history feed the existing detailed model."
      },
      {
        "title": "Key traits",
        "body": "The official 2026 championship setup is par 70 at 7,223 yards."
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
    "top10Intro": "",
    "top40Intro": "",
    "strategyBullets": [],
    "parlayBullets": [],
    "tierOneBets": [],
    "tierTwoBets": [],
    "tierThreeBets": [],
    "fades": [],
    "top40Rows": [],
    "summaryRows": []
  },
  "manual": {
    "modelFocusNote": "The shared detailed model uses current form, field-relative statistical ranks, and supported Open history. Missing categories remain unavailable and the scoring engine renormalizes only across observed evidence."
  }
} satisfies PgaTournamentConfigInput;

export const theOpen2026PicksTournament = definePgaTournamentConfig(
  applyPgaTournamentOverride(basetheOpen2026PicksTournament, theOpen2026PicksOverride),
);
