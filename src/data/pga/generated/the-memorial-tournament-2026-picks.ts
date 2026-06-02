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
      "No-cut Signature Event format means the field is elite — public perception can be inflated.",
      "Bogey avoidance and scrambling matter more here than at most birdie-fest venues."
    ],
    "modelFocus": "Lean heavily on SG: Approach and overall tee-to-green quality. Bogey avoidance is a strong differentiator. The no-cut Signature format means field-fit matters more than usual — fade anyone without elite Muirfield Village course history."
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
    "support": "No cut means field concentration is at its highest — the model's approach and bogey avoidance weights are especially relevant this week.",
    "primaryCtaLabel": "Open Full Model",
    "secondaryCtaLabel": "Read written picks"
  },
  "seo": {
    "title": "Memorial Tournament 2026 Picks, Best Bets & PGA Model",
    "description": "Memorial Tournament 2026 picks and model-driven PGA rankings for Muirfield Village Golf Club.",
    "faqs": [
      {
        "question": "What matters most at the Memorial Tournament 2026?",
        "answer": "Muirfield Village heavily rewards SG: Approach, tee-to-green precision, and bogey avoidance. Course history is also a meaningful edge in a no-cut Signature field."
      },
      {
        "question": "Who won the Memorial Tournament last year?",
        "answer": "Scottie Scheffler won the 2025 Memorial Tournament at Muirfield Village Golf Club."
      },
      {
        "question": "Is the Memorial Tournament 2026 a no-cut event?",
        "answer": "Yes — the Memorial Tournament is a Signature Event on the PGA Tour, meaning there is no cut. The field is limited to an elite subset of players."
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
      "sgTotal"
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
        "icon": "🎯",
        "heading": "Approach play dominates",
        "body": "Muirfield Village sets up as an iron-play test. SG: Approach is the strongest predictor of success here."
      },
      {
        "icon": "🛡️",
        "heading": "Bogey avoidance is key",
        "body": "The course is designed to punish mistakes. Players who avoid bogeys consistently outperform their raw scoring average."
      },
      {
        "icon": "📜",
        "heading": "Course history matters",
        "body": "Muirfield Village has consistent setup tendencies. Past finishes at this venue are a meaningful edge in a no-cut field."
      }
    ],
    "presets": [
      {
        "key": "default",
        "label": "Balanced",
        "description": "Standard PGA power-ranking weights with Muirfield Village course adjustments.",
        "weights": {
          "sgTotal": 0.40,
          "sgApproach": 0.20,
          "bogeyAvoidance": 0.15,
          "sgAroundGreen": 0.10,
          "sgPutt": 0.08,
          "drivingAccuracy": 0.07
        }
      },
      {
        "key": "ballStriking",
        "label": "Ball Striking",
        "description": "Heavy emphasis on approach and tee-to-green for the Muirfield Village setup.",
        "weights": {
          "sgTotal": 0.30,
          "sgApproach": 0.30,
          "bogeyAvoidance": 0.15,
          "sgAroundGreen": 0.08,
          "sgPutt": 0.07,
          "drivingAccuracy": 0.10
        }
      }
    ],
    "previewThemes": [
      {
        "key": "default",
        "label": "Default",
        "primaryColor": "#166534",
        "secondaryColor": "#dcfce7"
      }
    ],
    "tierOneBets": [
      {
        "player": "Top model value",
        "odds": "Model lean",
        "analysis": "Update once the initial field and ranking table are confirmed for Muirfield Village."
      }
    ],
    "tierTwoBets": [
      {
        "player": "Secondary model value",
        "odds": "Model lean",
        "analysis": "Use this slot for the next-best fit once you review the ranking table."
      }
    ],
    "tierThreeBets": [
      {
        "player": "Upside model play",
        "odds": "Model lean",
        "analysis": "This section can be sharpened later with manual outrights or placement targets."
      }
    ],
    "fades": [
      "Use the baseline board to identify golfers whose public perception exceeds their weighted statistical fit at Muirfield Village."
    ],
    "top10Intro": "This is the baseline Memorial Tournament top-10 intro. Replace it in the override file once you finalize the weekly betting angle.",
    "top40Intro": "This is the baseline Memorial Tournament top-40 intro. Replace it in the override file after the automated board is generated.",
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
