import { CURRENT_TOURNAMENT_DESCRIPTION, CURRENT_TOURNAMENT_PATH, CURRENT_TOURNAMENT_TITLE, currentTournamentFaqs } from "@/lib/seo/pgaSeo";

export const rbcHeritage2026Content = {
  slug: "rbc-heritage-2026-picks",
  title: CURRENT_TOURNAMENT_TITLE,
  description: CURRENT_TOURNAMENT_DESCRIPTION,
  path: CURRENT_TOURNAMENT_PATH,
  heroTitle: "RBC Heritage 2026 Picks & Best Bets",
  heroIntro:
    "Looking for the best RBC Heritage 2026 picks? This page breaks down top golf bets, top 40 parlay plays, and model-driven insights using course history at Harbour Town, recent form, and key PGA Tour statistics. The goal is to identify high-value players based on how they fit this course - not just market odds.",
  heroSupport:
    "These are the RBC Heritage best bets and Harbour Town course history picks the model likes most, with added context for PGA best bets today, golf betting picks today, and safer RBC Heritage parlays.",
  top10Intro:
    "These top 10 golf bets are the strongest value plays from the board, balancing price, Harbour Town fit, and recent form.",
  top40Intro:
    "High-floor players identified by the model based on course history, consistency, and Harbour Town fit. Ideal for RBC Heritage top 40 picks, RBC Heritage parlays, and safer betting structures.",
  overviewBullets: [
    "Recent Form via DG Rank and TrendRank.",
    "Course History at Harbour Town through Course True SG and rounds played.",
    "Key Stat Fit built around approach, accuracy, par-4 scoring, bogey avoidance, and short-game performance.",
    "Every category is normalized across the field and reweighted to match Harbour Town's course profile.",
    "The weighting leans into SG: Approach, Driving Accuracy, Par 4 Scoring, Bogey Avoidance, and short-iron or wedge ranges.",
    "The model also accounts for post-Masters performance trends and Harbour Town experience before producing a composite score.",
    "That output ranks expected performance and highlights betting value versus market odds.",
  ],
  strategyBullets: [
    "Harbour Town rewards accuracy over distance.",
    "SG: Approach is the most important stat in the model this week.",
    "Players in the Masters T6-15 range have historically performed best here.",
    "Course history matters more here than at most PGA events.",
    "Top 40 bets favor consistency over volatility.",
  ],
  parlayBullets: [
    "Combine high-floor players in Top 40 markets instead of chasing only top-10 volatility.",
    "Avoid volatile golfers whose missed-cut risk can kill a multi-leg ticket early.",
    "Focus on course-fit consistency, especially Harbour Town accuracy and approach signals.",
    "Use model rankings over public perception when choosing parlay anchors.",
  ],
  faqs: currentTournamentFaqs,
} as const;
