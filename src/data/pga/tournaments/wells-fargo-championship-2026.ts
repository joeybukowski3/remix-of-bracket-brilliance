import { definePgaTournamentConfig, type PgaTournamentConfigInput } from "@/lib/pga/tournamentConfig";
import { applyPgaTournamentOverride } from "@/lib/pga/tournamentOverrides";
import { wellsFargoChampionship2026Override } from "@/data/pga/overrides/wells-fargo-championship-2026-picks";

const baseWellsFargoChampionship2026Tournament = {
  id: "wells-fargo-championship-2026",
  slug: "wells-fargo-championship-2026-picks",
  season: 2026,
  name: "Wells Fargo Championship",
  shortName: "Wells Fargo",
  courseName: "Quail Hollow Club",
  location: "Charlotte",
  indexable: false,
  schedule: {
    weekLabel: "May 7-10, 2026",
    startDate: "2026-05-07",
    endDate: "2026-05-10",
  },
  summary: {
    blurb: "Quail Hollow leans toward complete tee-to-green players, with long-iron quality, difficult par-4 scoring, and bogey avoidance carrying more value than one-week putting spikes.",
    bullets: [
      "Demanding par-4 setup with real ball-striking separation",
      "Form still matters, but tee-to-green control drives the board",
      "Useful event for weighing floor-first Top 40 profiles",
    ],
  },
  homepageFeature: {
    eyebrow: "Featured PGA model",
    ctaLabel: "Open full Wells Fargo board",
  },
  hero: {
    badge: "PGA best bets today",
    title: "Wells Fargo Championship 2026 Picks & Best Bets",
    intro:
      "Looking for the best Wells Fargo Championship 2026 picks? This page breaks down top golf bets, top 40 parlay plays, and model-driven predictions based on course history, recent form, and key PGA Tour statistics.",
    support:
      "This board leans on long-iron quality, scoring on demanding par 4s, and players whose form profile can hold up on a tougher ball-striking test.",
    primaryCtaLabel: "Open Full Model",
    secondaryCtaLabel: "Read written picks",
  },
  seo: {
    title: "Wells Fargo Championship 2026 Picks, Best Bets & Top 40 Parlays | PGA Model",
    description:
      "Wells Fargo Championship 2026 picks, best bets, and top 40 parlay golfers. Data-driven PGA model using course fit, form, and key stats to find betting value.",
    faqs: [
      {
        question: "What are the best bets for the Wells Fargo Championship 2026?",
        answer:
          "The model leans most heavily toward Rory McIlroy, Xander Schauffele, Collin Morikawa, and Tommy Fleetwood as the strongest Wells Fargo Championship 2026 best bets.",
      },
      {
        question: "What stats matter most for the Wells Fargo Championship?",
        answer:
          "This setup rewards SG: Approach, par-4 scoring, controlled driving, bogey avoidance, and the ability to gain tee to green over a demanding layout.",
      },
      {
        question: "What are the safest golf bets this week?",
        answer:
          "Top 40 bets remain the safest structure because they emphasize consistent cut-makers and reduce the need for a true contending finish.",
      },
      {
        question: "How do Top 40 golf bets work?",
        answer:
          "A Top 40 bet cashes if a golfer finishes 40th or better, which makes it a popular market for parlays and safer multi-leg betting slips.",
      },
    ],
  },
  model: {
    dataPath: "/data/pga/wells-fargo-championship-2026.json",
    eventType: "Signature Event",
    fieldAverage: "71.8",
    cutLine: "+1",
    noCutLabel: "No cut",
    courseHistoryDisplay: "Quail Hollow",
    previewEyebrow: "Build your Wells Fargo model",
    previewHeadline: "Shift the weights. See who rises.",
    previewBody: "Preview the board, then open the full model room to customize every ranking.",
    previewRankingTitle: "Quail Hollow ranking preview",
    previewRankingBody: "Tap a weight view to change the board. Lower rank cells grade better.",
    previewRailCtaTitle: "Model Room CTA",
    previewRailCtaBody: "Open the full Quail Hollow model, adjust every weight, and scan the entire field.",
    previewSliderKeys: ["sgApproach", "par4", "drivingAccuracy"],
    previewThemeKeys: ["default", "ballStriking", "accuracy", "shortGame"],
    topProjectionPrimaryStatKey: "sgApproachRank",
    topProjectionPrimaryStatLabel: "Ball striking",
    heroSteps: [
      { title: "Customize the course-fit board", body: "Start with the lens you trust most, then lean into the stat profile that should translate at Quail Hollow." },
      { title: "Preview who climbs", body: "Use the live rail to see which names gain ground before you move into outrights or safer Top 40 structures." },
      { title: "Open the full model room", body: "The full board gives you every preset, every slider, and the entire ranked field." },
      { title: "Layer the written card on top", body: "Once the ranking shape looks right, use the written picks, fades, and strategy notes to finish the week." },
    ],
    heroStats: [
      { value: "83", label: "Players ranked" },
      { value: "4", label: "Preview themes" },
      { value: "3", label: "Slider lanes previewed" },
      { value: "Live", label: "Heat-map table" },
      { value: "/pga/model", label: "Full model room" },
    ],
    valueStrip: [
      { title: "Lean into course fit", body: "Shift the model toward long-iron play, hard par-4 scoring, and steadier tee-to-green control." },
      { title: "Stress-test the board", body: "See which golfers stay near the top when the week gets tougher and volatility matters less." },
      { title: "Reuse the weekly shell", body: "This sample tournament proves the same picks page and model flow can roll forward with new data and copy." },
    ],
    weightShiftNotes: [
      { title: "Ball-striking first", body: "Pushing approach and long-hole scoring makes the board favor players who can survive a more demanding layout." },
      { title: "Accuracy check", body: "Extra driving control matters when you want to avoid the loose-off-the-tee outcomes that break a card." },
      { title: "Short-game cushion", body: "Adding around-the-green and putting weight gives more credit to players who can save rounds when scoring tightens." },
    ],
    courseInsights: [
      { title: "Approach", body: "High-end iron play is still the cleanest separator." },
      { title: "Par 4 Scoring", body: "Demanding par 4s create more separation this week." },
      { title: "Pro Tip", body: "Favor complete tee-to-green profiles over putter-only spikes when building safer positions." },
    ],
    statColumns: [
      { key: "sgApproachRank", abbr: "App", mobileLabel: "Approach", tooltip: "SG: Approach the Green — a primary driver on tougher ball-striking tests." },
      { key: "par4Rank", abbr: "P4", mobileLabel: "Par 4", tooltip: "Par 4 Scoring Average — critical when the course asks for quality on the long middle of the card." },
      { key: "drivingAccuracyRank", abbr: "DA", mobileLabel: "Drive Acc", tooltip: "Driving Accuracy % — more useful when you want control instead of spray-and-pray distance." },
      { key: "bogeyAvoidanceRank", abbr: "BAvd", mobileLabel: "Bogey Av", tooltip: "Bogey Avoidance % — a good floor signal on tougher setups." },
      { key: "sgAroundGreenRank", abbr: "ARG", mobileLabel: "ARG", tooltip: "SG: Around the Green — useful when missing in the wrong spots becomes more expensive." },
      { key: "birdie125150Rank", abbr: "125", mobileLabel: "125-150", tooltip: "Birdie or Better from 125–150 yards — still important on approach-heavy weeks." },
      { key: "sgPuttingRank", abbr: "Putt", mobileLabel: "Putting", tooltip: "SG: Putting — useful as a tiebreaker, but not the main engine of the board." },
      { key: "birdieUnder125Rank", abbr: "<125", mobileLabel: "<125", tooltip: "Birdie or Better from inside 125 yards — useful for converting shorter birdie looks." },
    ],
    previewThemes: [
      {
        key: "default",
        label: "Default Model",
        description: "Balanced Quail Hollow weighting across approach play, scoring pressure, and all-around tee-to-green control.",
        weights: { sgApproach: 23, par4: 16, drivingAccuracy: 10, bogeyAvoidance: 11, sgAroundGreen: 8, trendRank: 12, birdie125150: 5, sgPutting: 5, birdieUnder125: 2, courseTrueSg: 8 },
      },
      {
        key: "ballStriking",
        label: "Ball Striking",
        description: "Turns the board hard toward elite approach quality and difficult-hole scoring.",
        weights: { sgApproach: 29, par4: 18, drivingAccuracy: 13, bogeyAvoidance: 8, sgAroundGreen: 5, trendRank: 10, birdie125150: 6, sgPutting: 3, birdieUnder125: 1, courseTrueSg: 7 },
      },
      {
        key: "accuracy",
        label: "Accuracy",
        description: "Raises fairway control and bogey avoidance when you want a steadier floor profile.",
        weights: { sgApproach: 18, par4: 15, drivingAccuracy: 24, bogeyAvoidance: 17, sgAroundGreen: 7, trendRank: 7, birdie125150: 4, sgPutting: 3, birdieUnder125: 1, courseTrueSg: 4 },
      },
      {
        key: "shortGame",
        label: "Short Game",
        description: "A more conservative look that gives scrambling and putting more space in the mix.",
        weights: { sgApproach: 17, par4: 12, drivingAccuracy: 9, bogeyAvoidance: 12, sgAroundGreen: 20, trendRank: 9, birdie125150: 5, sgPutting: 10, birdieUnder125: 2, courseTrueSg: 4 },
      },
    ],
    presets: [
      {
        key: "balanced",
        label: "Balanced",
        description: "Default Quail Hollow weights across the full board.",
        weights: { sgApproach: 23, par4: 16, drivingAccuracy: 10, bogeyAvoidance: 11, sgAroundGreen: 8, trendRank: 12, birdie125150: 5, sgPutting: 5, birdieUnder125: 2, courseTrueSg: 8 },
      },
      {
        key: "outright",
        label: "Outright",
        description: "More ceiling, less floor. Leans into form and top-end ball striking.",
        weights: { sgApproach: 26, par4: 14, drivingAccuracy: 6, bogeyAvoidance: 5, sgAroundGreen: 5, trendRank: 18, birdie125150: 7, sgPutting: 8, birdieUnder125: 5, courseTrueSg: 6 },
      },
      {
        key: "top10",
        label: "Top 10",
        description: "Strong upside with enough course fit to hold a steadier top-end profile.",
        weights: { sgApproach: 24, par4: 15, drivingAccuracy: 8, bogeyAvoidance: 8, sgAroundGreen: 6, trendRank: 15, birdie125150: 6, sgPutting: 6, birdieUnder125: 3, courseTrueSg: 9 },
      },
      {
        key: "top40",
        label: "Top 40",
        description: "Floor-first build for steadier cut-making and lower-variance bet structures.",
        weights: { sgApproach: 18, par4: 14, drivingAccuracy: 16, bogeyAvoidance: 16, sgAroundGreen: 10, trendRank: 7, birdie125150: 4, sgPutting: 5, birdieUnder125: 1, courseTrueSg: 9 },
      },
    ],
  },
  picksPage: {
    top10Intro: "These Wells Fargo Championship best bets emphasize players with enough upside to contend while still carrying a strong tee-to-green profile for this setup.",
    top40Intro: "These Wells Fargo Championship top 40 picks focus on golfers with repeatable ball-striking, a reliable cut-making profile, and enough course fit to anchor parlays.",
    strategyBullets: [
      "This course asks for high-end ball-striking before anything else.",
      "SG: Approach remains the strongest individual driver in the model.",
      "Par-4 scoring matters more than usual because the difficult middle of the card creates separation.",
      "Tee-to-green consistency is more important than short-term putting spikes.",
      "Top 40 bets favor players with stable cut-making trends over volatile birdie-only profiles.",
    ],
    parlayBullets: [
      "Combine high-floor players in Top 40 markets instead of stacking only high-variance top-10 tickets.",
      "Avoid volatile bomb-or-bust golfers whose missed-cut rate is too high for parlays.",
      "Prioritize course-fit ball-strikers and players with strong bogey-avoidance trends.",
      "Use model rankings and consistency signals instead of public-name value alone.",
    ],
    tierOneBets: [
      { player: "Rory McIlroy", odds: "+150 T10", edge: "Edge 15", analysis: "The cleanest fit for this board. Elite long-iron ceiling, strong scoring upside on hard par 4s, and enough course comfort to justify a top-tier Wells Fargo Championship 2026 pick." },
      { player: "Xander Schauffele", odds: "+155 T10", edge: "Edge 14", analysis: "A premium all-around option whose tee-to-green consistency translates well to a tougher setup. The model likes his balanced profile enough to keep him in the top tier despite shorter odds." },
      { player: "Collin Morikawa", odds: "+170 T10", edge: "Edge 13", analysis: "Any week where elite approach play is the primary driver, Morikawa lands near the top. His ball-striking gives him one of the strongest top-10 floors in the field." },
      { player: "Tommy Fleetwood", odds: "+215 T10", edge: "Edge 12", analysis: "Fleetwood fits the best-bets board because the model values control, approach quality, and par-4 scoring more than pure distance this week." },
    ],
    tierTwoBets: [
      { player: "Corey Conners", odds: "+240", analysis: "One of the stronger value names for golf betting model picks this week thanks to reliable ball-striking and a naturally high-floor profile." },
      { player: "Shane Lowry", odds: "+275", analysis: "Lowry grades well in a tougher scoring environment where bogey avoidance and iron play matter more than volatility-driven upside." },
      { player: "Patrick Cantlay", odds: "+190", analysis: "A strong all-around fit whose consistency keeps him viable in both top-10 and top-20 structures." },
      { player: "Sepp Straka", odds: "+300", analysis: "Approach and fairway control keep him relevant as a model-backed mid-tier value bet." },
    ],
    tierThreeBets: [
      { player: "Keegan Bradley", odds: "+425", analysis: "If you want upside without paying a premium, Bradley offers enough tee-to-green strength to outperform his number." },
      { player: "Russell Henley", odds: "+360", analysis: "A steadier accuracy-first fit who becomes more useful in top-20 and top-40 constructions than outright-only builds." },
    ],
    fades: [
      "Cameron Young -> Price can get too aggressive for a profile that still carries volatility on demanding setups.",
      "Jake Knapp -> The model does not like the bogey-avoidance risk in a tougher scoring environment.",
      "Tom Kim -> Short-game creativity helps, but the overall ceiling trails stronger ball-striking options.",
      "Min Woo Lee -> Public upside is real, but the consistency profile is still weaker than the price implies.",
    ],
    top40Rows: [
      ["Xander Schauffele", "Elite consistency, very low missed-cut risk, and a complete tee-to-green profile make him one of the safest golf bets on the card."],
      ["Collin Morikawa", "Approach-driven profile and reliable ball-striking keep the floor high even when the putter runs neutral."],
      ["Tommy Fleetwood", "Low-volatility ball-striking and a controlled scoring profile fit well for Wells Fargo Championship parlays."],
      ["Corey Conners", "One of the best high-floor ball-strikers in the field and a natural Top 40 anchor."],
      ["Patrick Cantlay", "Balanced skill set, fewer mistakes, and strong cut equity make him a clean parlay leg."],
      ["Russell Henley", "Accuracy and iron play create a safer floor than many of the more explosive names."],
      ["Shane Lowry", "Handles difficult scoring conditions well and brings enough short-game support to protect the floor."],
      ["Sepp Straka", "Reliable iron play and a repeatable fairway-first approach work well in safer markets."],
      ["Matt Fitzpatrick", "A more conservative Top 40 profile than outright play thanks to accuracy and short-game recovery."],
      ["Keegan Bradley", "The tee-to-green profile is strong enough to keep him inside the high-floor pool despite some volatility."],
    ],
    summaryRows: [
      ["McIlroy", "+150", "15", "Ceiling + course-fit ball striking"],
      ["Schauffele", "+155", "14", "Balanced elite metrics"],
      ["Morikawa", "+170", "13", "Approach-driven top-10 floor"],
      ["Fleetwood", "+215", "12", "Low-volatility ball striking"],
      ["Conners", "+240", "11", "High-floor tee-to-green fit"],
      ["Lowry", "+275", "11", "Tough scoring profile"],
      ["Cantlay", "+190", "10", "Reliable all-around build"],
      ["Straka", "+300", "10", "Fairway + approach value"],
    ],
  },
} satisfies PgaTournamentConfigInput;

export const wellsFargoChampionship2026Tournament = definePgaTournamentConfig(
  applyPgaTournamentOverride(baseWellsFargoChampionship2026Tournament, wellsFargoChampionship2026Override),
);
