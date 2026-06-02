import { definePgaTournamentConfig, type PgaTournamentConfigInput } from "@/lib/pga/tournamentConfig";
import { applyPgaTournamentOverride } from "@/lib/pga/tournamentOverrides";

const baseTheMemorialTournament2026PicksTournament = {
  "id": "the-memorial-tournament-2026",
  "slug": "the-memorial-tournament-2026-picks",
  "season": 2026,
  "name": "the Memorial Tournament pres. by Workday",
  "shortName": "the Memorial Tournament",
  "courseName": "Muirfield Village Golf Club",
  "location": "Dublin, OH · USA",
  "schedule": {
    "weekLabel": "June 4, 2026 - 7",
    "startDate": "2026-06-04",
    "endDate": "2026-06-07"
  },
  "summary": {
    "blurb": "Muirfield Village is a Jack Nicklaus design that rewards precision ball-striking, elite approach play, and bogey avoidance above all else.",
    "bullets": [
      "Approach play and iron precision are the dominant factors at Muirfield Village.",
      "No-cut Signature Event — the elite field means course-fit matters more than usual.",
      "Bogey avoidance and course management separate the field here."
    ],
    "modelFocus": "Lean heavily on SG: Approach and overall tee-to-green quality. Bogey avoidance is a strong differentiator at Muirfield Village. The no-cut Signature format amplifies course-fit edges."
  },
  "homepageFeature": {
    "eyebrow": "Featured PGA model",
    "ctaLabel": "Open full Memorial Tournament board"
  },
  "tournamentInfo": {
    "previousWinner": "Scottie Scheffler",
    "purse": "$20,000,000",
    "winningScore": "TBD",
    "averageCutLineLast5Years": "No cut (Signature Event)",
    "courseFitProfile": [
      "Elite approach play and iron precision",
      "Bogey avoidance and course management",
      "Tee-to-green ball-striking",
      "Muirfield Village course history"
    ]
  },
  "hero": {
    "badge": "Signature Event",
    "title": "Memorial Tournament 2026 Picks & Best Bets",
    "intro": "Muirfield Village rewards the most complete tee-to-green players in the game. Use the model to find course-fit edges in an elite Signature Event field.",
    "support": "No cut means field concentration is at its highest — approach and bogey avoidance weights are especially relevant this week.",
    "primaryCtaLabel": "Open Full Model",
    "secondaryCtaLabel": "Read written picks"
  },
  "seo": {
    "title": "Memorial Tournament 2026 Picks, Best Bets & PGA Model",
    "description": "Memorial Tournament 2026 picks and model-driven PGA rankings for Muirfield Village Golf Club. Approach play and bogey avoidance dominate.",
    "faqs": [
      {
        "question": "What matters most at the Memorial Tournament 2026?",
        "answer": "Muirfield Village heavily rewards SG: Approach, tee-to-green precision, and bogey avoidance. Course history is a meaningful edge in a no-cut Signature field."
      },
      {
        "question": "Who won the Memorial Tournament last year?",
        "answer": "Scottie Scheffler won the 2025 Memorial Tournament at Muirfield Village Golf Club."
      },
      {
        "question": "Is the Memorial Tournament 2026 a no-cut event?",
        "answer": "Yes — the Memorial Tournament is a Signature Event on the PGA Tour with no cut and a limited elite field."
      }
    ]
  },
  "model": {
    "dataPath": "/data/pga/the-memorial-tournament-2026.json",
    "eventType": "Signature Event",
    "fieldAverage": "TBD",
    "cutLine": "No cut",
    "noCutLabel": "No cut",
    "courseHistoryDisplay": "Muirfield Village",
    "previewEyebrow": "Build your Memorial Tournament model",
    "previewHeadline": "Shift the weights. See who rises.",
    "previewBody": "Preview the board, then open the full model room to customize every ranking.",
    "previewRankingTitle": "Muirfield Village ranking preview",
    "previewRankingBody": "Lower rank cells grade better. Approach and tee-to-green quality dominate this week.",
    "previewRailCtaTitle": "Model room",
    "previewRailCtaBody": "Open the full PGA model room, apply presets, and scan the Signature field.",
    "previewSliderKeys": [
      "sgApproach",
      "bogeyAvoidance",
      "par4"
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
        "title": "Approach play dominates",
        "body": "Muirfield Village sets up as an iron-play test. SG: Approach is the strongest predictor of success here."
      },
      {
        "title": "Bogey avoidance is key",
        "body": "The course punishes mistakes. Players who avoid bogeys consistently outperform their raw scoring average."
      },
      {
        "title": "Course history matters",
        "body": "Muirfield Village has consistent setup tendencies. Past finishes at this venue are a meaningful edge in a no-cut field."
      },
      {
        "title": "Signature field concentration",
        "body": "No-cut Signature format means every player in the field is elite — differentiate on stats and course-fit, not field depth."
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
        "value": "June 4, 2026 - 7",
        "label": "Tournament week"
      },
      {
        "value": "/pga/the-memorial-tournament-2026-picks/model",
        "label": "Model route"
      }
    ],
    "valueStrip": [
      {
        "title": "Approach-first framework",
        "body": "Muirfield Village's Nicklaus design rewards iron precision above all else. The default preset weights SG: Approach at 26% to reflect this."
      },
      {
        "title": "Bogey avoidance edge",
        "body": "The course is designed to punish errant shots. Bogey avoidance carries 14% weight in the balanced preset — higher than most regular-field events."
      },
      {
        "title": "No-cut Signature field",
        "body": "With no cut and an elite field, course-fit and historical performance at Muirfield Village become stronger differentiators than usual."
      }
    ],
    "weightShiftNotes": [
      {
        "title": "Lead with approach",
        "body": "SG: Approach is the baseline — raise it further in the ball-striking preset when Muirfield Village sets up firm and fast."
      },
      {
        "title": "Bogey avoidance as floor",
        "body": "Add bogey avoidance weight for placement markets — players who avoid big numbers consistently finish in the top-20 range here."
      },
      {
        "title": "Course-history overlay",
        "body": "Manual player adjustments for Muirfield Village history can sharpen outright picks. Past finishes here are not random."
      }
    ],
    "courseInsights": [
      {
        "title": "Muirfield Village Profile",
        "body": "Par 72, 7,392 yards. A Nicklaus design with tree-lined fairways, undulating greens, and demanding approach angles that reward elite iron play."
      },
      {
        "title": "Key Stats This Week",
        "body": "SG: Approach is the top weighted stat (26%). Bogey avoidance and par-4 scoring carry elevated weight — Muirfield Village punishes mid-round mistakes. Course history rounds matter."
      },
      {
        "title": "Model Notes",
        "body": "The Balanced preset favors complete tee-to-green players. Switch to Ball Striking for heavier approach emphasis. Accuracy preset helps identify safer placement-market floors."
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
        "key": "bogeyAvoidanceRank",
        "abbr": "BAvd",
        "mobileLabel": "Bogey Av",
        "tooltip": "Bogey avoidance rank for the current field."
      },
      {
        "key": "drivingAccuracyRank",
        "abbr": "DA",
        "mobileLabel": "Drive Acc",
        "tooltip": "Driving accuracy rank for the current field."
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
        "description": "Balanced Muirfield Village weighting with heavy emphasis on approach and bogey avoidance.",
        "weights": {
          "sgApproach": 26,
          "par4": 14,
          "drivingAccuracy": 10,
          "bogeyAvoidance": 14,
          "sgAroundGreen": 9,
          "trendRank": 9,
          "birdie125150": 7,
          "sgPutting": 5,
          "birdieUnder125": 2,
          "courseTrueSg": 4
        }
      },
      {
        "key": "ballStriking",
        "label": "Ball Striking",
        "description": "Turns the board toward elite iron play and tougher-hole control at Muirfield Village.",
        "weights": {
          "sgApproach": 32,
          "par4": 16,
          "drivingAccuracy": 12,
          "bogeyAvoidance": 10,
          "sgAroundGreen": 5,
          "trendRank": 8,
          "birdie125150": 6,
          "sgPutting": 3,
          "birdieUnder125": 1,
          "courseTrueSg": 7
        }
      },
      {
        "key": "accuracy",
        "label": "Accuracy",
        "description": "Pushes toward fairways and bogey avoidance for a steadier floor at Muirfield Village.",
        "weights": {
          "sgApproach": 20,
          "par4": 13,
          "drivingAccuracy": 22,
          "bogeyAvoidance": 18,
          "sgAroundGreen": 7,
          "trendRank": 7,
          "birdie125150": 4,
          "sgPutting": 3,
          "birdieUnder125": 1,
          "courseTrueSg": 5
        }
      },
      {
        "key": "shortGame",
        "label": "Short Game",
        "description": "Raises scrambling and putting when recovery skill matters more at Muirfield Village.",
        "weights": {
          "sgApproach": 18,
          "par4": 11,
          "drivingAccuracy": 8,
          "bogeyAvoidance": 12,
          "sgAroundGreen": 20,
          "trendRank": 9,
          "birdie125150": 5,
          "sgPutting": 11,
          "birdieUnder125": 1,
          "courseTrueSg": 5
        }
      }
    ],
    "presets": [
      {
        "key": "balanced",
        "label": "Balanced",
        "description": "Default Muirfield Village weighting across the full board.",
        "weights": {
          "sgApproach": 26,
          "par4": 14,
          "drivingAccuracy": 10,
          "bogeyAvoidance": 14,
          "sgAroundGreen": 9,
          "trendRank": 9,
          "birdie125150": 7,
          "sgPutting": 5,
          "birdieUnder125": 2,
          "courseTrueSg": 4
        }
      },
      {
        "key": "outright",
        "label": "Outright",
        "description": "More ceiling and recent-form pressure for outright and top-end betting.",
        "weights": {
          "sgApproach": 28,
          "par4": 13,
          "drivingAccuracy": 6,
          "bogeyAvoidance": 8,
          "sgAroundGreen": 6,
          "trendRank": 17,
          "birdie125150": 8,
          "sgPutting": 7,
          "birdieUnder125": 4,
          "courseTrueSg": 3
        }
      },
      {
        "key": "top20",
        "label": "Top 20",
        "description": "Floor-first weighting for top-10/top-20 placement markets at Muirfield Village.",
        "weights": {
          "sgApproach": 22,
          "par4": 14,
          "drivingAccuracy": 14,
          "bogeyAvoidance": 18,
          "sgAroundGreen": 8,
          "trendRank": 8,
          "birdie125150": 5,
          "sgPutting": 5,
          "birdieUnder125": 2,
          "courseTrueSg": 4
        }
      }
    ]
  },
  "picksPage": {
    "top10Intro": "This is the baseline Memorial Tournament top-10 intro. Replace it in the override file once you finalize the weekly betting angle.",
    "top40Intro": "This is the baseline Memorial Tournament top-40 intro. Replace it in the override file after the automated board is generated.",
    "strategyBullets": [
      "Use Muirfield Village course history as a baseline course-fit input.",
      "Lean into the strongest approach and bogey-avoidance stats first.",
      "Add manual weight tweaks once the first version of the board is live."
    ],
    "parlayBullets": [
      "Use the top-20 preset to identify lower-volatility golfers for placement parlays.",
      "Avoid forcing outrights into parlays when the automated board shows a better floor-first path.",
      "Use manual overrides to add any Muirfield Village-specific player fades before publishing."
    ],
    "tierOneBets": [
      {
        "player": "Baseline model leader",
        "odds": "Model lean",
        "analysis": "The auto-generated baseline highlights the strongest all-around approach-play fit until manual betting adjustments are added."
      }
    ],
    "tierTwoBets": [
      {
        "player": "Secondary model value",
        "odds": "Model lean",
        "analysis": "Use this slot for the next-best course-fit once you review the initial ranking table and market board."
      }
    ],
    "tierThreeBets": [
      {
        "player": "Upside model play",
        "odds": "Model lean",
        "analysis": "This section can be sharpened with manual outrights or placement targets after weekly tuning."
      }
    ],
    "fades": [
      "Use the baseline board to identify golfers whose public perception exceeds their weighted statistical fit at Muirfield Village."
    ],
    "top40Rows": [
      [
        "Top-40 model anchor",
        "Use the first model pass to identify the safest floor-first golfers before adding manual placement-market edits."
      ]
    ],
    "summaryRows": [
      [
        "Current model board",
        "Model lean",
        "8",
        "Initial weekly summary generated from the active tournament configuration and live ranking table."
      ]
    ]
  },
  "manual": {
    "elevatedGolfers": [
      {
        "player": "Neutral model lift",
        "note": "This slot automatically yields to manual overrides once you add tournament-specific golfer adjustments."
      }
    ],
    "downgradedGolfers": [
      {
        "player": "Neutral model fade",
        "note": "This slot automatically yields to manual overrides once you add tournament-specific golfer adjustments."
      }
    ]
  }
} satisfies PgaTournamentConfigInput;

export const theMemorialTournament2026PicksTournament = definePgaTournamentConfig(
  applyPgaTournamentOverride(baseTheMemorialTournament2026PicksTournament),
);
