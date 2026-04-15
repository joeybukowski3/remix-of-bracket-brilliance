import { CURRENT_TOURNAMENT_DESCRIPTION, CURRENT_TOURNAMENT_PATH, CURRENT_TOURNAMENT_TITLE, currentTournamentFaqs } from "@/lib/seo/pgaSeo";

export type PgaTournamentBet = {
  player: string;
  odds: string;
  edge?: string;
  analysis: string;
};

export type PgaTournamentContent = {
  slug: string;
  title: string;
  description: string;
  path: string;
  heroTitle: string;
  heroIntro: string;
  heroSupport: string;
  heroBadge: string;
  heroCtaLabel: string;
  heroSecondaryLabel: string;
  presetsHeading: string;
  presetsIntro: string;
  top10Intro: string;
  top40Intro: string;
  overviewBullets: readonly string[];
  strategyBullets: readonly string[];
  parlayBullets: readonly string[];
  faqs: readonly { question: string; answer: string }[];
  tierOneBets: readonly PgaTournamentBet[];
  tierTwoBets: readonly PgaTournamentBet[];
  tierThreeBets: readonly PgaTournamentBet[];
  fades: readonly string[];
  top40Rows: readonly [string, string][];
  summaryRows: readonly [string, string, string, string][];
};

export const rbcHeritage2026Content: PgaTournamentContent = {
  slug: "rbc-heritage-2026-picks",
  title: CURRENT_TOURNAMENT_TITLE,
  description: CURRENT_TOURNAMENT_DESCRIPTION,
  path: CURRENT_TOURNAMENT_PATH,
  heroTitle: "RBC Heritage 2026 Picks & Best Bets",
  heroBadge: "golf betting model picks",
  heroCtaLabel: "Open Free Model",
  heroSecondaryLabel: "Top 40 golf picks",
  heroIntro:
    "Looking for the best RBC Heritage 2026 picks? This page breaks down top golf bets, top 40 parlay plays, and model-driven insights using course history at Harbour Town, recent form, and key PGA Tour statistics. The goal is to identify high-value players based on how they fit this course - not just market odds.",
  heroSupport:
    "These are the RBC Heritage best bets and Harbour Town course history picks the model likes most, with added context for PGA best bets today, golf betting picks today, and safer RBC Heritage parlays.",
  presetsHeading: "Four Preset Models - Built for Every Bet Type",
  presetsIntro:
    "Most golf betting models are locked behind paywalls. This one is completely free and fully interactive. Choose a preset below to instantly load a weight profile built for that market, then fine-tune any stat to match your own read. The table re-ranks all 83 players in real time.",
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
  tierOneBets: [
    {
      player: "Collin Morikawa",
      odds: "+176 T10",
      edge: "Edge 16",
      analysis:
        "One of the strongest RBC Heritage 2026 picks on the board. Elite Harbour Town course history, the best SG: Approach profile in the field, and an ideal post-Masters momentum bucket create the clearest value gap.",
    },
    {
      player: "Patrick Cantlay",
      odds: "+188 T10",
      edge: "Edge 14",
      analysis:
        "A top-tier RBC Heritage best bet with 30 rounds of Harbour Town experience and the No. 2 Course SG profile in the field. The approach weakness is offset by short-game strength and elite course fit.",
    },
    {
      player: "Jordan Spieth",
      odds: "+230 T10",
      edge: "Edge 12",
      analysis:
        "Harbour Town course history picks rarely get cleaner than Spieth. He owns a win here, 36 rounds of experience, and the scrambling profile that keeps his floor intact on this layout.",
    },
    {
      player: "Sam Burns",
      odds: "+230 T10",
      edge: "Edge 12",
      analysis:
        "Burns grades as one of the better golf betting model picks this week thanks to strong Harbour Town history, DG Rank No. 15, and a stable momentum profile at a still-reasonable price.",
    },
  ],
  tierTwoBets: [
    {
      player: "Daniel Berger",
      odds: "+500",
      analysis:
        "Best long-shot value in the model. Elite Harbour Town history keeps him firmly in the RBC Heritage 2026 picks mix.",
    },
    {
      player: "Xander Schauffele",
      odds: "+126",
      analysis:
        "Expensive, but still one of the steadier PGA golf best bets today because the profile is balanced across every key stat bucket.",
    },
    {
      player: "Tommy Fleetwood",
      odds: "+142",
      analysis:
        "Strong fit for Harbour Town and one of the cleaner top 10 golf bets when you want low volatility with real upside.",
    },
    {
      player: "Si Woo Kim",
      odds: "+196",
      analysis:
        "Elite approach play plus real Harbour Town experience make him one of the better value names for RBC Heritage best bets.",
    },
  ],
  tierThreeBets: [
    {
      player: "Ryo Hisatsune",
      odds: "+500",
      analysis:
        "Limited history, but the stat fit is strong enough to keep him in the conversation for higher-upside golf betting model picks.",
    },
    {
      player: "Matt Fitzpatrick",
      odds: "+138",
      analysis:
        "Elite Harbour Town history and a reliable skill set make him a safer upside play, even if the number is fairly efficient.",
    },
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
};

export const wellsFargoChampionship2026Content: PgaTournamentContent = {
  slug: "wells-fargo-championship-2026-picks",
  title: "Wells Fargo Championship 2026 Picks, Best Bets & Top 40 Parlays | PGA Model",
  description:
    "Wells Fargo Championship 2026 picks, best bets, and top 40 parlay golfers. Data-driven PGA model using course fit, form, and key stats to find betting value.",
  path: "/pga/wells-fargo-championship-2026-picks",
  heroTitle: "Wells Fargo Championship 2026 Picks & Best Bets",
  heroBadge: "PGA best bets today",
  heroCtaLabel: "Open PGA model",
  heroSecondaryLabel: "Top 40 golf picks",
  heroIntro:
    "Looking for the best Wells Fargo Championship 2026 picks? This page breaks down top golf bets, top 40 parlay plays, and model-driven predictions based on course history, recent form, and key PGA Tour statistics.",
  heroSupport:
    "This board leans on long-iron quality, scoring on demanding par 4s, and players whose form profile can hold up on a tougher ball-striking test.",
  presetsHeading: "Four Preset Models - Built for Every Bet Type",
  presetsIntro:
    "The same free PGA model can be used for outrights, top 10s, top 20s, and top 40 parlays. Use the presets to load a betting-specific weighting profile, then fine-tune the model around your own view of the week.",
  top10Intro:
    "These Wells Fargo Championship best bets emphasize players with enough upside to contend while still carrying a strong tee-to-green profile for this setup.",
  top40Intro:
    "These Wells Fargo Championship top 40 picks focus on golfers with repeatable ball-striking, a reliable cut-making profile, and enough course fit to anchor parlays.",
  overviewBullets: [
    "Recent Form via DG Rank and TrendRank.",
    "Course-fit weighting around elite ball-striking, long-iron play, and bogey avoidance.",
    "Key stat fit driven by SG: Approach, par-4 scoring, driving accuracy, and short-game recovery.",
    "Each stat bucket is normalized across the field before being weighted into the final board.",
    "The model favors players who can survive difficult tee-to-green tests without leaking mistakes.",
    "Recent finish profile and consistency still matter, but course fit takes a larger role on tougher setups.",
    "The final composite score is used to compare likely performance against market pricing.",
  ],
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
  tierOneBets: [
    {
      player: "Rory McIlroy",
      odds: "+150 T10",
      edge: "Edge 15",
      analysis:
        "The cleanest fit for this board. Elite long-iron ceiling, strong scoring upside on hard par 4s, and enough course comfort to justify a top-tier Wells Fargo Championship 2026 pick.",
    },
    {
      player: "Xander Schauffele",
      odds: "+155 T10",
      edge: "Edge 14",
      analysis:
        "A premium all-around option whose tee-to-green consistency translates well to a tougher setup. The model likes his balanced profile enough to keep him in the top tier despite shorter odds.",
    },
    {
      player: "Collin Morikawa",
      odds: "+170 T10",
      edge: "Edge 13",
      analysis:
        "Any week where elite approach play is the primary driver, Morikawa lands near the top. His ball-striking gives him one of the strongest top-10 floors in the field.",
    },
    {
      player: "Tommy Fleetwood",
      odds: "+215 T10",
      edge: "Edge 12",
      analysis:
        "Fleetwood fits the best-bets board because the model values control, approach quality, and par-4 scoring more than pure distance this week.",
    },
  ],
  tierTwoBets: [
    {
      player: "Corey Conners",
      odds: "+240",
      analysis:
        "One of the stronger value names for golf betting model picks this week thanks to reliable ball-striking and a naturally high-floor profile.",
    },
    {
      player: "Shane Lowry",
      odds: "+275",
      analysis:
        "Lowry grades well in a tougher scoring environment where bogey avoidance and iron play matter more than volatility-driven upside.",
    },
    {
      player: "Patrick Cantlay",
      odds: "+190",
      analysis:
        "A strong all-around fit whose consistency keeps him viable in both top-10 and top-20 structures.",
    },
    {
      player: "Sepp Straka",
      odds: "+300",
      analysis:
        "Approach and fairway control keep him relevant as a model-backed mid-tier value bet.",
    },
  ],
  tierThreeBets: [
    {
      player: "Keegan Bradley",
      odds: "+425",
      analysis:
        "If you want upside without paying a premium, Bradley offers enough tee-to-green strength to outperform his number.",
    },
    {
      player: "Russell Henley",
      odds: "+360",
      analysis:
        "A steadier accuracy-first fit who becomes more useful in top-20 and top-40 constructions than outright-only builds.",
    },
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
    ["Sungjae Im", "Balanced consistency and enough fairway control to stay relevant in conservative bet structures."],
    ["Si Woo Kim", "Model likes the cut-making profile more than the market on tougher setups."],
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
};
