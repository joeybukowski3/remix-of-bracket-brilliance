import { definePgaTournamentConfig, type PgaTournamentConfigInput } from "@/lib/pga/tournamentConfig";
import { applyPgaTournamentOverride } from "@/lib/pga/tournamentOverrides";
import { rbcHeritage2026Override } from "@/data/pga/overrides/rbc-heritage-2026-picks";

const baseRbcHeritage2026Tournament = {
  id: "rbc-heritage-2026",
  slug: "rbc-heritage-2026-picks",
  season: 2026,
  name: "RBC Heritage",
  shortName: "RBC Heritage",
  courseName: "Harbour Town Golf Links",
  location: "Hilton Head Island",
  featured: true,
  schedule: {
    weekLabel: "April 16-19, 2026",
    startDate: "2026-04-16",
    endDate: "2026-04-19",
  },
  summary: {
    blurb: "Harbour Town is a precision-first signature event where approach play, fairway control, wedge proximity, and repeat course history all matter more than pure power.",
    bullets: [
      "Signature-event field with no-cut scoring pressure",
      "Harbour Town rewards accuracy, wedges, and patience",
      "Course history carries more weight here than at many TOUR stops",
    ],
  },
  homepageFeature: {
    eyebrow: "Featured PGA model",
    ctaLabel: "Open full RBC board",
  },
  hero: {
    badge: "golf betting model picks",
    title: "RBC Heritage 2026 Picks & Best Bets",
    intro:
      "Looking for the best RBC Heritage 2026 picks? This page breaks down top golf bets, top 40 parlay plays, and model-driven insights using course history at Harbour Town, recent form, and key PGA Tour statistics. The goal is to identify high-value players based on how they fit this course, not just market odds.",
    support:
      "These are the RBC Heritage best bets and Harbour Town course history picks the model likes most, with added context for PGA best bets today, golf betting picks today, and safer RBC Heritage parlays.",
    primaryCtaLabel: "Open Full Model",
    secondaryCtaLabel: "Read written picks",
  },
  seo: {
    title: "RBC Heritage 2026 Picks, Best Bets & Top 40 Parlays | PGA Model",
    description:
      "RBC Heritage 2026 picks, best bets, and top 40 parlay golfers. Data-driven PGA model using course history, form, and key stats to find value.",
    faqs: [
      {
        question: "What are the best bets for RBC Heritage 2026?",
        answer:
          "The model leans to Collin Morikawa, Patrick Cantlay, Jordan Spieth, and Sam Burns as the strongest RBC Heritage 2026 best bets based on course history, approach play, and recent form.",
      },
      {
        question: "What stats matter most at Harbour Town?",
        answer:
          "Harbour Town rewards SG: Approach, driving accuracy, par-4 scoring, bogey avoidance, and strong wedge play more than pure driving distance.",
      },
      {
        question: "What are the safest golf bets?",
        answer:
          "Top 40 golf bets are usually the safest betting structure because they emphasize consistency, cut-making, and course fit instead of outright win volatility.",
      },
      {
        question: "How do Top 40 golf bets work?",
        answer:
          "A Top 40 bet cashes if a golfer finishes 40th or better. They are often used in parlays because the floor is higher than top-10 or outright markets.",
      },
    ],
  },
  model: {
    dataPath: "/data/pga/rbc-heritage-2026.json",
    eventType: "Signature Event",
    fieldAverage: "70.4",
    cutLine: "-1",
    noCutLabel: "No cut",
    relatedEventLabel: "Masters 2026",
    courseHistoryDisplay: "Harbour Town",
    previewEyebrow: "Build your RBC Heritage model",
    previewHeadline: "Shift the weights. See who rises.",
    previewBody: "Preview the board, then open the full model room to customize every ranking.",
    previewRankingTitle: "Harbour Town ranking preview",
    previewRankingBody: "Tap a weight view to change the board. Lower rank cells grade better.",
    previewRailCtaTitle: "Model Room CTA",
    previewRailCtaBody: "Open the full Harbour Town model, adjust every weight, and scan the entire field.",
    previewSliderKeys: ["sgApproach", "drivingAccuracy", "sgAroundGreen"],
    previewThemeKeys: ["default", "courseHistory", "ballStriking", "accuracy"],
    topProjectionPrimaryStatKey: "sgApproachRank",
    topProjectionPrimaryStatLabel: "Approach",
    heroSteps: [
      {
        title: "Customize the Harbour Town model",
        body: "Start with the course-fit lens you want, then push the live board toward the stat profile you trust most.",
      },
      {
        title: "Preview who rises",
        body: "Watch the ranking table react before you commit to outrights, Top 10s, or safer Top 40 structures.",
      },
      {
        title: "Open the full model room",
        body: "Use the complete slider board to fine-tune every major input across the field.",
      },
      {
        title: "Then read the card",
        body: "Once the board is set, use the written picks, fades, and parlay notes as the betting layer on top.",
      },
    ],
    heroStats: [
      { value: "83", label: "Players ranked" },
      { value: "5", label: "Quick weight views" },
      { value: "3", label: "Slider lanes previewed" },
      { value: "Live", label: "Heat-map table" },
      { value: "/pga/model", label: "Full model room" },
    ],
    valueStrip: [
      {
        title: "Adjust weights your way",
        body: "Lean harder into Harbour Town course history, ball striking, accuracy, or short-game touch before you place a bet.",
      },
      {
        title: "Compare Harbour Town fits",
        body: "See which names climb when the setup favors precision, wedge play, and course-control instead of raw power.",
      },
      {
        title: "See full-field rankings instantly",
        body: "The preview shows the model logic fast. The full room opens the complete table with every golfer and slider.",
      },
    ],
    weightShiftNotes: [
      {
        title: "Course history pressure test",
        body: "Boosting Harbour Town history gives more lift to players with repeat reps and true course SG staying power.",
      },
      {
        title: "Ball-striking lens",
        body: "When approach and control matter more, the board tilts toward clean iron players who can keep the round stress-free.",
      },
      {
        title: "Short-game fallback",
        body: "Raising around-the-green and putting weight rewards players who can scramble when Harbour Town starts defending itself.",
      },
    ],
    courseInsights: [
      { title: "Approach", body: "Critical driver at Harbour Town." },
      { title: "Off the Tee", body: "Accuracy matters more than distance this week." },
      {
        title: "Pro Tip",
        body: "Lean into approach rank, bogey avoidance, and Harbour Town history when pricing top-10 and top-40 tickets.",
      },
    ],
    statColumns: [
      { key: "sgApproachRank", abbr: "App", mobileLabel: "Approach", tooltip: "SG: Approach the Green — Strokes Gained on approach shots. Most important stat at Harbour Town." },
      { key: "par4Rank", abbr: "P4", mobileLabel: "Par 4", tooltip: "Par 4 Scoring Average — average score on par 4s. Lower score = better rank." },
      { key: "drivingAccuracyRank", abbr: "DA", mobileLabel: "Drive Acc", tooltip: "Driving Accuracy % — percentage of fairways hit. Key at narrow Harbour Town." },
      { key: "bogeyAvoidanceRank", abbr: "BAvd", mobileLabel: "Bogey Av", tooltip: "Bogey Avoidance % — how often a player avoids making bogey or worse." },
      { key: "sgAroundGreenRank", abbr: "ARG", mobileLabel: "ARG", tooltip: "SG: Around the Green — Strokes Gained chipping and pitching from off the green." },
      { key: "birdie125150Rank", abbr: "125", mobileLabel: "125-150", tooltip: "Birdie or Better from 125–150 yards — key Harbour Town scoring distance." },
      { key: "sgPuttingRank", abbr: "Putt", mobileLabel: "Putting", tooltip: "SG: Putting — strokes gained on the greens." },
      { key: "birdieUnder125Rank", abbr: "<125", mobileLabel: "<125", tooltip: "Birdie or Better from inside 125 yards — scoring from close range." },
    ],
    previewThemes: [
      {
        key: "default",
        label: "Default Model",
        description: "Balanced Harbour Town weighting across approach play, accuracy, scoring, and course-fit context.",
        weights: { sgApproach: 22, par4: 14, drivingAccuracy: 12, bogeyAvoidance: 12, sgAroundGreen: 10, trendRank: 10, birdie125150: 7, sgPutting: 6, birdieUnder125: 3, courseTrueSg: 4 },
      },
      {
        key: "courseHistory",
        label: "Course History",
        description: "Leans harder on Harbour Town course SG and repeat comfort on this course without dropping approach out of the mix.",
        weights: { sgApproach: 18, par4: 12, drivingAccuracy: 10, bogeyAvoidance: 10, sgAroundGreen: 8, trendRank: 8, birdie125150: 5, sgPutting: 5, birdieUnder125: 2, courseTrueSg: 22 },
      },
      {
        key: "ballStriking",
        label: "Ball Striking",
        description: "Turns the board toward elite iron play, precise par-4 scoring, and fairway control for a sharper tee-to-green lean.",
        weights: { sgApproach: 28, par4: 15, drivingAccuracy: 17, bogeyAvoidance: 8, sgAroundGreen: 6, trendRank: 10, birdie125150: 6, sgPutting: 3, birdieUnder125: 1, courseTrueSg: 6 },
      },
      {
        key: "accuracy",
        label: "Accuracy",
        description: "Pushes the preview toward fairways found, bogey avoidance, and steady Harbour Town navigation.",
        weights: { sgApproach: 18, par4: 13, drivingAccuracy: 24, bogeyAvoidance: 18, sgAroundGreen: 6, trendRank: 7, birdie125150: 4, sgPutting: 3, birdieUnder125: 1, courseTrueSg: 6 },
      },
      {
        key: "shortGame",
        label: "Short Game",
        description: "Raises the value of scrambling and Bermuda putting when you want more recovery skill built into the board.",
        weights: { sgApproach: 17, par4: 10, drivingAccuracy: 9, bogeyAvoidance: 11, sgAroundGreen: 20, trendRank: 8, birdie125150: 5, sgPutting: 12, birdieUnder125: 3, courseTrueSg: 5 },
      },
    ],
    presets: [
      {
        key: "balanced",
        label: "Balanced",
        description: "Default Harbour Town weights across all categories.",
        weights: { sgApproach: 22, par4: 14, drivingAccuracy: 12, bogeyAvoidance: 12, sgAroundGreen: 10, trendRank: 10, birdie125150: 7, sgPutting: 6, birdieUnder125: 3, courseTrueSg: 4 },
      },
      {
        key: "outright",
        label: "Outright",
        description: "Maximizes ceiling. Favors elite recent form and birdie-making over course fit.",
        weights: { sgApproach: 25, trendRank: 20, birdieUnder125: 12, birdie125150: 8, par4: 12, sgPutting: 10, sgAroundGreen: 5, bogeyAvoidance: 4, drivingAccuracy: 2, courseTrueSg: 2 },
      },
      {
        key: "top10",
        label: "Top 10",
        description: "Upside play balancing form, approach, and scoring over a consistent floor.",
        weights: { sgApproach: 22, trendRank: 15, par4: 13, birdieUnder125: 10, birdie125150: 8, sgPutting: 10, sgAroundGreen: 8, bogeyAvoidance: 7, drivingAccuracy: 4, courseTrueSg: 3 },
      },
      {
        key: "top20",
        label: "Top 20",
        description: "Balanced model weighting form and course fit equally.",
        weights: { sgApproach: 20, drivingAccuracy: 14, bogeyAvoidance: 14, par4: 12, sgAroundGreen: 10, courseTrueSg: 10, trendRank: 8, sgPutting: 7, birdie125150: 3, birdieUnder125: 2 },
      },
      {
        key: "top40",
        label: "Top 40",
        description: "Floor-first. Prioritizes course history, accuracy, and bogey avoidance.",
        weights: { drivingAccuracy: 18, bogeyAvoidance: 18, courseTrueSg: 15, sgApproach: 15, par4: 12, sgAroundGreen: 10, sgPutting: 5, trendRank: 4, birdie125150: 2, birdieUnder125: 1 },
      },
    ],
  },
  picksPage: {
    top10Intro: "These top 10 golf bets are the strongest value plays from the board, balancing price, Harbour Town fit, and recent form.",
    top40Intro:
      "High-floor players identified by the model based on course history, consistency, and Harbour Town fit. Ideal for RBC Heritage top 40 picks, RBC Heritage parlays, and safer betting structures.",
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
    tierOneBets: [
      { player: "Collin Morikawa", odds: "+176 T10", edge: "Edge 16", analysis: "One of the strongest RBC Heritage 2026 picks on the board. Elite Harbour Town course history, the best SG: Approach profile in the field, and an ideal post-Masters momentum bucket create the clearest value gap." },
      { player: "Patrick Cantlay", odds: "+188 T10", edge: "Edge 14", analysis: "A top-tier RBC Heritage best bet with 30 rounds of Harbour Town experience and the No. 2 Course SG profile in the field. The approach weakness is offset by short-game strength and elite course fit." },
      { player: "Jordan Spieth", odds: "+230 T10", edge: "Edge 12", analysis: "Harbour Town course history picks rarely get cleaner than Spieth. He owns a win here, 36 rounds of experience, and the scrambling profile that keeps his floor intact on this layout." },
      { player: "Sam Burns", odds: "+230 T10", edge: "Edge 12", analysis: "Burns grades as one of the better golf betting model picks this week thanks to strong Harbour Town history, DG Rank No. 15, and a stable momentum profile at a still-reasonable price." },
    ],
    tierTwoBets: [
      { player: "Daniel Berger", odds: "+500", analysis: "Best long-shot value in the model. Elite Harbour Town history keeps him firmly in the RBC Heritage 2026 picks mix." },
      { player: "Xander Schauffele", odds: "+126", analysis: "Expensive, but still one of the steadier PGA golf best bets today because the profile is balanced across every key stat bucket." },
      { player: "Tommy Fleetwood", odds: "+142", analysis: "Strong fit for Harbour Town and one of the cleaner top 10 golf bets when you want low volatility with real upside." },
      { player: "Si Woo Kim", odds: "+196", analysis: "Elite approach play plus real Harbour Town experience make him one of the better value names for RBC Heritage best bets." },
    ],
    tierThreeBets: [
      { player: "Ryo Hisatsune", odds: "+500", analysis: "Limited history, but the stat fit is strong enough to keep him in the conversation for higher-upside golf betting model picks." },
      { player: "Matt Fitzpatrick", odds: "+138", analysis: "Elite Harbour Town history and a reliable skill set make him a safer upside play, even if the number is fairly efficient." },
    ],
    fades: [
      "Russell Henley -> T1-5 Masters group historically underperforms here.",
      "Cameron Young -> Augusta-driven pricing without the same Harbour Town fit.",
      "Jake Knapp -> Worst Course SG profile in the field.",
      "Ludvig Aberg -> Limited Harbour Town sample with a price inflated by talent and ranking.",
    ],
    top40Rows: [
      ["Collin Morikawa", "Elite SG: Approach plus strong Harbour Town history gives him one of the steadiest floors in the field."],
      ["Patrick Cantlay", "Best-in-field course history with a 2.40 Course SG mark and 30 Harbour Town rounds."],
      ["Matt Fitzpatrick", "Thirty-eight Harbour Town rounds, a win here in 2023, and the accuracy-short game mix this course rewards."],
      ["Xander Schauffele", "Top-tier consistency, low missed-cut risk, and a balanced profile with no obvious weakness."],
      ["Tommy Fleetwood", "Strong Harbour Town history and elite ball-striking create a low-volatility Top 40 profile."],
      ["Jordan Spieth", "Harbour Town specialist whose scrambling and creativity keep the floor high even when the irons cool."],
      ["Russell Henley", "Accuracy and approach remain a clean fit for Harbour Town's tighter setup."],
      ["Corey Conners", "One of the most consistent ball-strikers on TOUR and a natural fit for this type of course test."],
      ["Si Woo Kim", "Thirty Harbour Town rounds, elite approach play, and strong overall course fit."],
      ["Daniel Berger", "Four straight strong finishes here and elite Harbour Town Course SG make him one of the best RBC Heritage parlays anchors."],
    ],
    summaryRows: [
      ["Morikawa", "+176", "16", "Elite approach + HT history"],
      ["Cantlay", "+188", "14", "Best HT profile"],
      ["Schauffele", "+126", "13", "Balanced elite metrics"],
      ["Fitzpatrick", "+138", "13", "Proven winner here"],
      ["Spieth", "+230", "12", "Course specialist"],
      ["Burns", "+230", "12", "Undervalued HT fit"],
      ["Berger", "+500", "11", "Best long-shot value"],
      ["Si Woo Kim", "+196", "11", "Elite approach + experience"],
    ],
  },
} satisfies PgaTournamentConfigInput;

export const rbcHeritage2026Tournament = definePgaTournamentConfig(
  applyPgaTournamentOverride(baseRbcHeritage2026Tournament, rbcHeritage2026Override),
);
