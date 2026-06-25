/**
 * nflWarrenSharpTeams2026.ts
 *
 * Source: Warren Sharp 2026 Football Preview
 * Extracted from: PDF chapter pages 75–619, positional rankings from page 50.
 *
 * IMPORTANT: This data is sourced entirely from the Warren Sharp 2026 Football Preview.
 * Do NOT mix with Joe Knows Ball model data, VSiN data, or Vegas odds.
 * All positional rankings use #1 = STRONGEST unit (opposite of schedule strength #1 = hardest).
 *
 * Coaching tenure: "priorYears" = seasons completed with this team before 2026.
 * priorYears: 0 = new for 2026.
 */

export interface WsCoachingStaff {
  headCoach: string;
  headCoachPriorYears: number; // 0 = new for 2026
  headCoachNew: boolean;
  offensiveCoordinator: string;
  offensiveCoordinatorPriorYears: number;
  offensiveCoordinatorNew: boolean;
  defensiveCoordinator: string;
  defensiveCoordinatorPriorYears: number;
  defensiveCoordinatorNew: boolean;
  sourcePage: number;
}

export interface WsPersonnelMove {
  player: string;
  position: string;
  newTeam?: string; // for departures
  previousTeam?: string; // for additions
  contractNote?: string; // AAV when listed
}

export interface WsDraftAddition {
  round: number;
  pick: number;
  player: string;
  position: string;
  college: string;
}

export interface WsPositionalRatings {
  /** #1 = strongest unit in the NFL */
  quarterbacks: number;
  offensiveLine: number;
  receivers: number;
  runningBacks: number;
  front7: number;
  secondary: number;
  headCoach: number;
  sourcePage: number;
}

export interface WsTeamOutlook {
  /** Sharp's key strengths for 2026 — derived from chapter narrative */
  strengths: string[];
  /** Sharp's key concerns for 2026 — derived from chapter narrative */
  concerns: string[];
  /** JKB original takeaway synthesizing Sharp data with existing model */
  jkbTakeaway: string;
}

export interface WarrenSharpTeamProfile2026 {
  team: string;
  abbr: string; // matches site abbreviation
  chapterStartPage: number;
  positionalRatingsPage: number;
  coaching: WsCoachingStaff;
  keyAdditions: WsPersonnelMove[];
  keyDepartures: WsPersonnelMove[];
  draftAdditions: WsDraftAddition[];
  positionalRatings: WsPositionalRatings;
  outlook: WsTeamOutlook;
}

const TEAMS: WarrenSharpTeamProfile2026[] = [
  // ─── Arizona Cardinals ───────────────────────────────────────────────────
  {
    team: "Arizona Cardinals", abbr: "ari",
    chapterStartPage: 75, positionalRatingsPage: 79,
    coaching: {
      headCoach: "Mike LaFleur", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Nathaniel Hackett", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Nick Rallis", defensiveCoordinatorPriorYears: 3, defensiveCoordinatorNew: false,
      sourcePage: 75,
    },
    keyAdditions: [
      { player: "Isaac Seumalo", position: "LG", contractNote: "$10.5M" },
      { player: "Tyler Allgeier", position: "RB", previousTeam: "atl" },
      { player: "Gardner Minshew", position: "QB", contractNote: "$5.79M" },
      { player: "Kendrick Bourne", position: "WR", contractNote: "$5M" },
      { player: "Elijah Wilkinson", position: "LG", previousTeam: "atl" },
      { player: "Andrew Wingard", position: "S", contractNote: "$3M" },
      { player: "Andrew Billings", position: "IDL", contractNote: "$3M" },
      { player: "Devin Duvernay", position: "WR", contractNote: "$1.89M" },
    ],
    keyDepartures: [
      { player: "Jonah Williams", position: "RT" },
      { player: "Jalen Thompson", position: "S", newTeam: "dal" },
      { player: "Justin Jones", position: "IDL" },
      { player: "Dalvin Tomlinson", position: "IDL", newTeam: "lac" },
      { player: "Calais Campbell", position: "EDGE", newTeam: "rav" },
      { player: "Kelvin Beachum", position: "LT" },
      { player: "Akeem Davis-Gaither", position: "LB", newTeam: "cle" },
    ],
    draftAdditions: [
      { round: 1, pick: 3, player: "Jeremiyah Love", position: "RB", college: "Notre Dame" },
      { round: 2, pick: 34, player: "G - Chase Bisontis", position: "G", college: "Texas A&M" },
      { round: 3, pick: 65, player: "QB - Carson Beck", position: "QB", college: "Miami (FL)" },
      { round: 4, pick: 104, player: "DT - Kaleb Proctor", position: "DT", college: "Louisiana" },
      { round: 5, pick: 143, player: "WR - Reggie Virgil", position: "WR", college: "Texas Tech" },
      { round: 6, pick: 183, player: "LB - Karson Sharar", position: "LB", college: "Iowa" },
      { round: 7, pick: 217, player: "T - Jayden Williams", position: "T", college: "Ole Miss" },
    ],
    positionalRatings: {
      quarterbacks: 32, offensiveLine: 26, receivers: 12, runningBacks: 9,
      front7: 29, secondary: 28, headCoach: 31, sourcePage: 50,
    },
    outlook: {
      strengths: [
        "Running backs rank #9 — Jeremiyah Love (pick 3) joins Trey McBride as an immediate weapon.",
        "Receivers rank #12 — Marvin Harrison Jr. and Trey McBride provide an above-average skill-position foundation.",
        "Defensive coordinator Nick Rallis returning for a fourth year provides scheme continuity despite coaching upheaval above.",
      ],
      concerns: [
        "Quarterback room ranks dead last (#32) — QB1 Gardner Minshew is a placeholder and first-round pick Carson Beck is a clear developmental project.",
        "Front 7 ranks #29 — interior pass rush was a chronic weakness and the additions do not address it meaningfully.",
        "Entirely new offensive brain trust (LaFleur + Hackett) with no established language or system creates Year 1 execution risk on offense.",
      ],
      jkbTakeaway: "Sharp ranks the Cardinals #31 at QB and #29 up front — aligning with the JKB model's low power rating. The Jeremiyah Love pick gives this offense a physical identity but the QB situation makes it hard to trust the Over on a 4.5-win total. A legitimate rebuild with very few 2026 payoffs visible.",
    },
  },

  // ─── Atlanta Falcons ─────────────────────────────────────────────────────
  {
    team: "Atlanta Falcons", abbr: "atl",
    chapterStartPage: 92, positionalRatingsPage: 96,
    coaching: {
      headCoach: "Kevin Stefanski", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Tommy Rees", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Jeff Ulbrich", defensiveCoordinatorPriorYears: 1, defensiveCoordinatorNew: false,
      sourcePage: 92,
    },
    keyAdditions: [
      { player: "Jahan Dotson", position: "WR", contractNote: "$7.5M" },
      { player: "Tua Tagovailoa", position: "QB", contractNote: "$1.2M" },
      { player: "Austin Hooper", position: "TE", contractNote: "$3.29M" },
      { player: "Cameron Thomas", position: "EDGE", contractNote: "$3.10M" },
      { player: "Brian Robinson Jr.", position: "RB", contractNote: "$2.5M" },
      { player: "Olamide Zaccheaus", position: "WR", contractNote: "$2.29M" },
      { player: "Jawaan Taylor", position: "RT", contractNote: "$5M" },
      { player: "Da'Shawn Hand", position: "EDGE", contractNote: "$3M" },
      { player: "Azeez Ojulari", position: "EDGE", contractNote: "$1.39M" },
    ],
    keyDepartures: [
      { player: "Kaden Elliss", position: "LB", newTeam: "no" },
      { player: "David Onyemata", position: "IDL" },
      { player: "Leonard Floyd", position: "EDGE" },
      { player: "Tyler Allgeier", position: "RB", newTeam: "ari" },
      { player: "Dee Alford", position: "CB" },
      { player: "Darnell Mooney", position: "WR", newTeam: "nyg" },
    ],
    draftAdditions: [
      { round: 2, pick: 48, player: "Avieon Terrell", position: "CB", college: "Clemson" },
      { round: 3, pick: 79, player: "Zachariah Branch", position: "WR", college: "Georgia" },
      { round: 4, pick: 134, player: "Kendal Daniels", position: "LB", college: "Oklahoma" },
      { round: 6, pick: 208, player: "Anterio Thompson", position: "DT", college: "Washington" },
      { round: 6, pick: 215, player: "Harold Perkins Jr.", position: "LB", college: "LSU" },
      { round: 7, pick: 231, player: "Ethan Onianwa", position: "T", college: "Ohio State" },
    ],
    positionalRatings: {
      quarterbacks: 28, offensiveLine: 10, receivers: 15, runningBacks: 1,
      front7: 31, secondary: 22, headCoach: 20, sourcePage: 96,
    },
    outlook: {
      strengths: [
        "Running backs rank #1 in the NFL — Bijan Robinson is a generational talent and Brian Robinson Jr. is a capable complement.",
        "Offensive line ranks #10 — unit was healthy in 2025 with four starters playing over 1,000 snaps; Jawaan Taylor added at RT.",
        "Receivers rank #15 — Drake London and Kyle Pitts form a credible duo; Jahan Dotson adds a third option.",
      ],
      concerns: [
        "Quarterback room ranks #28 — Tua Tagovailoa carries ACL uncertainty and Michael Penix Jr. is unproven as a full-time starter; Sharp is genuinely perplexed about this situation.",
        "Front 7 ranks #31 — pass rush lost Leonard Floyd and Kaden Elliss with no proven replacements signed; James Pearce's development is the key variable.",
        "Entirely new offensive coaching staff (Stefanski + Rees) creates Year 1 scheme adjustment risk despite roster talent.",
      ],
      jkbTakeaway: "Sharp's #1 running back ranking + #10 offensive line is a genuine structural strength that supports Atlanta's win total. However, the #28 QB ranking aligns with JKB model concerns about regression. The Falcons are a team where roster talent and coaching efficiency are in tension — a healthy, confident Tua unlocks the Over; a shaky QB situation keeps them under 7.5.",
    },
  },

  // ─── Baltimore Ravens ────────────────────────────────────────────────────
  {
    team: "Baltimore Ravens", abbr: "bal",
    chapterStartPage: 108, positionalRatingsPage: 112,
    coaching: {
      headCoach: "Jesse Minter", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Declan Doyle", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Anthony Weaver", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 108,
    },
    keyAdditions: [
      { player: "Trey Hendrickson", position: "EDGE", contractNote: "$28M" },
      { player: "John Simpson", position: "LG", contractNote: "$10M" },
      { player: "Calais Campbell", position: "EDGE", contractNote: "$5.5M" },
      { player: "Durham Smythe", position: "TE", contractNote: "$3M" },
      { player: "Danny Pinter", position: "C", contractNote: "$2.79M" },
    ],
    keyDepartures: [
      { player: "Tyler Linderbaum", position: "C", newTeam: "lv" },
      { player: "Isaiah Likely", position: "TE", newTeam: "nyg" },
      { player: "Dre'Mont Jones", position: "IDL", newTeam: "ne" },
      { player: "Charlie Kolar", position: "TE", newTeam: "lac" },
      { player: "Alohi Gilman", position: "S", newTeam: "kc" },
      { player: "DeAndre Hopkins", position: "WR" },
      { player: "Keaton Mitchell", position: "RB", newTeam: "lac" },
    ],
    draftAdditions: [
      { round: 1, pick: 14, player: "Vega Ioane", position: "G", college: "Penn State" },
      { round: 2, pick: 45, player: "Zion Young", position: "OLB", college: "Missouri" },
      { round: 3, pick: 80, player: "Ja'Kobi Lane", position: "WR", college: "USC" },
      { round: 4, pick: 115, player: "Elijah Sarratt", position: "WR", college: "Indiana" },
      { round: 5, pick: 173, player: "Josh Cuevas", position: "TE", college: "Alabama" },
      { round: 5, pick: 174, player: "Adam Randall", position: "RB", college: "Clemson" },
      { round: 7, pick: 250, player: "Rayshaun Benny", position: "DT", college: "Michigan" },
    ],
    positionalRatings: {
      quarterbacks: 2, offensiveLine: 24, receivers: 25, runningBacks: 10,
      front7: 10, secondary: 8, headCoach: 27, sourcePage: 112,
    },
    outlook: {
      strengths: [
        "Quarterback ranks #2 — Lamar Jackson remains an elite dual threat and the offense is built around maximizing his unique skillset.",
        "Secondary ranks #8 — unit was among the best in football and returns largely intact with experience at all levels.",
        "Adding Trey Hendrickson ($28M AAV) upgrades the pass rush after losing Myles Garrett-level production from the edge.",
      ],
      concerns: [
        "Completely new coaching staff (Minter + Doyle + Weaver) after Harbaugh's departure — execution continuity is the primary 2026 question.",
        "Offensive line ranks #24 — losing Tyler Linderbaum at center is significant; John Simpson is a lateral move at best.",
        "Receivers rank #25 — the passing game lacks a clear WR1 after DeAndre Hopkins' departure and Rashod Bateman's inconsistency.",
      ],
      jkbTakeaway: "The Ravens have the most complete roster of any team undergoing a major coaching transition. Jackson's #2 QB ranking and the #8 secondary are elite anchors. JKB model favors Baltimore at 11.5 projected wins — Sharp's data supports that ceiling if Minter can maintain offensive tempo and the pass rush lives up to its Hendrickson investment.",
    },
  },

  // ─── Buffalo Bills ───────────────────────────────────────────────────────
  {
    team: "Buffalo Bills", abbr: "buf",
    chapterStartPage: 125, positionalRatingsPage: 129,
    coaching: {
      headCoach: "Joe Brady", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Pete Carmichael Jr.", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Jim Leonhard", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 125,
    },
    keyAdditions: [
      { player: "D.J. Moore", position: "WR", previousTeam: "chi" },
      { player: "Dee Alford", position: "CB", contractNote: "$5.29M" },
      { player: "Chauncey Gardner-Johnson Jr.", position: "S", contractNote: "$3.5M" },
    ],
    keyDepartures: [
      { player: "David Edwards", position: "LG", newTeam: "no" },
      { player: "Joey Bosa", position: "EDGE" },
      { player: "Taron Johnson", position: "CB", newTeam: "lv" },
      { player: "Darius Slay", position: "CB" },
      { player: "Matt Milano", position: "LB" },
      { player: "A.J. Epenesa", position: "EDGE", newTeam: "nyg" },
      { player: "Ryan Van Demark", position: "RT", newTeam: "min" },
    ],
    draftAdditions: [
      { round: 2, pick: 35, player: "T.J. Parker", position: "DE", college: "Clemson" },
      { round: 2, pick: 82, player: "Davison Igbinosun", position: "CB", college: "Ohio State" },
      { round: 4, pick: 125, player: "Skyler Bell", position: "WR", college: "UConn" },
      { round: 4, pick: 126, player: "Kaleb Elarms-Orr", position: "LB", college: "TCU" },
      { round: 5, pick: 167, player: "Zane Durant", position: "DT", college: "Penn State" },
      { round: 5, pick: 181, player: "Torian Pride Jr.", position: "CB", college: "South Carolina" },
      { round: 7, pick: 239, player: "Tommy Donan", position: "P", college: "Florida" },
    ],
    positionalRatings: {
      quarterbacks: 1, offensiveLine: 3, receivers: 20, runningBacks: 3,
      front7: 23, secondary: 13, headCoach: 28, sourcePage: 129,
    },
    outlook: {
      strengths: [
        "Quarterback ranks #1 — Josh Allen is the consensus best player in football and the offense is built around his transcendent ability.",
        "Offensive line ranks #3 — one of the most reliable units in the NFL and a key reason Allen stays upright.",
        "Running backs rank #3 — James Cook is explosive; D.J. Moore addition bolsters the receiver corps (ranked #20 with room to rise).",
      ],
      concerns: [
        "Receivers rank #20 — the WR corps lacks a true alpha; Sharp noted this as a persistent weakness even before the 2025 season.",
        "Completely new coaching staff (Brady + Carmichael + Leonhard) — institutional knowledge and Allen's chemistry with coordinators must be rebuilt.",
        "Front 7 ranks #23 — interior depth a concern after Bosa and Milano departures; secondary (13) held up last year but faces similar transition questions.",
      ],
      jkbTakeaway: "The Bills have the #1 QB in football and a top-3 offensive line — two of the most stable structural advantages in the NFL. Sharp's data supports the JKB model's aggressive win projection. The key risk is the wholesale coaching change affecting Allen's rhythm early. If Brady establishes quickly, Buffalo is the AFC's most complete team.",
    },
  },

  // ─── Carolina Panthers ───────────────────────────────────────────────────
  {
    team: "Carolina Panthers", abbr: "car",
    chapterStartPage: 143, positionalRatingsPage: 147,
    coaching: {
      headCoach: "Dave Canales", headCoachPriorYears: 2, headCoachNew: false,
      offensiveCoordinator: "Brad Idzik", offensiveCoordinatorPriorYears: 2, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Ejiro Evero", defensiveCoordinatorPriorYears: 3, defensiveCoordinatorNew: false,
      sourcePage: 143,
    },
    keyAdditions: [
      { player: "Jaelan Phillips", position: "EDGE", contractNote: "$30M" },
      { player: "Devin Lloyd", position: "LB", contractNote: "$15M" },
      { player: "Kenny Pickett", position: "QB", contractNote: "$4M" },
      { player: "Rasheed Walker", position: "LT", contractNote: "$4M" },
      { player: "Luke Fortner", position: "C", contractNote: "$2.79M" },
      { player: "John Metchie III", position: "WR", contractNote: "$1.89M" },
    ],
    keyDepartures: [
      { player: "A'Shawn Robinson", position: "IDL", newTeam: "tb" },
      { player: "Cade Mays", position: "C", newTeam: "det" },
      { player: "Rico Dowdle", position: "RB", newTeam: "pit" },
      { player: "Andy Dalton", position: "QB", newTeam: "phi" },
      { player: "D.J. Wonnum", position: "EDGE", newTeam: "det" },
      { player: "Brady Christensen", position: "LG" },
    ],
    draftAdditions: [
      { round: 1, pick: 19, player: "Monroe Freeling", position: "T", college: "Georgia" },
      { round: 2, pick: 49, player: "Lee Hunter", position: "DT", college: "Texas Tech" },
      { round: 3, pick: 83, player: "Chris Brazzell II", position: "WR", college: "Army" },
      { round: 4, pick: 129, player: "Will Lee III", position: "CB", college: "Texas A&M" },
      { round: 4, pick: 144, player: "Sam Hecht", position: "C", college: "Penn State" },
      { round: 4, pick: 151, player: "Zakee Wheatley", position: "S", college: "Penn State" },
      { round: 7, pick: 227, player: "Jackson Kuwatch", position: "LB", college: "Miami (OH)" },
    ],
    positionalRatings: {
      quarterbacks: 26, offensiveLine: 12, receivers: 28, runningBacks: 29,
      front7: 19, secondary: 17, headCoach: 18, sourcePage: 147,
    },
    outlook: {
      strengths: [
        "Coaching staff enters Year 3 together (Canales + Idzik + Evero) — rare organizational continuity in a league of constant change.",
        "Offensive line ranks #12 — the OL improved under Canales and Monroe Freeling (Rd 1) adds another young piece.",
        "Jaelan Phillips signing ($30M AAV) is the most significant defensive addition and addresses the team's chronic pass-rush deficit.",
      ],
      concerns: [
        "Receivers rank #28 and running backs rank #29 — both skill groups rank among the weakest in the NFL heading into 2026.",
        "Quarterback room ranks #26 — Bryce Young's development remains the central question; Kenny Pickett is a backup-level bridge option.",
        "Sharp identifies this as a team where the market pricing (7.5 wins) may be getting ahead of the roster talent relative to the NFC South competition.",
      ],
      jkbTakeaway: "Carolina's stability advantage (Year 3 staff) is real and meaningful in the Sharp framework, but the skill-position rankings (#28 WR, #29 RB) expose significant limitations. JKB model's moderate projection aligns with Sharp's skepticism. The Panthers are a team that needs Bryce Young to make a Year 3 leap to justify an Over bet.",
    },
  },

  // ─── Chicago Bears ───────────────────────────────────────────────────────
  {
    team: "Chicago Bears", abbr: "chi",
    chapterStartPage: 160, positionalRatingsPage: 164,
    coaching: {
      headCoach: "Ben Johnson", headCoachPriorYears: 1, headCoachNew: false,
      offensiveCoordinator: "Press Taylor", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Dennis Allen", defensiveCoordinatorPriorYears: 1, defensiveCoordinatorNew: false,
      sourcePage: 160,
    },
    keyAdditions: [
      { player: "Coby Bryant", position: "S", contractNote: "$13.3M" },
      { player: "Devin Bush", position: "LB", contractNote: "$10M" },
      { player: "Garrett Bradbury", position: "C", previousTeam: "det" },
      { player: "Kalif Raymond", position: "WR", contractNote: "$3.5M" },
      { player: "Cameron Lewis", position: "CB", contractNote: "$3M" },
    ],
    keyDepartures: [
      { player: "D.J. Moore", position: "WR", newTeam: "buf" },
      { player: "Tremaine Edmunds", position: "LB", newTeam: "nyg" },
      { player: "Kevin Byard", position: "S", newTeam: "ne" },
      { player: "Darius Slay", position: "CB" },
      { player: "Chauncey Gardner-Johnson", position: "S", newTeam: "buf" },
      { player: "Durham Smythe", position: "TE", newTeam: "bal" },
      { player: "Olamide Zaccheaus", position: "WR", newTeam: "atl" },
      { player: "Devin Duvernay", position: "WR", newTeam: "ari" },
    ],
    draftAdditions: [
      { round: 1, pick: 25, player: "Dillon Thieneman", position: "S", college: "Oregon" },
      { round: 2, pick: 57, player: "Logan Jones", position: "C", college: "Iowa" },
      { round: 3, pick: 89, player: "Sam Roush", position: "TE", college: "Stanford" },
      { round: 3, pick: 89, player: "Zavion Thomas", position: "WR", college: "LSU" },
      { round: 4, pick: 124, player: "Malik Muhammad", position: "CB", college: "Texas" },
      { round: 5, pick: 166, player: "Keyshawn Elliott", position: "LB", college: "Arizona State" },
      { round: 6, pick: 213, player: "Jordan van den Berg", position: "DT", college: "Georgia Tech" },
    ],
    positionalRatings: {
      quarterbacks: 11, offensiveLine: 6, receivers: 9, runningBacks: 18,
      front7: 30, secondary: 17, headCoach: 7, sourcePage: 164,
    },
    outlook: {
      strengths: [
        "Head coach ranks #7 — Sharp has significant respect for Ben Johnson's offensive ingenuity after watching him elevate Detroit's offense for multiple years.",
        "Offensive line ranks #6 and receivers rank #9 — two of the strongest non-QB offensive unit ratings in the NFC North.",
        "Caleb Williams enters Year 2 with QB rank of #11 — meaningful improvement expected with a full offseason in Johnson's system.",
      ],
      concerns: [
        "Front 7 ranks #30 — the pass rush ranked at the bottom of the league and the offseason additions do not meaningfully address this weakness.",
        "Sharp views the 2025 season's statistical luck factors (fumble luck, field goal luck, turnover margin) as unsustainable; regression risk is real.",
        "D.J. Moore's departure to Buffalo removes the team's only proven top WR1; Kalif Raymond is a significant downgrade.",
      ],
      jkbTakeaway: "Sharp's #30 front seven is the loudest alarm bell in Chicago's profile. The Bears can move the ball but cannot stop elite offenses — and the NFC North features three such teams. JKB model projects moderate wins; Sharp's data suggests the Over at 9.5 requires the defense to take a major leap that the personnel and scheme don't yet support.",
    },
  },

  // ─── Cincinnati Bengals ──────────────────────────────────────────────────
  {
    team: "Cincinnati Bengals", abbr: "cin",
    chapterStartPage: 179, positionalRatingsPage: 183,
    coaching: {
      headCoach: "Zac Taylor", headCoachPriorYears: 7, headCoachNew: false,
      offensiveCoordinator: "Dan Pitcher", offensiveCoordinatorPriorYears: 2, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Al Golden", defensiveCoordinatorPriorYears: 1, defensiveCoordinatorNew: false,
      sourcePage: 179,
    },
    keyAdditions: [
      { player: "Dexter Lawrence", position: "IDL", previousTeam: "nyg" },
      { player: "Boye Mafe", position: "EDGE", contractNote: "$20M" },
      { player: "Bryan Cook", position: "S", contractNote: "$13.4M" },
    ],
    keyDepartures: [
      { player: "Trey Hendrickson", position: "EDGE", newTeam: "bal" },
      { player: "Joseph Ossai", position: "EDGE", newTeam: "nyj" },
      { player: "Noah Fant", position: "TE", newTeam: "no" },
      { player: "Cordell Volson", position: "LG", newTeam: "ten" },
      { player: "Tycen Anderson", position: "S", newTeam: "den" },
      { player: "Lucas Patrick", position: "LG", newTeam: "nyg" },
      { player: "Geno Stone", position: "S", newTeam: "buf" },
    ],
    draftAdditions: [
      { round: 2, pick: 41, player: "Cashius Howell", position: "DE", college: "Texas A&M" },
      { round: 3, pick: 72, player: "Tacario Davis", position: "CB", college: "Washington" },
      { round: 4, pick: 128, player: "Connor Lew", position: "C", college: "Auburn" },
      { round: 4, pick: 140, player: "Colbie Young", position: "WR", college: "Georgia" },
      { round: 6, pick: 189, player: "Brian Parker II", position: "C", college: "Duke" },
      { round: 7, pick: 221, player: "Jack Endries", position: "TE", college: "Texas" },
      { round: 7, pick: 226, player: "Landon Robinson", position: "DT", college: "Navy" },
    ],
    positionalRatings: {
      quarterbacks: 3, offensiveLine: 28, receivers: 4, runningBacks: 17,
      front7: 26, secondary: 23, headCoach: 24, sourcePage: 183,
    },
    outlook: {
      strengths: [
        "Quarterback ranks #3 — Joe Burrow in a fully healthy season is a top-three talent; the 2025 defense collapse masked his quality.",
        "Receivers rank #4 — Ja'Marr Chase and Tee Higgins form one of the best WR duos in the NFL; the target is elite.",
        "Dexter Lawrence acquisition ($34.5M trade) addresses the most critical defensive need (interior pass rush) with a proven difference-maker.",
      ],
      concerns: [
        "Offensive line ranks #28 — persistent weakness and the reason Burrow has faced historic sack rates when healthy; the additions may not move this ranking.",
        "Front 7 ranks #26 — Hendrickson's departure to Baltimore is a significant loss even with Boye Mafe added.",
        "Zac Taylor (7 prior years) enters a critical prove-it window after a 6-11 campaign; offensive execution questions linger.",
      ],
      jkbTakeaway: "The Bengals are the NFL's most volatile bet: elite skill positions (#3 QB, #4 WR) paired with a chronically broken offensive line (#28). Sharp's data confirms what JKB model identifies — Cincinnati's ceiling is Super Bowl contention and their floor is a bottom-10 offense if Burrow gets hurt again. The Dexter Lawrence signing was the right move.",
    },
  },

  // ─── Cleveland Browns ────────────────────────────────────────────────────
  {
    team: "Cleveland Browns", abbr: "cle",
    chapterStartPage: 195, positionalRatingsPage: 199,
    coaching: {
      headCoach: "Todd Monken", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Travis Switzer", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Mike Rutenberg", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 195,
    },
    keyAdditions: [
      { player: "Tytus Howard", position: "RT", previousTeam: "hou" },
      { player: "Zion Johnson", position: "LG", contractNote: "$16.5M" },
      { player: "Elgton Jenkins", position: "LG", contractNote: "$12M" },
      { player: "Quincy Williams", position: "LB", contractNote: "$6.5M" },
      { player: "Jared Verse", position: "EDGE", contractNote: "$5.5M" },
      { player: "Kalia Davis", position: "IDL", contractNote: "$2M" },
      { player: "Daniel Thomas", position: "S", contractNote: "$1.5M" },
    ],
    keyDepartures: [
      { player: "Myles Garrett", position: "EDGE", newTeam: "lar" },
      { player: "Joel Bitonio", position: "LG" },
      { player: "Cam Robinson", position: "LT" },
      { player: "Devin Bush", position: "LB", newTeam: "chi" },
      { player: "Jack Conklin", position: "RT" },
      { player: "Ethan Pocic", position: "C" },
      { player: "Cameron Thomas", position: "EDGE", newTeam: "atl" },
    ],
    draftAdditions: [
      { round: 1, pick: 9, player: "Spencer Fano", position: "T", college: "Utah" },
      { round: 1, pick: 24, player: "KC Concepcion", position: "WR", college: "Texas A&M" },
      { round: 2, pick: 39, player: "Denzel Boston", position: "WR", college: "Washington" },
      { round: 2, pick: 58, player: "Emmanuel McNeill-Warren", position: "S", college: "Toledo" },
      { round: 3, pick: 86, player: "Austin Barber", position: "T", college: "Florida" },
      { round: 5, pick: 149, player: "Parker Brailsford", position: "C", college: "Alabama" },
      { round: 5, pick: 170, player: "Joe Royer", position: "TE", college: "Cincinnati" },
      { round: 6, pick: 182, player: "Taylen Green", position: "QB", college: "Arkansas" },
    ],
    positionalRatings: {
      quarterbacks: 31, offensiveLine: 32, receivers: 30, runningBacks: 26,
      front7: 6, secondary: 10, headCoach: 29, sourcePage: 199,
    },
    outlook: {
      strengths: [
        "Front 7 ranks #6 — despite Myles Garrett's departure, the Browns' defensive front remains one of the better units in football; Jared Verse arrives to help.",
        "Secondary ranks #10 — Cleveland returns its entire starting secondary and added Emmanuel McNeill-Warren in the second round.",
        "Entirely new coaching staff (Monken + Switzer + Rutenberg) represents a genuine philosophical reset after years of offensive futility.",
      ],
      concerns: [
        "Quarterback ranks #31, offensive line #32, receivers #30 — Sharp identifies Cleveland as having the sixth-worst overall roster, almost entirely due to offensive incompetence.",
        "Deshaun Watson's contract situation ($40M dead cap) significantly constrains roster-building options for the offensive rebuild.",
        "Sharp writes that the offense 'ranked dead last in every first-down metric' in 2025 — new coaching cannot immediately fix personnel-level deficiencies.",
      ],
      jkbTakeaway: "The JKB model and Sharp are aligned: Cleveland is an elite defense dragged down by a historically broken offense. The #6 front seven and #10 secondary are assets that would contend if paired with average QB play. Monken's offensive identity at Georgia was QB-centric — Deshaun Watson and Dillon Gabriel are deeply problematic solutions. Under 6.5 wins remains the sensible position.",
    },
  },

  // ─── Dallas Cowboys ──────────────────────────────────────────────────────
  {
    team: "Dallas Cowboys", abbr: "dal",
    chapterStartPage: 212, positionalRatingsPage: 216,
    coaching: {
      headCoach: "Brian Schottenheimer", headCoachPriorYears: 1, headCoachNew: false,
      offensiveCoordinator: "Klayton Adams", offensiveCoordinatorPriorYears: 1, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Christian Parker", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 212,
    },
    keyAdditions: [
      { player: "Rashan Gary", position: "EDGE", previousTeam: "gb" },
      { player: "Jalen Thompson", position: "S", previousTeam: "ari", contractNote: "$11M" },
      { player: "Cobie Durant", position: "CB", contractNote: "$4M" },
      { player: "P.J. Locke", position: "S", contractNote: "$4M" },
      { player: "Otto Ogbonnia", position: "IDL", contractNote: "$2.79M" },
      { player: "Sam Howell", position: "QB", contractNote: "$2.5M" },
    ],
    keyDepartures: [
      { player: "Osa Odighizuwa", position: "IDL", newTeam: "sf" },
      { player: "Logan Wilson", position: "LB" },
      { player: "Kenneth Murray", position: "LB" },
      { player: "Donovan Wilson", position: "S" },
      { player: "Dante Fowler Jr.", position: "EDGE" },
      { player: "Jadeveon Clowney", position: "EDGE" },
      { player: "Solomon Thomas", position: "IDL", newTeam: "ten" },
    ],
    draftAdditions: [
      { round: 1, pick: 11, player: "Caleb Downs", position: "S", college: "Ohio State" },
      { round: 1, pick: 23, player: "Malachi Lawrence", position: "DE", college: "UCF" },
      { round: 3, pick: 92, player: "Jaishawn Barham", position: "OLB", college: "Michigan" },
      { round: 3, pick: 112, player: "Drew Shelton", position: "T", college: "Penn State" },
      { round: 4, pick: 114, player: "Devin Moore", position: "CB", college: "Florida" },
      { round: 4, pick: 137, player: "LT Overton", position: "DT", college: "Alabama" },
      { round: 7, pick: 218, player: "Anthony Smith", position: "WR", college: "East Carolina" },
    ],
    positionalRatings: {
      quarterbacks: 8, offensiveLine: 18, receivers: 1, runningBacks: 23,
      front7: 17, secondary: 21, headCoach: 23, sourcePage: 216,
    },
    outlook: {
      strengths: [
        "Receivers rank #1 in the NFL — CeeDee Lamb remains the most complete wide receiver in football; the target corps is elite.",
        "Quarterback ranks #8 — Dak Prescott's return from injury gives the offense a capable if not transcendent starter.",
        "Caleb Downs (pick 11 overall) is an immediate-impact safety and addresses the secondary's need for a playmaker.",
      ],
      concerns: [
        "Sharp writes that Dallas played the #2 easiest schedule in 2025 but 'trailed in 16 of 17 games' — the offense was inefficient despite great personnel.",
        "Rashan Gary acquisition (trade) is high-profile but based on a player who has struggled with durability in recent seasons.",
        "Schottenheimer (Year 2) and Adams (Year 2) face increased expectations after a 7-10 record in their debut season together.",
      ],
      jkbTakeaway: "The #1 receiver ranking with Lamb is unambiguous, and the 2026 schedule should be tougher than last year's. JKB model projects regression to the mean — Dallas's talent warrants 9-10 wins if execution improves. Sharp's concern about inefficiency despite easy schedule suggests the offense underperformed its personnel, which is a correctable problem. CeeDee Lamb makes the Over defensible.",
    },
  },

  // ─── Denver Broncos ──────────────────────────────────────────────────────
  {
    team: "Denver Broncos", abbr: "den",
    chapterStartPage: 229, positionalRatingsPage: 233,
    coaching: {
      headCoach: "Sean Payton", headCoachPriorYears: 3, headCoachNew: false,
      offensiveCoordinator: "Davis Webb", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Vance Joseph", defensiveCoordinatorPriorYears: 3, defensiveCoordinatorNew: false,
      sourcePage: 229,
    },
    keyAdditions: [
      { player: "Jaylen Waddle", position: "WR", previousTeam: "mia" },
      { player: "Tycen Anderson", position: "S", contractNote: "$1.5M" },
    ],
    keyDepartures: [
      { player: "John Franklin-Myers", position: "EDGE", newTeam: "ten" },
      { player: "P.J. Locke", position: "S", newTeam: "dal" },
      { player: "Michael Burton", position: "FB", newTeam: "cle" },
      { player: "Geron Christian", position: "LT" },
      { player: "Marcedes Lewis", position: "TE" },
      { player: "Sam Mustipher", position: "C" },
      { player: "Delarrin Turner-Yell", position: "S" },
    ],
    draftAdditions: [
      { round: 3, pick: 66, player: "Tyler Oyedemi", position: "DT", college: "Texas" },
      { round: 4, pick: 108, player: "Jonah Coleman", position: "RB", college: "Washington" },
      { round: 4, pick: 111, player: "Kage Casey", position: "T", college: "Boise State" },
      { round: 5, pick: 152, player: "Justin Joly", position: "TE", college: "NC State" },
      { round: 5, pick: 246, player: "Miles Scott", position: "S", college: "Illinois" },
      { round: 7, pick: 256, player: "Dalien Bentley", position: "TE", college: "Utah" },
      { round: 7, pick: 257, player: "Red Murdock", position: "LB", college: "Buffalo" },
    ],
    positionalRatings: {
      quarterbacks: 17, offensiveLine: 1, receivers: 10, runningBacks: 21,
      front7: 4, secondary: 2, headCoach: 5, sourcePage: 233,
    },
    outlook: {
      strengths: [
        "Offensive line ranks #1 and secondary ranks #2 — two historically elite unit rankings; Denver's structural foundation is the best non-QB combination in the AFC West.",
        "Front 7 ranks #4 — the pass rush remained strong despite roster turnover and represents a genuine defensive weapon.",
        "Jaylen Waddle addition (trade) upgrades what was a middling receiver corps to a legitimate top-10 group (#10 ranking).",
      ],
      concerns: [
        "Quarterback ranks #17 — Bo Nix enters Year 2 with significant questions about sustainable efficiency; Sharp is skeptical of high pass-attempt volume from a below-average QB.",
        "Sharp notes Nix led the NFL in pass attempts in 2025 with 612 — a worrying signal, as teams with high-volume, below-average QBs rarely maintain win totals.",
        "Davis Webb (new OC) must reduce Nix's turnover-prone tendencies from Year 1.",
      ],
      jkbTakeaway: "The #1 offensive line and #2 secondary are genuinely elite anchors. Denver won 14 games last year in large part because of these structural advantages. JKB model and Sharp agree on the win regression question — the schedule gets harder, and Nix must prove he can be efficient, not just busy. The Under at 9.5 has merit despite the elite supporting cast.",
    },
  },

  // ─── Detroit Lions ───────────────────────────────────────────────────────
  {
    team: "Detroit Lions", abbr: "det",
    chapterStartPage: 246, positionalRatingsPage: 250,
    coaching: {
      headCoach: "Dan Campbell", headCoachPriorYears: 5, headCoachNew: false,
      offensiveCoordinator: "Drew Petzing", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Kelvin Sheppard", defensiveCoordinatorPriorYears: 1, defensiveCoordinatorNew: false,
      sourcePage: 246,
    },
    keyAdditions: [
      { player: "Cade Mays", position: "C", previousTeam: "car", contractNote: "$8.30M" },
      { player: "Larry Borom", position: "RT", contractNote: "$5M" },
      { player: "D.J. Wonnum", position: "EDGE", previousTeam: "car", contractNote: "$3M" },
      { player: "Christian Izien", position: "S", contractNote: "$2M" },
      { player: "Isiah Pacheco", position: "RB", previousTeam: "kc", contractNote: "$1.8M" },
      { player: "Teddy Bridgewater", position: "QB", contractNote: "$1.8M" },
      { player: "Juice Scruggs", position: "C", previousTeam: "hou" },
    ],
    keyDepartures: [
      { player: "Taylor Decker", position: "LT" },
      { player: "Alex Anzalone", position: "LB", newTeam: "tb" },
      { player: "David Montgomery", position: "RB", newTeam: "hou" },
      { player: "Amik Robertson", position: "CB", newTeam: "wsh" },
      { player: "Graham Glasgow", position: "RG" },
      { player: "D.J. Reader", position: "IDL" },
      { player: "Al-Quadin Muhammad", position: "EDGE", newTeam: "tb" },
    ],
    draftAdditions: [
      { round: 1, pick: 17, player: "Blake Miller", position: "T", college: "Clemson" },
      { round: 2, pick: 44, player: "Derrick Moore", position: "DE", college: "Michigan" },
      { round: 4, pick: 118, player: "Jimmy Relder", position: "LB", college: "Michigan" },
      { round: 4, pick: 157, player: "Keith Abney II", position: "CB", college: "Arizona State" },
      { round: 5, pick: 168, player: "Kendrick Law", position: "WR", college: "Kentucky" },
      { round: 6, pick: 205, player: "Skyler Gil-Howard", position: "DT", college: "Georgia Tech" },
      { round: 7, pick: 222, player: "Tyre West", position: "DE", college: "Tennessee" },
    ],
    positionalRatings: {
      quarterbacks: 13, offensiveLine: 14, receivers: 2, runningBacks: 2,
      front7: 9, secondary: 14, headCoach: 5, sourcePage: 250,
    },
    outlook: {
      strengths: [
        "Receivers rank #2 and running backs rank #2 — Detroit's skill positions are arguably the deepest in the NFC; Amon-Ra St. Brown, Sam LaPorta, and a renovated backfield are elite.",
        "Head coach ranks #5 — Dan Campbell's culture-building is widely respected and the Lions have a clear identity.",
        "Front 7 ranks #9 — the defensive line remains a strength and D.J. Wonnum adds depth.",
      ],
      concerns: [
        "Quarterback ranks #13 — Jared Goff is serviceable but questions about his ceiling in a playoff-pressure environment remain.",
        "New offensive coordinator (Petzing) must transition smoothly from Ben Johnson's system without breaking what already worked.",
        "Taylor Decker's departure is the biggest offensive line concern; Blake Miller (Rd 1) must contribute immediately for the OL to maintain its ranking.",
      ],
      jkbTakeaway: "Sharp's #2 rankings at WR and RB alongside a #5 head coach make Detroit genuinely dangerous. The JKB model projects strong win totals and the Lions have the skill-position depth to handle adversity. The NFC North is loaded (GB, MIN, CHI all dangerous) which creates real schedule difficulty. Sharp sees Detroit at 10.5 wins — that's a high bar for a team whose QB ranks only 13th.",
    },
  },

  // ─── Green Bay Packers ───────────────────────────────────────────────────
  {
    team: "Green Bay Packers", abbr: "gb",
    chapterStartPage: 262, positionalRatingsPage: 266,
    coaching: {
      headCoach: "Matt LaFleur", headCoachPriorYears: 7, headCoachNew: false,
      offensiveCoordinator: "Adam Stenavich", offensiveCoordinatorPriorYears: 4, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Jonathan Gannon", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 262,
    },
    keyAdditions: [
      { player: "Javon Hargrave", position: "IDL", contractNote: "$11.5M" },
      { player: "Zaire Franklin", position: "LB", previousTeam: "ind" },
      { player: "Benjamin St-Juste", position: "CB", contractNote: "$5M" },
      { player: "Skyy Moore", position: "WR", contractNote: "$2.5M" },
      { player: "Tyrod Taylor", position: "QB", contractNote: "$2.5M" },
    ],
    keyDepartures: [
      { player: "Malik Willis", position: "QB", newTeam: "mia" },
      { player: "Trevon Diggs", position: "CB" },
      { player: "Romeo Doubs", position: "WR", newTeam: "ne" },
      { player: "Rashan Gary", position: "EDGE", newTeam: "dal" },
      { player: "Quay Walker", position: "LB", newTeam: "lv" },
      { player: "Elgton Jenkins", position: "LG", newTeam: "cle" },
      { player: "Dontayvion Wicks", position: "WR", newTeam: "phi" },
      { player: "Desmond Ojabo", position: "EDGE" },
    ],
    draftAdditions: [
      { round: 2, pick: 52, player: "Brandon Cisse", position: "CB", college: "South Carolina" },
      { round: 3, pick: 77, player: "Chris McClellan", position: "DT", college: "Missouri" },
      { round: 4, pick: 120, player: "Dani Dennis-Sutton", position: "DE", college: "Penn State" },
      { round: 5, pick: 153, player: "Jager Burton", position: "C", college: "Kentucky" },
      { round: 5, pick: 201, player: "Domani Jackson", position: "CB", college: "Alabama" },
      { round: 6, pick: 216, player: "Trey Smack", position: "K", college: "Florida" },
    ],
    positionalRatings: {
      quarterbacks: 10, offensiveLine: 27, receivers: 14, runningBacks: 16,
      front7: 13, secondary: 11, headCoach: 11, sourcePage: 266,
    },
    outlook: {
      strengths: [
        "Head coach ranks #11 — Matt LaFleur's 7-year tenure and Stenavich's 4-year OC continuity represent the NFC's most stable offensive coaching environment.",
        "Jordan Love enters his third year as starter with a QB rank of #10 — Sharp expects continued development in a proven system.",
        "Secondary ranks #11 — Jaire Alexander and the cornerback group remain a legitimate defensive strength.",
      ],
      concerns: [
        "Offensive line ranks #27 — Elgton Jenkins' departure to Cleveland is a significant blow; the interior is now thin.",
        "Sharp narrates the playoff loss to the Bears (led 21-3 at halftime, still lost) as a concerning coaching and execution failure under pressure.",
        "Jonathan Gannon (new DC) brings uncertainty; the defense must adapt to a new scheme after Rashan Gary's departure weakens the pass rush.",
      ],
      jkbTakeaway: "Green Bay has elite coaching stability at the top (LaFleur Year 8, Stenavich Year 5) but a structural offensive line problem that Sharp ranks 27th. Love is improving but the system is being asked to overcome real personnel holes. JKB model sees a bounce-back candidate — Sharp's data suggests 10.5 wins is achievable if Love takes another step forward.",
    },
  },

  // ─── Houston Texans ──────────────────────────────────────────────────────
  {
    team: "Houston Texans", abbr: "hou",
    chapterStartPage: 278, positionalRatingsPage: 282,
    coaching: {
      headCoach: "DeMeco Ryans", headCoachPriorYears: 3, headCoachNew: false,
      offensiveCoordinator: "Nick Caley", offensiveCoordinatorPriorYears: 1, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Matt Burke", defensiveCoordinatorPriorYears: 3, defensiveCoordinatorNew: false,
      sourcePage: 278,
    },
    keyAdditions: [
      { player: "Braden Smith", position: "RT", previousTeam: "ind", contractNote: "$10M" },
      { player: "David Montgomery", position: "RB", previousTeam: "det" },
      { player: "Reed Blankenship", position: "S", contractNote: "$8.30M" },
      { player: "Logan Hall", position: "IDL", contractNote: "$6.90M" },
      { player: "Foster Moreau", position: "TE", previousTeam: "no", contractNote: "$3.10M" },
      { player: "Dominique Robinson", position: "EDGE", contractNote: "$3M" },
      { player: "Evan Brown", position: "RG", contractNote: "$2.5M" },
      { player: "Jake Hummel", position: "LB", contractNote: "$2.39M" },
    ],
    keyDepartures: [
      { player: "Tytus Howard", position: "RT", newTeam: "cle" },
      { player: "Joe Mixon", position: "RB" },
      { player: "Tim Settle", position: "IDL", newTeam: "wsh" },
      { player: "Jimmie Ward", position: "S" },
      { player: "Derek Barnett", position: "EDGE" },
      { player: "Christian Kirk", position: "WR", newTeam: "sf" },
      { player: "Folorunso Fatukasi", position: "IDL", newTeam: "wsh" },
    ],
    draftAdditions: [
      { round: 1, pick: 26, player: "Keylan Rutledge", position: "G", college: "Georgia Tech" },
      { round: 2, pick: 36, player: "Kayden McDonald", position: "DT", college: "Ohio State" },
      { round: 2, pick: 59, player: "Marin Klein", position: "TE", college: "Michigan" },
      { round: 4, pick: 106, player: "Febechi Nwaiwu", position: "G", college: "Clemson" },
      { round: 5, pick: 123, player: "Kamari Ramsey", position: "S", college: "USC" },
      { round: 6, pick: 204, player: "Lewis Bond", position: "WR", college: "Boston College" },
      { round: 7, pick: 243, player: "Aiden Fisher", position: "LB", college: "Indiana" },
    ],
    positionalRatings: {
      quarterbacks: 19, offensiveLine: 31, receivers: 11, runningBacks: 27,
      front7: 1, secondary: 1, headCoach: 10, sourcePage: 282,
    },
    outlook: {
      strengths: [
        "Front 7 ranks #1 and secondary ranks #1 — Houston's defense is the highest-rated in the NFL; Will Anderson Jr. and the pass rush are exceptional.",
        "Receivers rank #11 — Nico Collins and Stefon Diggs provide a legitimate WR1/WR2 combination if both stay healthy.",
        "DeMeco Ryans (Year 4) + Matt Burke (Year 4) defensive continuity is among the NFL's most established coordinator partnerships.",
      ],
      concerns: [
        "Offensive line ranks #31 — losing Tytus Howard (to Cleveland) hurts, and Braden Smith (acquired from IND) must fill a major gap; the unit ranked near the bottom in pass protection.",
        "Quarterback ranks #19 — C.J. Stroud is talented but Sharp's analysis identifies consistency issues; the offense is limited by supporting cast.",
        "Running backs rank #27 — David Montgomery arrives from Detroit but Sharp is skeptical of the backfield's ability to create chunk plays.",
      ],
      jkbTakeaway: "The Texans have the NFL's best defense by Sharp's metrics (#1 front 7, #1 secondary) paired with a bottom-3 offensive line (#31). JKB model sees regression from 12 wins last year — the offense must improve from its 2025 mediocrity to sustain a winning level. If Stroud takes a step forward with Braden Smith stabilizing the right side, 10 wins is achievable.",
    },
  },

  // ─── Indianapolis Colts ──────────────────────────────────────────────────
  {
    team: "Indianapolis Colts", abbr: "ind",
    chapterStartPage: 295, positionalRatingsPage: 299,
    coaching: {
      headCoach: "Shane Steichen", headCoachPriorYears: 3, headCoachNew: false,
      offensiveCoordinator: "Jim Bob Cooter", offensiveCoordinatorPriorYears: 3, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Lou Anarumo", defensiveCoordinatorPriorYears: 1, defensiveCoordinatorNew: false,
      sourcePage: 295,
    },
    keyAdditions: [
      { player: "Arden Key", position: "EDGE", contractNote: "$8M" },
      { player: "Micheal Clemons", position: "EDGE", contractNote: "$5.70M" },
      { player: "Akeem Davis-Gaither", position: "LB", previousTeam: "atl", contractNote: "$2.70M" },
    ],
    keyDepartures: [
      { player: "Michael Pittman Jr.", position: "WR", newTeam: "pit" },
      { player: "Kwity Paye", position: "EDGE", newTeam: "lv" },
      { player: "Braden Smith", position: "RT", newTeam: "hou" },
      { player: "Kenny Moore", position: "CB" },
      { player: "Zaire Franklin", position: "LB", newTeam: "gb" },
      { player: "Germaine Pratt", position: "LB", newTeam: "rav" },
      { player: "Danny Pinter", position: "C", newTeam: "bal" },
    ],
    draftAdditions: [
      { round: 2, pick: 53, player: "CJ Allen", position: "LB", college: "Georgia" },
      { round: 3, pick: 78, player: "A.J. Haulcy", position: "S", college: "LSU" },
      { round: 4, pick: 113, player: "Jalen Farmer", position: "G", college: "Kentucky" },
      { round: 4, pick: 135, player: "Bryce Boettcher", position: "LB", college: "Oregon" },
      { round: 5, pick: 156, player: "George Gumbs Jr.", position: "DE", college: "Florida" },
      { round: 6, pick: 214, player: "Caden Curry", position: "DE", college: "Ohio State" },
      { round: 6, pick: 237, player: "Seth McGowan", position: "RB", college: "Kentucky" },
      { round: 7, pick: 254, player: "Deion Burks", position: "WR", college: "Oklahoma" },
    ],
    positionalRatings: {
      quarterbacks: 23, offensiveLine: 11, receivers: 23, runningBacks: 4,
      front7: 25, secondary: 8, headCoach: 16, sourcePage: 299,
    },
    outlook: {
      strengths: [
        "Running backs rank #4 — Jonathan Taylor at full health is one of the best backs in football; the Colts backfield is a genuine offensive strength.",
        "Secondary ranks #8 — Sauce Gardner (trade) brings a top-10 corner to a unit that was already performing well; the ceiling is significant.",
        "Coaching staff enters Year 4 together (Steichen + Cooter + Anarumo) — the most established trio in the AFC South.",
      ],
      concerns: [
        "Quarterback ranks #23 — Daniel Jones missed time with an Achilles injury in 2025; his health status for 2026 is the primary uncertainty; backup options are thin.",
        "Front 7 ranks #25 — the Colts added Arden Key and Micheal Clemons but lost Kwity Paye and Braden Smith; pass-rush depth is a concern.",
        "Receivers rank #23 — losing Michael Pittman Jr. to Pittsburgh creates a void that Alec Pierce must attempt to fill as the clear WR1.",
      ],
      jkbTakeaway: "Indy's #4 running back ranking (Taylor) and #8 secondary (Gardner) represent two of the strongest positional assets in the AFC South. The JKB model projects regression from last year's overperformance. Sharp's analysis confirms: this team is better than 8-9 on roster talent but dependent on Jones's Achilles recovery. A healthy Jones + Taylor could justify the Over.",
    },
  },

  // ─── Jacksonville Jaguars ────────────────────────────────────────────────
  {
    team: "Jacksonville Jaguars", abbr: "jax",
    chapterStartPage: 313, positionalRatingsPage: 317,
    coaching: {
      headCoach: "Liam Coen", headCoachPriorYears: 1, headCoachNew: false,
      offensiveCoordinator: "Grant Udinski", offensiveCoordinatorPriorYears: 1, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Anthony Campanile", defensiveCoordinatorPriorYears: 1, defensiveCoordinatorNew: false,
      sourcePage: 313,
    },
    keyAdditions: [
      { player: "Chris Rodriguez Jr.", position: "RB", contractNote: "$5M" },
      { player: "Ruke Orhorhoro", position: "IDL", previousTeam: "atl" },
    ],
    keyDepartures: [
      { player: "Devin Lloyd", position: "LB", newTeam: "car" },
      { player: "Travis Etienne", position: "RB", newTeam: "no" },
      { player: "Greg Newsome II", position: "CB", newTeam: "nyg" },
      { player: "Emmanuel Ogbah", position: "EDGE" },
      { player: "Andrew Wingard", position: "S", newTeam: "ari" },
      { player: "Tim Patrick", position: "WR" },
      { player: "Maason Smith", position: "IDL", newTeam: "atl" },
    ],
    draftAdditions: [
      { round: 2, pick: 56, player: "Nate Boerkircher", position: "TE", college: "Texas A&M" },
      { round: 2, pick: 81, player: "Albert Regis", position: "DT", college: "Texas A&M" },
      { round: 3, pick: 88, player: "Emmanuel Pregnon", position: "G", college: "Oregon" },
      { round: 3, pick: 100, player: "Jalen Huskey", position: "S", college: "Maryland" },
      { round: 4, pick: 119, player: "Wesley Williams", position: "DE", college: "Duke" },
      { round: 5, pick: 164, player: "Tanner Koziol", position: "TE", college: "Houston" },
      { round: 5, pick: 191, player: "Josh Cameron", position: "WR", college: "Baylor" },
    ],
    positionalRatings: {
      quarterbacks: 15, offensiveLine: 17, receivers: 17, runningBacks: 29,
      front7: 15, secondary: 12, headCoach: 13, sourcePage: 317,
    },
    outlook: {
      strengths: [
        "Coen's system demonstrated in 2025 that Trevor Lawrence can be managed effectively when the scheme prioritizes his strengths; Sharp entered the offseason believing in Coen.",
        "Secondary ranks #12 — the cornerback group improved meaningfully in 2025 and Campanile (Year 2) maintains defensive continuity.",
        "The entire coaching staff returns for Year 2 — rare organizational stability after years of Jaguars dysfunction.",
      ],
      concerns: [
        "Running backs rank #29 — Travis Etienne's departure to New Orleans creates an enormous void; Chris Rodriguez Jr. is an unproven replacement.",
        "Lawrence's health coming off a season with durability concerns remains the central 2026 question for this franchise.",
        "Sharp wrote pre-2025 that he 'bet directly on his belief as loudly as I could' in Jacksonville but now acknowledges the Etienne loss fundamentally changes the offensive identity.",
      ],
      jkbTakeaway: "Jacksonville's 2025 success was largely built around Etienne's role as a pass-catching back — a strength that now departs to New Orleans. The JKB model projects a win-total correction. Sharp's #29 running back ranking confirms the concern. At 9.5 wins, the Under is defensible unless Lawrence performs at a level that compensates for a one-dimensional ground game.",
    },
  },

  // ─── Kansas City Chiefs ──────────────────────────────────────────────────
  {
    team: "Kansas City Chiefs", abbr: "kc",
    chapterStartPage: 331, positionalRatingsPage: 335,
    coaching: {
      headCoach: "Andy Reid", headCoachPriorYears: 13, headCoachNew: false,
      offensiveCoordinator: "Eric Bieniemy", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Steve Spagnuolo", defensiveCoordinatorPriorYears: 7, defensiveCoordinatorNew: false,
      sourcePage: 331,
    },
    keyAdditions: [
      { player: "Kenneth Walker III", position: "RB", previousTeam: "sea", contractNote: "$14.3M" },
      { player: "Justin Fields", position: "QB", previousTeam: "jax" },
      { player: "Alohi Gilman", position: "S", previousTeam: "bal", contractNote: "$8M" },
      { player: "Kader Kohou", position: "CB", contractNote: "$1.8M" },
      { player: "Kaiir Elam", position: "CB", contractNote: "$1.8M" },
    ],
    keyDepartures: [
      { player: "Trent McDuffie", position: "CB", newTeam: "lar" },
      { player: "Jaylen Watson", position: "CB", newTeam: "lar" },
      { player: "Bryan Cook", position: "S", newTeam: "cin" },
      { player: "Leo Chenal", position: "LB", newTeam: "lac" },
      { player: "Chris Okoye", position: "DL" },
      { player: "Joshua Williams", position: "CB", newTeam: "ten" },
      { player: "Deon Bush", position: "S" },
      { player: "Nazeeh Johnson", position: "S" },
    ],
    draftAdditions: [
      { round: 1, pick: 6, player: "Mansoor Delane", position: "CB", college: "LSU" },
      { round: 1, pick: 29, player: "R Mason Thomas", position: "DE", college: "Clemson" },
      { round: 2, pick: 40, player: "R Mason Thomas", position: "DE", college: "Clemson" },
      { round: 4, pick: 109, player: "Jadon Canady", position: "CB", college: "Oregon" },
      { round: 4, pick: 161, player: "Emmett Johnson", position: "RB", college: "Nebraska" },
      { round: 5, pick: 176, player: "Cyrus Allen", position: "WR", college: "Cincinnati" },
      { round: 7, pick: 249, player: "Garrett Nussmeier", position: "QB", college: "LSU" },
    ],
    positionalRatings: {
      quarterbacks: 4, offensiveLine: 23, receivers: 20, runningBacks: 12,
      front7: 12, secondary: 25, headCoach: 2, sourcePage: 335,
    },
    outlook: {
      strengths: [
        "Head coach ranks #2 — Andy Reid's 13 consecutive years of playoff success represents unmatched organizational stability; Sharp explicitly respects this.",
        "Quarterback ranks #4 — Patrick Mahomes even in a down year (by his standards) remains an elite game-manager; Sharp notes the passing game was historically worse than perceived.",
        "Kenneth Walker III (from Seattle) upgrades the running back group from a position of need and provides a pass-catching option.",
      ],
      concerns: [
        "Sharp writes at length that Kansas City was 'MUCH worse than most people imagine' in 2025 — the point differential was just +34 across 17 games.",
        "Secondary ranks #25 after losing Trent McDuffie, Bryan Cook, and other starters; the cornerback group was rebuilt from scratch with unproven talent.",
        "Receivers rank #20 — the WR corps was subpar last year and the changes do not materially improve the group.",
      ],
      jkbTakeaway: "Sharp's deep data reveals the Chiefs were a far more fragile team in 2025 than their record showed. JKB model and Sharp both see meaningful regression risk. The #2 head coach ranking buys Reid significant benefit of the doubt, but the secondary collapse (#25) and offensive line mediocrity (#23) are structural issues. The Over at 10.5 requires both Mahomes and the rebuilt secondary to outperform their current rankings.",
    },
  },

  // ─── Las Vegas Raiders ───────────────────────────────────────────────────
  {
    team: "Las Vegas Raiders", abbr: "lv",
    chapterStartPage: 347, positionalRatingsPage: 351,
    coaching: {
      headCoach: "Klint Kubiak", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Andrew Janocko", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Rob Leonard", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 347,
    },
    keyAdditions: [
      { player: "Tyler Linderbaum", position: "C", previousTeam: "bal", contractNote: "$27M" },
      { player: "Kwity Paye", position: "EDGE", previousTeam: "ind", contractNote: "$18M" },
      { player: "Quay Walker", position: "LB", previousTeam: "gb", contractNote: "$13.5M" },
      { player: "Nakobe Dean", position: "LB", previousTeam: "phi", contractNote: "$12M" },
      { player: "Taron Johnson", position: "CB", previousTeam: "buf" },
      { player: "Spencer Burford", position: "RG", contractNote: "$3.29M" },
      { player: "Connor Heyward", position: "TE", contractNote: "$2.29M" },
    ],
    keyDepartures: [
      { player: "Dylan Parham", position: "LG", newTeam: "nyj" },
      { player: "Tyree Wilson", position: "EDGE", newTeam: "no" },
      { player: "Alex Cappa", position: "RG" },
      { player: "Daniel Carlson", position: "K" },
      { player: "Kenny Pickett", position: "QB", newTeam: "car" },
      { player: "Geno Smith", position: "QB", newTeam: "nyj" },
      { player: "Elandon Roberts", position: "LB" },
    ],
    draftAdditions: [
      { round: 1, pick: 1, player: "Fernando Mendoza", position: "QB", college: "Indiana" },
      { round: 2, pick: 38, player: "S-Treydan Stukes", position: "S", college: "Arizona" },
      { round: 3, pick: 67, player: "Keyron Crawford", position: "UE", college: "Auburn" },
      { round: 3, pick: 91, player: "Trey Zuhn III", position: "C", college: "Texas A&M" },
      { round: 4, pick: 101, player: "Jermod McCoy", position: "CB", college: "Tennessee" },
      { round: 4, pick: 122, player: "Mike Washington Jr.", position: "RB", college: "Arkansas" },
      { round: 5, pick: 150, player: "Dalton Johnson", position: "S", college: "Arizona" },
    ],
    positionalRatings: {
      quarterbacks: 25, offensiveLine: 25, receivers: 29, runningBacks: 14,
      front7: 27, secondary: 30, headCoach: 26, sourcePage: 351,
    },
    outlook: {
      strengths: [
        "Tyler Linderbaum (from Baltimore, $27M AAV) is a legitimate upgrade at center and the most impactful addition of the offseason.",
        "Running backs rank #14 — Zamir White has shown flashes and the backfield is one of the team's few clear strengths.",
        "The NFL's #1 overall pick (Fernando Mendoza) provides a legitimate long-term solution at the most important position.",
      ],
      concerns: [
        "Quarterback ranks #25 and secondary ranks #30 — two of the worst unit rankings in the NFL; Mendoza is a rookie project, not a Day 1 solution.",
        "Entirely new coaching staff (Kubiak + Janocko + Leonard) with zero prior NFL head-coaching experience at the top.",
        "Receivers rank #29 — Sharp identifies Las Vegas as having one of the weakest pass-catching groups in the AFC West.",
      ],
      jkbTakeaway: "The Raiders are in a multi-year rebuild that will be judged by Mendoza's development, not 2026 results. Sharp's rankings confirm what the JKB model projects — a bottom-10 team in 2026. Under 5.5 wins makes strong structural sense: historically bad quarterback room, new coaching staff, and weak supporting cast at receiver (#29) and secondary (#30).",
    },
  },

  // ─── Los Angeles Chargers ────────────────────────────────────────────────
  {
    team: "Los Angeles Chargers", abbr: "lac",
    chapterStartPage: 363, positionalRatingsPage: 367,
    coaching: {
      headCoach: "Jim Harbaugh", headCoachPriorYears: 2, headCoachNew: false,
      offensiveCoordinator: "Mike McDaniel", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Chris O'Leary", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 363,
    },
    keyAdditions: [
      { player: "Tyler Biadasz", position: "C", contractNote: "$10M" },
      { player: "Charlie Kolar", position: "TE", previousTeam: "bal", contractNote: "$8.09M" },
      { player: "Cole Strange", position: "LG", contractNote: "$6.5M" },
      { player: "Dalvin Tomlinson", position: "IDL", previousTeam: "ari", contractNote: "$6.20M" },
      { player: "Keaton Mitchell", position: "RB", previousTeam: "bal", contractNote: "$4.59M" },
      { player: "Alec Ingold", position: "FB", contractNote: "$3.79M" },
      { player: "Kayode Awosika", position: "RT", contractNote: "$2M" },
    ],
    keyDepartures: [
      { player: "Odafe Oweh", position: "EDGE", newTeam: "wsh" },
      { player: "Zion Johnson", position: "LG", newTeam: "cle" },
      { player: "Mekhi Becton", position: "RT" },
      { player: "Najee Harris", position: "RB" },
      { player: "Will Dissly", position: "TE" },
      { player: "Keenan Allen", position: "WR" },
      { player: "Da'Shawn Hand", position: "EDGE", newTeam: "atl" },
      { player: "Otto Ogbonnia", position: "IDL", newTeam: "dal" },
    ],
    draftAdditions: [
      { round: 1, pick: 22, player: "Akheem Mesidor", position: "LB", college: "Miami (FL)" },
      { round: 2, pick: 63, player: "Jake Slaughter", position: "C", college: "Florida" },
      { round: 2, pick: 105, player: "Brenen Thompson", position: "WR", college: "Mississippi State" },
      { round: 4, pick: 117, player: "Travis Burke", position: "T", college: "Memphis" },
      { round: 4, pick: 131, player: "Genesis Smith", position: "S", college: "Arizona" },
      { round: 5, pick: 145, player: "Nick Barrett", position: "DT", college: "South Carolina" },
      { round: 5, pick: 202, player: "Logan Taylor", position: "G", college: "Boston College" },
    ],
    positionalRatings: {
      quarterbacks: 7, offensiveLine: 8, receivers: 19, runningBacks: 13,
      front7: 21, secondary: 14, headCoach: 12, sourcePage: 367,
    },
    outlook: {
      strengths: [
        "Quarterback ranks #7 — Justin Herbert is a legitimate franchise QB who Sharp describes as historically undervalued; the Chargers are built around him.",
        "Offensive line ranks #8 — Tyler Biadasz adds a quality center; the line was one of the team's quiet strengths in 2025.",
        "Jim Harbaugh (Year 3) brings the most successful coaching track record of any returning NFL head coach; the system is now established.",
      ],
      concerns: [
        "New offensive coordinator (Mike McDaniel) and defensive coordinator (Chris O'Leary) — back-to-back coordinator upheaval could disrupt Herbert's rhythm.",
        "Receivers rank #19 — the WR corps is pedestrian without a proven WR1; Brenen Thompson (Rd 2) must develop quickly.",
        "Front 7 ranks #21 — the edge rush was inconsistent and losing Odafe Oweh to Washington creates a depth issue.",
      ],
      jkbTakeaway: "The Chargers have a top-10 QB and top-10 offensive line — a foundation for sustainable success. However, back-to-back coordinator changes (Kellen Moore in 2025, now McDaniel in 2026) create scheme-chemistry risk. JKB model projects strong efficiency if Herbert stays healthy. Sharp's data supports 10-11 wins with a healthy Herbert and competent coordinator transition.",
    },
  },

  // ─── Los Angeles Rams ────────────────────────────────────────────────────
  {
    team: "Los Angeles Rams", abbr: "lar",
    chapterStartPage: 380, positionalRatingsPage: 384,
    coaching: {
      headCoach: "Sean McVay", headCoachPriorYears: 9, headCoachNew: false,
      offensiveCoordinator: "Nate Scheelhaase", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Chris Shula", defensiveCoordinatorPriorYears: 2, defensiveCoordinatorNew: false,
      sourcePage: 380,
    },
    keyAdditions: [
      { player: "Myles Garrett", position: "EDGE", previousTeam: "cle" },
      { player: "Trent McDuffie", position: "CB", previousTeam: "kc" },
      { player: "Jaylen Watson", position: "CB", previousTeam: "kc", contractNote: "$17M" },
      { player: "Grant Stuard", position: "LB", contractNote: "$2.20M" },
      { player: "Joe Cardona", position: "LS", contractNote: "$1.70M" },
    ],
    keyDepartures: [
      { player: "Rob Havenstein", position: "RT" },
      { player: "Cobie Durant", position: "CB", newTeam: "dal" },
      { player: "Jared Verse", position: "EDGE", newTeam: "cle" },
      { player: "Jimmy Garoppolo", position: "QB" },
      { player: "D.J. Humphries", position: "LT" },
      { player: "Ankello Witherspoon", position: "CB", newTeam: "wsh" },
      { player: "Roger McCreary", position: "CB", newTeam: "det" },
    ],
    draftAdditions: [
      { round: 1, pick: 13, player: "Ty Simpson", position: "QB", college: "Alabama" },
      { round: 2, pick: 61, player: "Max Klare", position: "TE", college: "Ohio State" },
      { round: 3, pick: 93, player: "Keagen Trost", position: "T", college: "Missouri" },
      { round: 6, pick: 197, player: "CJ Daniels", position: "WR", college: "Miami (FL)" },
      { round: 7, pick: 232, player: "Tim Keenan III", position: "DT", college: "Alabama" },
    ],
    positionalRatings: {
      quarterbacks: 5, offensiveLine: 5, receivers: 4, runningBacks: 6,
      front7: 3, secondary: 4, headCoach: 1, sourcePage: 384,
    },
    outlook: {
      strengths: [
        "Head coach ranks #1 — Sharp rates McVay as the most impactful coaching asset in the NFL entering 2026; 9 consecutive years of results validate this.",
        "Five of seven positions rank in the top-5: OL (#5), WR (#4), RB (#6), Front 7 (#3), Secondary (#4) — the most complete roster profile in the NFC.",
        "Myles Garrett acquisition (trade) and Trent McDuffie (trade) represent two generational defensive upgrades in a single offseason.",
      ],
      concerns: [
        "Quarterback ranks #5 — Matthew Stafford turns 38 in 2026; his durability and sustained performance remain the only realistic ceiling question for this team.",
        "New offensive coordinator (Scheelhaase) after years of McVay calling plays — a modest but real adjustment risk.",
        "The roster investment is heavily weighted toward aging veterans; depth concerns emerge if key players miss games.",
      ],
      jkbTakeaway: "Sharp has the Rams as the most complete team in football by unit rankings — #1 coaching, top-5 across every other category. JKB model aligns with an 11.5-win projection. The Garrett + McDuffie additions create an elite defensive profile that was already top-5 in multiple categories. Matthew Stafford's health is the only real risk. Over on the win total is the strongest Sharp-supported bet on the board.",
    },
  },

  // ─── Miami Dolphins ──────────────────────────────────────────────────────
  {
    team: "Miami Dolphins", abbr: "mia",
    chapterStartPage: 398, positionalRatingsPage: 402,
    coaching: {
      headCoach: "Jeff Hafley", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Bobby Slowik", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Sean Duggan", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 398,
    },
    keyAdditions: [
      { player: "Malik Willis", position: "QB", previousTeam: "gb", contractNote: "$22.5M" },
    ],
    keyDepartures: [
      { player: "Tyreek Hill", position: "WR" },
      { player: "Jaylen Waddle", position: "WR", newTeam: "den" },
      { player: "Minkah Fitzpatrick", position: "S", newTeam: "nyj" },
      { player: "James Daniels", position: "LG" },
      { player: "Larry Borom", position: "RT", newTeam: "det" },
      { player: "Alec Ingold", position: "FB", newTeam: "lac" },
      { player: "Jalen Ramsey", position: "CB" },
      { player: "Terron Armstead", position: "LT" },
      { player: "Bradley Chubb", position: "EDGE" },
    ],
    draftAdditions: [
      { round: 1, pick: 12, player: "Kadyn Proctor", position: "T", college: "Alabama" },
      { round: 2, pick: 27, player: "Chris Johnson", position: "CB", college: "San Diego State" },
      { round: 2, pick: 43, player: "Jacob Rodriguez", position: "LB", college: "Florida" },
      { round: 2, pick: 75, player: "Caleb Douglas", position: "WR", college: "Texas" },
      { round: 3, pick: 94, player: "Chris Bell", position: "WR", college: "Louisville" },
      { round: 4, pick: 130, player: "Trey Moore", position: "DE", college: "Texas" },
      { round: 5, pick: 138, player: "Michael Taaffe", position: "S", college: "Texas" },
      { round: 5, pick: 177, player: "Kevin Coleman Jr.", position: "WR", college: "Mississippi" },
      { round: 6, pick: 200, player: "DJ Campbell", position: "G", college: "Texas" },
    ],
    positionalRatings: {
      quarterbacks: 28, offensiveLine: 29, receivers: 32, runningBacks: 8,
      front7: 32, secondary: 32, headCoach: 30, sourcePage: 402,
    },
    outlook: {
      strengths: [
        "Running backs rank #8 — De'Von Achane remains one of the most explosive playmakers in football and is one of the few unambiguous strengths on the roster.",
        "The 2026 draft class (9 picks, led by Kadyn Proctor at T) signals a genuine commitment to the offensive line rebuild that must happen.",
      ],
      concerns: [
        "Receivers rank #32, front 7 rank #32, secondary rank #32 — three categories at the absolute bottom of the NFL; Sharp writes this roster has 'absorbed 60% of their total offensive snaps' in roster turnover.",
        "Quarterback ranks #28 — Malik Willis has limited NFL starting experience; this is a developmental situation with no realistic playoff expectation.",
        "Entirely new coaching staff (Hafley + Slowik + Duggan) overseeing a historically gutted roster; Year 1 results will be painful regardless of intent.",
      ],
      jkbTakeaway: "Miami is in a multi-year rebuild that Sharp describes as nearly unprecedented in modern NFL history — 50%+ roster turnover on both sides of the ball in one offseason. JKB model projects bottom-5 wins. The Under on 4.5 wins requires a historically bad team performance; Sharp's data validates that outcome. De'Von Achane is the only player worth fantasy or betting consideration in 2026.",
    },
  },

  // ─── Minnesota Vikings ───────────────────────────────────────────────────
  {
    team: "Minnesota Vikings", abbr: "min",
    chapterStartPage: 415, positionalRatingsPage: 419,
    coaching: {
      headCoach: "Kevin O'Connell", headCoachPriorYears: 4, headCoachNew: false,
      offensiveCoordinator: "Wes Phillips", offensiveCoordinatorPriorYears: 4, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Brian Flores", defensiveCoordinatorPriorYears: 3, defensiveCoordinatorNew: false,
      sourcePage: 415,
    },
    keyAdditions: [
      { player: "Kyler Murray", position: "QB", previousTeam: "ari", contractNote: "$8M" },
      { player: "Jauan Jennings", position: "WR", contractNote: "$8M" },
      { player: "James Pierre", position: "CB", contractNote: "$4.29M" },
      { player: "Ryan Van Demark", position: "RT", previousTeam: "buf", contractNote: "$4.29M" },
      { player: "Johnny Hekker", position: "P", contractNote: "$1.50M" },
      { player: "Eric Johnson", position: "IDL", contractNote: "$1.39M" },
    ],
    keyDepartures: [
      { player: "Jonathan Greenard", position: "EDGE", newTeam: "phi" },
      { player: "Jalen Nailor", position: "WR", newTeam: "lv" },
      { player: "Javon Hargrave", position: "IDL", newTeam: "gb" },
      { player: "Ryan Kelly", position: "C" },
      { player: "Ryan Wright", position: "P", newTeam: "no" },
      { player: "C.J. Ham", position: "FB" },
      { player: "Jeff Okudah", position: "CB" },
      { player: "Rondale Moore", position: "WR" },
    ],
    draftAdditions: [
      { round: 1, pick: 18, player: "Caleb Banks", position: "DE", college: "Florida" },
      { round: 2, pick: 51, player: "Jake Golday", position: "LB", college: "Cincinnati" },
      { round: 2, pick: 82, player: "Dominique Orange", position: "DT", college: "Iowa State" },
      { round: 3, pick: 97, player: "Caleb Tieman", position: "T", college: "Northwestern" },
      { round: 3, pick: 98, player: "Jakobe Thomas", position: "S", college: "Miami (FL)" },
      { round: 5, pick: 159, player: "Max Bredeson", position: "FB", college: "Michigan" },
      { round: 5, pick: 163, player: "Charles Demmings", position: "CB", college: "Stephen F. Austin" },
    ],
    positionalRatings: {
      quarterbacks: 21, offensiveLine: 12, receivers: 3, runningBacks: 28,
      front7: 20, secondary: 16, headCoach: 9, sourcePage: 419,
    },
    outlook: {
      strengths: [
        "Receivers rank #3 — Justin Jefferson is the best wide receiver in the NFL; his presence elevates the entire passing game regardless of quarterback.",
        "Head coach ranks #9 — O'Connell's four-year tenure has produced consistent results; the offensive system is established and proven.",
        "Coaching staff enters Year 5 together (O'Connell + Phillips + Flores) — the NFC's second-most established trio.",
      ],
      concerns: [
        "Quarterback ranks #21 — Kyler Murray's move to Minnesota is a significant downgrade from Sam Darnold's 2025 performance; Sharp writes the Vikings 'committed future damage' by trading their draft capital.",
        "Running backs rank #28 — Aaron Jones and the backfield lack a featured back capable of carrying a full workload.",
        "Sharp describes the GM's draft history as producing 'the worst talent returns in the NFL' — the 2026 draft class reflects this ongoing concern.",
      ],
      jkbTakeaway: "Jefferson at #3 receivers makes Minnesota's offense dangerous regardless of system. However, the QB downgrade (Darnold → Murray) is real and Sharp is unambiguous about this. JKB model projects moderate wins at 8.5 — Sharp sees a team with elite receiver talent and below-average quarterback play. The Over requires Murray to recapture his 2019-2020 form, which is far from certain.",
    },
  },

  // ─── New England Patriots ────────────────────────────────────────────────
  {
    team: "New England Patriots", abbr: "ne",
    chapterStartPage: 432, positionalRatingsPage: 436,
    coaching: {
      headCoach: "Mike Vrabel", headCoachPriorYears: 1, headCoachNew: false,
      offensiveCoordinator: "Josh McDaniels", offensiveCoordinatorPriorYears: 1, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Zak Kuhr", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 432,
    },
    keyAdditions: [
      { player: "Romeo Doubs", position: "WR", previousTeam: "gb", contractNote: "$17M" },
      { player: "A.J. Brown", position: "WR", previousTeam: "phi" },
      { player: "Alijah Vera-Tucker", position: "RG", previousTeam: "nyj", contractNote: "$14M" },
      { player: "Dre'Mont Jones", position: "IDL", previousTeam: "bal", contractNote: "$12.1M" },
      { player: "Kevin Byard", position: "S", previousTeam: "chi", contractNote: "$7M" },
      { player: "Julian Hill", position: "TE", contractNote: "$5M" },
      { player: "Reggie Gilliam", position: "FB", previousTeam: "buf", contractNote: "$3.60M" },
    ],
    keyDepartures: [
      { player: "Stefon Diggs", position: "WR" },
      { player: "K'Lavon Chaisson", position: "EDGE", newTeam: "wsh" },
      { player: "Khyris Tonga", position: "IDL", newTeam: "kc" },
      { player: "Jahlani Tavai", position: "LB" },
      { player: "Garrett Bradbury", position: "C", newTeam: "chi" },
      { player: "Joshua Dobbs", position: "QB" },
      { player: "Antonio Gibson", position: "RB" },
    ],
    draftAdditions: [
      { round: 1, pick: 28, player: "Caleb Lomu", position: "T", college: "Utah" },
      { round: 2, pick: 55, player: "Gabe Jacas", position: "TE", college: "Illinois" },
      { round: 3, pick: 95, player: "Eli Randon", position: "TE", college: "Notre Dame" },
      { round: 5, pick: 171, player: "Karon Prunty", position: "CB", college: "Wake Forest" },
      { round: 5, pick: 196, player: "Dametrious Crownover", position: "T", college: "Texas A&M" },
      { round: 6, pick: 212, player: "Namdi Obiazor", position: "LB", college: "TCU" },
      { round: 6, pick: 234, player: "Behren Morton", position: "QB", college: "Texas Tech" },
    ],
    positionalRatings: {
      quarterbacks: 6, offensiveLine: 15, receivers: 16, runningBacks: 11,
      front7: 11, secondary: 5, headCoach: 8, sourcePage: 436,
    },
    outlook: {
      strengths: [
        "Quarterback ranks #6 — Drake Maye's 2025 showed legitimate franchise-QB flashes; Sharp ranked him #2 in 'stable metrics' last year.",
        "Secondary ranks #5 — Kevin Byard and the cornerback group represent one of the better defensive backfields in the AFC East.",
        "A.J. Brown addition (trade) gives Maye his first true WR1; combined with Romeo Doubs, the receiver corps jumps to #16 from much lower.",
      ],
      concerns: [
        "The Patriots went 14-3 in 2025 — significant regression is baked into any 2026 projection; Sharp expects schedule and luck factors to normalize.",
        "Josh McDaniels (Year 2) has a mixed track record as an OC outside of New England; the system must develop Maye efficiently.",
        "New defensive coordinator (Kuhr) must maintain the secondary's effectiveness while building a coherent scheme.",
      ],
      jkbTakeaway: "New England's 14-3 record was built on historically favorable turnover margin, field goal luck, and fumble luck that Sharp explicitly identifies as unsustainable. Maye is a legitimate franchise QB (#6) but the regression from 14 wins to 9.5 projected is rational. The Over requires both continued scheduling luck and Maye sustaining his 2025 statistical gains.",
    },
  },

  // ─── New Orleans Saints ──────────────────────────────────────────────────
  {
    team: "New Orleans Saints", abbr: "no",
    chapterStartPage: 449, positionalRatingsPage: 453,
    coaching: {
      headCoach: "Kellen Moore", headCoachPriorYears: 1, headCoachNew: false,
      offensiveCoordinator: "Doug Nussmeier", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Brandon Staley", defensiveCoordinatorPriorYears: 1, defensiveCoordinatorNew: false,
      sourcePage: 449,
    },
    keyAdditions: [
      { player: "David Edwards", position: "LG", contractNote: "$15.3M" },
      { player: "Travis Etienne", position: "RB", previousTeam: "jax", contractNote: "$12M" },
      { player: "Kaden Elliss", position: "LB", previousTeam: "atl", contractNote: "$11M" },
      { player: "Tyree Wilson", position: "EDGE", previousTeam: "lv", contractNote: "$6.5M" },
      { player: "Noah Fant", position: "TE", previousTeam: "cin", contractNote: "$4.40M" },
      { player: "Ryan Wright", position: "P", previousTeam: "min", contractNote: "$3.5M" },
      { player: "Martin Emerson", position: "CB", previousTeam: "cle", contractNote: "$1.5M" },
    ],
    keyDepartures: [
      { player: "Alontae Taylor", position: "CB", newTeam: "ten" },
      { player: "Demario Davis", position: "LB", newTeam: "nyj" },
      { player: "Taysom Hill", position: "QB" },
      { player: "Cameron Jordan", position: "EDGE" },
      { player: "Foster Moreau", position: "TE", newTeam: "hou" },
      { player: "Luke Fortner", position: "C", newTeam: "car" },
      { player: "Jonathan Bullard", position: "IDL", newTeam: "dal" },
      { player: "Jonah Williams", position: "IDL", newTeam: "ari" },
    ],
    draftAdditions: [
      { round: 1, pick: 8, player: "Jordyn Tyson", position: "WR", college: "Arizona State" },
      { round: 2, pick: 42, player: "Christen Miller", position: "DT", college: "Georgia" },
      { round: 3, pick: 73, player: "Oscar Delp", position: "TE", college: "Georgia" },
      { round: 4, pick: 132, player: "Jeremiah Wright", position: "G", college: "Auburn" },
      { round: 4, pick: 136, player: "Bryce Lance", position: "WR", college: "North Dakota State" },
      { round: 5, pick: 172, player: "Lorenzo Styles Jr.", position: "S", college: "Ohio State" },
      { round: 6, pick: 190, player: "Barion Brown", position: "WR", college: "LSU" },
      { round: 7, pick: 219, player: "TJ Hall", position: "CB", college: "Iowa" },
    ],
    positionalRatings: {
      quarterbacks: 22, offensiveLine: 16, receivers: 18, runningBacks: 19,
      front7: 28, secondary: 20, headCoach: 17, sourcePage: 453,
    },
    outlook: {
      strengths: [
        "Travis Etienne acquisition transforms the backfield from a weakness to a credible rushing and receiving option; Sharp notes the Jaguars built their offense around him.",
        "Receivers climb to #18 with Jordyn Tyson (Rd 1) — Tyler Shough and Chris Olave form a playable QB-WR pairing with genuine upside.",
        "Kaden Elliss and Tyree Wilson add meaningful pass-rush and linebacker depth to a front 7 that was the biggest concern (ranked #28).",
      ],
      concerns: [
        "Front 7 still ranks #28 despite additions — Cameron Jordan's departure ends an era, and the replacements have not yet proven equivalent production.",
        "Quarterback ranks #22 — Tyler Shough's sophomore season remains the decisive variable; his 2025 metrics as a rookie were impressive but small-sample.",
        "Doug Nussmeier (new OC) must integrate multiple new skill-position players into a cohesive offensive system in Year 1.",
      ],
      jkbTakeaway: "New Orleans made the right moves by adding Etienne and improving receiver depth, but the front 7 at #28 remains the structural weakness. JKB model projects improvement from 6-11 to 7.5 wins — Sharp's data supports this trajectory. The NFC South is genuinely competitive in 2026 and the Saints' coaching staff (Moore Year 2, Staley Year 2) has a fair runway. Over at 7.5 is a coin flip.",
    },
  },

  // ─── New York Giants ─────────────────────────────────────────────────────
  {
    team: "New York Giants", abbr: "nyg",
    chapterStartPage: 466, positionalRatingsPage: 470,
    coaching: {
      headCoach: "John Harbaugh", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Matt Nagy", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Dennard Wilson", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 466,
    },
    keyAdditions: [
      { player: "Isaiah Likely", position: "TE", previousTeam: "bal", contractNote: "$13.3M" },
      { player: "Tremaine Edmunds", position: "LB", previousTeam: "chi", contractNote: "$12M" },
      { player: "Greg Newsome II", position: "CB", previousTeam: "cle" },
      { player: "D.J. Reader", position: "IDL", previousTeam: "det", contractNote: "$6.29M" },
      { player: "Patrick Ricard", position: "FB", previousTeam: "bal", contractNote: "$4.09M" },
      { player: "Darnell Mooney", position: "WR", previousTeam: "atl", contractNote: "$3M" },
    ],
    keyDepartures: [
      { player: "Dexter Lawrence", position: "IDL", newTeam: "cin" },
      { player: "Wan'Dale Robinson", position: "WR", newTeam: "ten" },
      { player: "Cordale Flott", position: "CB", newTeam: "nyj" },
      { player: "Russell Wilson", position: "QB" },
      { player: "Bobby Okereke", position: "LB", newTeam: "det" },
      { player: "Daniel Bellinger", position: "TE", newTeam: "ten" },
      { player: "Graham Gano", position: "K" },
    ],
    draftAdditions: [
      { round: 1, pick: 5, player: "Arvell Reese", position: "LB", college: "Ohio State" },
      { round: 1, pick: 10, player: "Francis Mauigoa", position: "G", college: "Miami (FL)" },
      { round: 2, pick: 37, player: "Colton Hood", position: "CB", college: "Alabama" },
      { round: 3, pick: 74, player: "Malachi Fields", position: "WR", college: "Notre Dame" },
      { round: 3, pick: 186, player: "Bobby Jamison-Travis", position: "DT", college: "Auburn" },
      { round: 6, pick: 192, player: "T.J.C. Davis", position: "T", college: "Illinois" },
      { round: 6, pick: 193, player: "Jack Kelly", position: "LB", college: "BYU" },
    ],
    positionalRatings: {
      quarterbacks: 20, offensiveLine: 20, receivers: 26, runningBacks: 24,
      front7: 17, secondary: 28, headCoach: 15, sourcePage: 470,
    },
    outlook: {
      strengths: [
        "John Harbaugh (new HC) brings an 18-year winning track record and represents the most significant coaching upgrade in the NFC East this offseason.",
        "Arvell Reese (Rd 1 pick 5) adds an immediate linebacker presence alongside Tremaine Edmunds; the linebacker group is meaningfully improved.",
        "Francis Mauigoa (G, Rd 1 pick 10) addresses the offensive line's most urgent need and gives the OL a foundational interior piece.",
      ],
      concerns: [
        "Quarterback ranks #20 and receivers rank #26 — the two most important offensive positions are among the weakest in the NFC; Jameis Winston as starter is a high-variance gamble.",
        "Secondary ranks #28 — Sharp identifies this as a critical weakness; losing Dexter Lawrence and adding Greg Newsome (who had injury questions) creates concerns.",
        "Entirely new coaching staff (Harbaugh + Nagy + Wilson) with a roster that Sharp describes as built for a 'losing team for a few more years.'",
      ],
      jkbTakeaway: "Harbaugh's arrival is the single most exciting development in the NFC East, but he's working with bottom-half skill-position rankings at QB (#20), WR (#26), and RB (#24). JKB model projects realistic improvement but not playoff contention in Year 1. Sharp's data supports patience — Harbaugh will develop the roster, but 2026 may be 7-8 wins during a necessary transition year.",
    },
  },

  // ─── New York Jets ───────────────────────────────────────────────────────
  {
    team: "New York Jets", abbr: "nyj",
    chapterStartPage: 484, positionalRatingsPage: 488,
    coaching: {
      headCoach: "Aaron Glenn", headCoachPriorYears: 1, headCoachNew: false,
      offensiveCoordinator: "Frank Reich", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Brian Duker", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 484,
    },
    keyAdditions: [
      { player: "Minkah Fitzpatrick", position: "S", previousTeam: "mia" },
      { player: "Demario Davis", position: "LB", previousTeam: "no", contractNote: "$14M" },
      { player: "David Onyemata", position: "IDL", previousTeam: "atl", contractNote: "$10.5M" },
      { player: "Geno Smith", position: "QB", previousTeam: "lv" },
      { player: "Cordale Flott", position: "CB", previousTeam: "nyg" },
      { player: "Dylan Parham", position: "LG", previousTeam: "lv" },
      { player: "Nahshon Wright", position: "CB", contractNote: "$3.5M" },
    ],
    keyDepartures: [
      { player: "Alijah Vera-Tucker", position: "RG", newTeam: "ne" },
      { player: "Justin Fields", position: "QB", newTeam: "kc" },
      { player: "John Simpson", position: "LG", newTeam: "bal" },
      { player: "Nick Folk", position: "K" },
      { player: "Jermaine Johnson", position: "EDGE" },
      { player: "Javon Kinlaw", position: "IDL" },
      { player: "Tony Adams", position: "S" },
      { player: "Leander Robinson", position: "RB" },
    ],
    draftAdditions: [
      { round: 1, pick: 2, player: "David Bailey", position: "LB", college: "Texas" },
      { round: 1, pick: 16, player: "Kenyon Sadiq", position: "TE", college: "Oregon" },
      { round: 1, pick: 30, player: "Omar Cooper Jr.", position: "WR", college: "Indiana" },
      { round: 2, pick: 50, player: "Darrell Jackson Jr.", position: "DT", college: "Florida State" },
      { round: 4, pick: 103, player: "Cade Klubnik", position: "QB", college: "Clemson" },
      { round: 4, pick: 110, player: "Anez Cooper", position: "G", college: "Miami (FL)" },
      { round: 6, pick: 188, player: "VJ Payne", position: "S", college: "Kansas State" },
    ],
    positionalRatings: {
      quarterbacks: 30, offensiveLine: 19, receivers: 23, runningBacks: 14,
      front7: 16, secondary: 24, headCoach: 32, sourcePage: 488,
    },
    outlook: {
      strengths: [
        "Minkah Fitzpatrick (trade) is a legitimate star safety who upgrades a secondary that needed a difference-maker at the back end.",
        "Demario Davis (from NO) and David Bailey (Rd 1 pick 2) significantly upgrade the linebacker corps — both are high-impact additions.",
        "Three first-round picks in 2026 (Bailey, Sadiq, Cooper) represent significant roster infusion at key positions.",
      ],
      concerns: [
        "Head coach ranks #32 and quarterback ranks #30 — Sharp rates Aaron Glenn as the lowest-ranked head coach in the NFL; Geno Smith is a bottom-5 QB.",
        "Sharp's chapter notes the Jets 'built on the defensive secondary' while their offensive investments were minimal; the offense ranks poorly across every category.",
        "New offensive coordinator (Frank Reich) and new defensive coordinator (Duker) create full coaching-staff turnover for the second time in two years.",
      ],
      jkbTakeaway: "The Jets have a concerning profile: worst-rated head coach (#32) and second-worst QB (#30) with three new coordinators in two years. JKB model projects a bottom-5 season. Sharp's data fully supports this — the Minkah Fitzpatrick and Demario Davis additions are good players on a team that cannot score points. Under 5.5 wins is the rational position.",
    },
  },

  // ─── Philadelphia Eagles ─────────────────────────────────────────────────
  {
    team: "Philadelphia Eagles", abbr: "phi",
    chapterStartPage: 500, positionalRatingsPage: 504,
    coaching: {
      headCoach: "Nick Sirianni", headCoachPriorYears: 5, headCoachNew: false,
      offensiveCoordinator: "Sean Mannion", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Vic Fangio", defensiveCoordinatorPriorYears: 2, defensiveCoordinatorNew: false,
      sourcePage: 500,
    },
    keyAdditions: [
      { player: "Jonathan Greenard", position: "EDGE", previousTeam: "min" },
      { player: "Tariq Woolen", position: "CB", previousTeam: "sea", contractNote: "$12M" },
      { player: "Dontayvion Wicks", position: "WR", previousTeam: "gb" },
      { player: "Marquise Brown", position: "WR", contractNote: "$5M" },
      { player: "Arnold Ebiketie", position: "EDGE", previousTeam: "atl", contractNote: "$4.29M" },
      { player: "Andy Dalton", position: "QB", previousTeam: "car", contractNote: "$3.5M" },
    ],
    keyDepartures: [
      { player: "A.J. Brown", position: "WR", newTeam: "ne" },
      { player: "Jaelan Phillips", position: "EDGE", newTeam: "car" },
      { player: "Nakobe Dean", position: "LB", newTeam: "lv" },
      { player: "Reed Blankenship", position: "S", newTeam: "hou" },
      { player: "Sam Howell", position: "QB", newTeam: "dal" },
      { player: "Brandon Graham", position: "EDGE" },
      { player: "Josh Uche", position: "EDGE", newTeam: "lac" },
    ],
    draftAdditions: [
      { round: 1, pick: 20, player: "Makai Lemon", position: "WR", college: "USC" },
      { round: 2, pick: 54, player: "Eli Stowers", position: "TE", college: "Vanderbilt" },
      { round: 3, pick: 68, player: "Markel Bell", position: "T", college: "Miami (FL)" },
      { round: 5, pick: 178, player: "Cole Payton", position: "CB", college: "North Dakota State" },
      { round: 6, pick: 207, player: "Micah Morris", position: "G", college: "Georgia" },
      { round: 6, pick: 244, player: "Cole Wisniewski", position: "S", college: "Texas Tech" },
      { round: 7, pick: 251, player: "Uar Bernard", position: "DT", college: "IPP" },
    ],
    positionalRatings: {
      quarterbacks: 12, offensiveLine: 2, receivers: 8, runningBacks: 5,
      front7: 2, secondary: 6, headCoach: 14, sourcePage: 504,
    },
    outlook: {
      strengths: [
        "Offensive line ranks #2 and front 7 ranks #2 — Philadelphia's trenches are the best in the NFC East on both sides of the ball.",
        "Secondary ranks #6 with Tariq Woolen added — the Eagles' defensive back group is elite alongside Darius Slay and Cooper DeJean.",
        "Running backs rank #5 — Saquon Barkley remained healthy and productive; the ground game is a genuine offensive weapon.",
      ],
      concerns: [
        "Losing A.J. Brown to New England is a significant blow; the receiver corps drops despite Makai Lemon (Rd 1) and Marquise Brown additions.",
        "New offensive coordinator (Sean Mannion) replacing his own coordinators for the fourth consecutive season raises system-continuity concerns.",
        "Sharp writes that the Eagles' 11-6 record masked significant internal dysfunction — the coordinator carousel is an organizational red flag.",
      ],
      jkbTakeaway: "The Eagles have the league's second-best offensive line and second-best front 7 — two structural anchors that ensure competitive play regardless of coordinator. Jalen Hurts and Saquon Barkley give this offense a reliable floor. JKB model projects 10.5 wins; Sharp's data fully supports that projection given the trenches advantage. The A.J. Brown loss is real but the infrastructure is too good to fade.",
    },
  },

  // ─── Pittsburgh Steelers ─────────────────────────────────────────────────
  {
    team: "Pittsburgh Steelers", abbr: "pit",
    chapterStartPage: 518, positionalRatingsPage: 522,
    coaching: {
      headCoach: "Mike McCarthy", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Brian Angelichio", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Patrick Graham", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 518,
    },
    keyAdditions: [
      { player: "Michael Pittman Jr.", position: "WR", previousTeam: "ind" },
      { player: "Jamel Dean", position: "CB", previousTeam: "tb", contractNote: "$12.3M" },
      { player: "Rico Dowdle", position: "RB", previousTeam: "car", contractNote: "$6.09M" },
      { player: "Jaquan Brisker", position: "S", previousTeam: "chi", contractNote: "$5.5M" },
      { player: "Sebastian Joseph-Day", position: "IDL", contractNote: "$5.5M" },
      { player: "Brock Hoffman", position: "RG", contractNote: "$2.5M" },
    ],
    keyDepartures: [
      { player: "Jonnu Smith", position: "TE" },
      { player: "Isaac Seumalo", position: "LG", newTeam: "ari" },
      { player: "Kenneth Gainwell", position: "RB" },
      { player: "Adam Thielen", position: "WR" },
      { player: "James Pierre", position: "CB", newTeam: "min" },
      { player: "Daniel Ekuale", position: "IDL" },
      { player: "Connor Heyward", position: "TE", newTeam: "lv" },
    ],
    draftAdditions: [
      { round: 1, pick: 21, player: "Max Ihenacho", position: "T", college: "Arizona State" },
      { round: 2, pick: 47, player: "Germie Bernard", position: "WR", college: "Alabama" },
      { round: 3, pick: 76, player: "Drew Allar", position: "QB", college: "Penn State" },
      { round: 3, pick: 85, player: "Daylen Everette", position: "CB", college: "Georgia" },
      { round: 4, pick: 121, player: "Kaden Wetjen", position: "WR", college: "Iowa" },
      { round: 5, pick: 169, player: "Riley Nowakowski", position: "TE", college: "Indiana" },
      { round: 6, pick: 210, player: "Gabriel Rubio", position: "DT", college: "Notre Dame" },
    ],
    positionalRatings: {
      quarterbacks: 27, offensiveLine: 21, receivers: 22, runningBacks: 12,
      front7: 7, secondary: 7, headCoach: 21, sourcePage: 522,
    },
    outlook: {
      strengths: [
        "Front 7 ranks #7 and secondary ranks #7 — Pittsburgh's defense was the most expensive in the NFL last year and the talent remains elite.",
        "Michael Pittman Jr. (from Indianapolis) is a significant WR1 upgrade and gives Aaron Rodgers a legitimate chain-moving target.",
        "Rico Dowdle adds a proven every-down back to what was a patchwork running game.",
      ],
      concerns: [
        "Quarterback ranks #27 — Aaron Rodgers' age (42) and recent decline are the defining limitation on Pittsburgh's ceiling.",
        "Entirely new coaching staff (McCarthy + Angelichio + Graham) without established Rodgers chemistry creates early-season scheme integration risk.",
        "Sharp notes the defense spent $175M in 2025 cap to rank #15 in success rate — significant money for middling return; the defense must be elite to compensate for QB limitations.",
      ],
      jkbTakeaway: "Pittsburgh has a genuinely elite defense (#7 front 7, #7 secondary) and a deeply limited quarterback situation (#27). JKB model projects 8.5 wins — Sharp's data fully supports this plateau. The defense gives Pittsburgh a floor; Rodgers' decline is the ceiling. Over 8.5 requires the coaching staff to solve the offensive execution problem that stymied the Steelers in 2025.",
    },
  },

  // ─── San Francisco 49ers ─────────────────────────────────────────────────
  {
    team: "San Francisco 49ers", abbr: "sf",
    chapterStartPage: 535, positionalRatingsPage: 539,
    coaching: {
      headCoach: "Kyle Shanahan", headCoachPriorYears: 9, headCoachNew: false,
      offensiveCoordinator: "Klay Kubiak", offensiveCoordinatorPriorYears: 1, offensiveCoordinatorNew: false,
      defensiveCoordinator: "Raheem Morris", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 535,
    },
    keyAdditions: [
      { player: "Osa Odighizuwa", position: "IDL", previousTeam: "dal" },
      { player: "Mike Evans", position: "WR", previousTeam: "tb", contractNote: "$14.1M" },
      { player: "Vederian Lowe", position: "LT", contractNote: "$4.59M" },
      { player: "Christian Kirk", position: "WR", previousTeam: "hou", contractNote: "$3M" },
      { player: "Brett Toth", position: "LT", contractNote: "$2.5M" },
      { player: "Robert Jones", position: "RG", contractNote: "$1.8M" },
    ],
    keyDepartures: [
      { player: "Bryce Huff", position: "EDGE" },
      { player: "Yetur Gross-Matos", position: "EDGE", newTeam: "ari" },
      { player: "Kendrick Bourne", position: "WR", newTeam: "ari" },
      { player: "Brian Robinson Jr.", position: "RB", newTeam: "atl" },
      { player: "Spencer Burford", position: "RG", newTeam: "lv" },
      { player: "Kalia Davis", position: "IDL", newTeam: "cle" },
      { player: "Jason Pinnock", position: "S", newTeam: "dal" },
    ],
    draftAdditions: [
      { round: 2, pick: 33, player: "De'Zhaun Stribling", position: "WR", college: "Ole Miss" },
      { round: 3, pick: 70, player: "Romello Height", position: "DT", college: "Texas Tech" },
      { round: 3, pick: 90, player: "Kaelon Black", position: "CB", college: "Indiana" },
      { round: 4, pick: 107, player: "Gracen Halton", position: "DT", college: "Oklahoma" },
      { round: 4, pick: 127, player: "Carver Willis", position: "T", college: "Washington" },
      { round: 4, pick: 139, player: "Ephesians Prysock", position: "CB", college: "Washington" },
      { round: 5, pick: 144, player: "Jaden Dugger", position: "LB", college: "Louisiana" },
    ],
    positionalRatings: {
      quarterbacks: 8, offensiveLine: 7, receivers: 6, runningBacks: 7,
      front7: 8, secondary: 26, headCoach: 3, sourcePage: 539,
    },
    outlook: {
      strengths: [
        "Head coach ranks #3 — Shanahan's offensive system is the most celebrated in football; the 9-year run validates his ranking.",
        "Five of six non-secondary rankings are in the top-8: QB (8), OL (7), WR (6), RB (7), Front 7 (8) — a balanced and deep roster.",
        "Mike Evans addition (from Tampa) gives Brock Purdy a proven possession WR1 who has never missed a 1,000-yard season.",
      ],
      concerns: [
        "Secondary ranks #26 — the 49ers gave up significant ground in coverage last year, and the departure of Deommodore Lenoir and others was not fully replaced.",
        "New defensive coordinator (Raheem Morris) must rebuild the secondary while maintaining the defensive line's elite ranking.",
        "Sharp writes that Shanahan 'coached the #9 most-injured 49ers to a 13-4 record' — injury luck regression is the primary 2026 risk.",
      ],
      jkbTakeaway: "San Francisco's top-8 profile across offense is among the most complete in the NFC. Shanahan at #3 coach and Purdy at a tied-#8 QB make this a legitimate Super Bowl contender. JKB model projects 10.5 wins. The #26 secondary is the one concern that matches schedule difficulty — if the corners don't improve, late-season shootouts become dangerous. Over is the right side of this bet.",
    },
  },

  // ─── Seattle Seahawks ────────────────────────────────────────────────────
  {
    team: "Seattle Seahawks", abbr: "sea",
    chapterStartPage: 552, positionalRatingsPage: 556,
    coaching: {
      headCoach: "Mike Macdonald", headCoachPriorYears: 2, headCoachNew: false,
      offensiveCoordinator: "Brian Fleury", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Aden Durde", defensiveCoordinatorPriorYears: 2, defensiveCoordinatorNew: false,
      sourcePage: 552,
    },
    keyAdditions: [
      { player: "Emanuel Wilson", position: "RB", contractNote: "$1.60M" },
    ],
    keyDepartures: [
      { player: "Boye Mafe", position: "EDGE", newTeam: "cin" },
      { player: "Kenneth Walker III", position: "RB", newTeam: "kc" },
      { player: "Coby Bryant", position: "S", newTeam: "chi" },
      { player: "Tariq Woolen", position: "CB", newTeam: "phi" },
      { player: "Dareke Young", position: "WR", newTeam: "lv" },
      { player: "Shane Lemieux", position: "LG" },
    ],
    draftAdditions: [
      { round: 1, pick: 32, player: "Jadanian Price", position: "RB", college: "Notre Dame" },
      { round: 2, pick: 64, player: "Bud Clark", position: "S", college: "TCU" },
      { round: 3, pick: 99, player: "Julian Neal", position: "CB", college: "Arkansas" },
      { round: 5, pick: 148, player: "Beau Stephens", position: "G", college: "Iowa" },
      { round: 5, pick: 199, player: "Emmanuel Henderson Jr.", position: "WR", college: "Kansas" },
      { round: 5, pick: 236, player: "Andre Fuller", position: "CB", college: "Toledo" },
      { round: 7, pick: 242, player: "Deven Eastern", position: "DT", college: "Toledo" },
    ],
    positionalRatings: {
      quarterbacks: 18, offensiveLine: 9, receivers: 7, runningBacks: 31,
      front7: 5, secondary: 2, headCoach: 4, sourcePage: 556,
    },
    outlook: {
      strengths: [
        "Head coach ranks #4 — Macdonald won the Super Bowl in Year 2 with a historically improbable roster; Sharp credits him as one of the most impactful coaches in the NFL.",
        "Secondary ranks tied #2 (with Denver) and front 7 ranks #5 — Seattle's defense remains elite and the Durde continuity (Year 3) supports further improvement.",
        "Receivers rank #7 — Jaxon Smith-Njigba is developing into a WR1 and the corps is one of the stronger groups in the NFC West.",
      ],
      concerns: [
        "Running backs rank #31 — Kenneth Walker's departure to Kansas City is a massive blow; the backfield is now the team's most glaring weakness.",
        "Quarterback ranks #18 — Sam Darnold enters as the new franchise quarterback; Sharp wrote his 2025 performance was statistically positive but historically unrepeatable.",
        "New offensive coordinator (Brian Fleury) must integrate Darnold smoothly while replacing the Walker-era ground game identity.",
      ],
      jkbTakeaway: "Seattle won the Super Bowl with Sam Darnold leading 20 turnovers and throwing 12 INTs. Sharp notes this is historically unprecedented — the regression from Darnold's unsustainable efficiency is real and baked into JKB model projections. However, the #2 secondary, #5 front 7, and #4 head coach give Seattle a defensive floor that most contenders would envy. 10.5 wins requires Darnold to be average, not great.",
    },
  },

  // ─── Tampa Bay Buccaneers ────────────────────────────────────────────────
  {
    team: "Tampa Bay Buccaneers", abbr: "tb",
    chapterStartPage: 569, positionalRatingsPage: 573,
    coaching: {
      headCoach: "Todd Bowles", headCoachPriorYears: 4, headCoachNew: false,
      offensiveCoordinator: "Zac Robinson", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "George Edwards", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 569,
    },
    keyAdditions: [
      { player: "A'Shawn Robinson", position: "IDL", previousTeam: "car", contractNote: "$10M" },
      { player: "Alex Anzalone", position: "LB", previousTeam: "det", contractNote: "$8.5M" },
      { player: "Kenneth Gainwell", position: "RB", previousTeam: "phi", contractNote: "$7M" },
      { player: "Miles Killebrew", position: "S", contractNote: "$1.8M" },
      { player: "Christian Rozeboom", position: "LB", contractNote: "$1.60M" },
    ],
    keyDepartures: [
      { player: "Mike Evans", position: "WR", newTeam: "sf" },
      { player: "Haason Reddick", position: "EDGE" },
      { player: "Jamel Dean", position: "CB", newTeam: "pit" },
      { player: "Lavonte David", position: "LB" },
      { player: "Logan Hall", position: "IDL", newTeam: "hou" },
      { player: "Christian Izien", position: "S", newTeam: "det" },
      { player: "Rachaad White", position: "RB", newTeam: "wsh" },
    ],
    draftAdditions: [
      { round: 1, pick: 15, player: "Rueben Bain Jr.", position: "DE", college: "Miami (FL)" },
      { round: 2, pick: 46, player: "LB - Anthony Hill Jr.", position: "LB", college: "Texas" },
      { round: 3, pick: 84, player: "Ted Hurst", position: "WR", college: "Georgia State" },
      { round: 4, pick: 116, player: "Keionte Scott", position: "CB", college: "Miami (FL)" },
      { round: 4, pick: 155, player: "DeMonte Capehart", position: "DT", college: "Clemson" },
      { round: 5, pick: 160, player: "Billy Schrauth", position: "G", college: "Notre Dame" },
      { round: 6, pick: 185, player: "Bauer Sharp", position: "LSB", college: "LSU" },
    ],
    positionalRatings: {
      quarterbacks: 16, offensiveLine: 4, receivers: 13, runningBacks: 22,
      front7: 14, secondary: 17, headCoach: 19, sourcePage: 573,
    },
    outlook: {
      strengths: [
        "Offensive line ranks #4 — one of Tampa's quiet structural advantages; the unit was among the best in pass protection last year.",
        "Receivers rank #13 with Baker Mayfield at QB (#16) — Sharp notes the Bucs have a functional offensive partnership that has quietly produced.",
        "Rueben Bain Jr. (Rd 1) and Anthony Hill Jr. (Rd 2) provide immediate front-7 infusion at positions of need.",
      ],
      concerns: [
        "Losing Mike Evans (to San Francisco) is the defining offseason loss — the WR corps drops significantly without its 10-year anchor.",
        "New offensive and defensive coordinators (Robinson + Edwards) must rebuild organizational knowledge while the roster is in transition.",
        "Sharp's analysis centers on the philosophical tension of a defensive coach (Bowles) trying to win in an offense-first league — the pattern has not produced championships.",
      ],
      jkbTakeaway: "Tampa's #4 offensive line gives them a structural advantage that many NFC teams lack. However, losing Evans and installing two new coordinators simultaneously creates legitimate execution risk. JKB model projects modest improvement; Sharp's data suggests 8.5 wins is the ceiling without a true WR1. The NFC South is now more competitive with the Panthers ascending and Saints improving.",
    },
  },

  // ─── Tennessee Titans ────────────────────────────────────────────────────
  {
    team: "Tennessee Titans", abbr: "ten",
    chapterStartPage: 586, positionalRatingsPage: 590,
    coaching: {
      headCoach: "Robert Saleh", headCoachPriorYears: 0, headCoachNew: true,
      offensiveCoordinator: "Brian Daboll", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Gus Bradley", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 586,
    },
    keyAdditions: [
      { player: "John Franklin-Myers", position: "EDGE", previousTeam: "den", contractNote: "$21M" },
      { player: "Alontae Taylor", position: "CB", previousTeam: "no", contractNote: "$19.3M" },
      { player: "Wan'Dale Robinson", position: "WR", previousTeam: "nyg", contractNote: "$17.5M" },
      { player: "Cordale Flott", position: "CB", contractNote: "$15M" },
      { player: "Mitchell Trubisky", position: "QB", contractNote: "$5.29M" },
      { player: "Austin Schlottmann", position: "C", contractNote: "$3.5M" },
      { player: "Cordell Volson", position: "LG", previousTeam: "cin", contractNote: "$3.20M" },
    ],
    keyDepartures: [
      { player: "L'Jarius Sneed", position: "CB" },
      { player: "Chigoziem Okonkwo", position: "TE", newTeam: "wsh" },
      { player: "Arden Key", position: "EDGE", newTeam: "ind" },
      { player: "Sebastian Joseph-Day", position: "IDL", newTeam: "pit" },
      { player: "T'Vondre Sweat", position: "IDL", newTeam: "nyj" },
      { player: "Corey Levin", position: "C" },
      { player: "Kair Elam", position: "CB", newTeam: "kc" },
    ],
    draftAdditions: [
      { round: 1, pick: 4, player: "Cam'Ron Tate", position: "WR", college: "Ohio State" },
      { round: 1, pick: 31, player: "Anthony Hill Jr.", position: "DE", college: "Auburn" },
      { round: 2, pick: 60, player: "Anthony Hill Jr.", position: "LB", college: "Texas" },
      { round: 5, pick: 142, player: "Fernando Carmona", position: "G", college: "Arkansas" },
      { round: 5, pick: 165, player: "Nicholas Singleton", position: "RB", college: "Penn State" },
      { round: 6, pick: 194, player: "Jackie Marshall", position: "DT", college: "Baylor" },
      { round: 7, pick: 225, player: "Jaren Kanak", position: "TE", college: "Oklahoma" },
    ],
    positionalRatings: {
      quarterbacks: 24, offensiveLine: 30, receivers: 27, runningBacks: 25,
      front7: 22, secondary: 27, headCoach: 25, sourcePage: 590,
    },
    outlook: {
      strengths: [
        "All-new coaching staff (Saleh + Daboll + Bradley) provides a genuine philosophical reset after years of organizational dysfunction.",
        "Cam'Ron Tate (Rd 1 pick 4) is an immediate-impact WR addition who gives Cam Ward a legitimate downfield target.",
        "John Franklin-Myers ($21M AAV) brings edge-rush production that the Titans chronically lacked.",
      ],
      concerns: [
        "Offensive line ranks #30, quarterback ranks #24, receivers rank #27 — three critical offensive positions ranked in the bottom quarter of the NFL.",
        "Entirely new coaching staff learning each other while managing a roster that ranked dead last in 2025 by multiple measures.",
        "Sharp writes that the Titans played the #1 toughest schedule in 2025 — the 2026 schedule won't be as brutal, but the roster isn't ready to compete regardless.",
      ],
      jkbTakeaway: "Tennessee is one of the hardest teams to project in 2026. The JKB model sees limited improvement; Sharp's ranking data explains why — bottom-half at every position group except (potentially) secondary. Saleh and Daboll are credible hires, but the materials are thin. Cam Ward's development as a sophomore QB under Daboll's system is the primary story. Under 6.5 wins is the safer position.",
    },
  },

  // ─── Washington Commanders ───────────────────────────────────────────────
  {
    team: "Washington Commanders", abbr: "wsh",
    chapterStartPage: 603, positionalRatingsPage: 607,
    coaching: {
      headCoach: "Dan Quinn", headCoachPriorYears: 2, headCoachNew: false,
      offensiveCoordinator: "David Blough", offensiveCoordinatorPriorYears: 0, offensiveCoordinatorNew: true,
      defensiveCoordinator: "Daronte Jones", defensiveCoordinatorPriorYears: 0, defensiveCoordinatorNew: true,
      sourcePage: 603,
    },
    keyAdditions: [
      { player: "Odafe Oweh", position: "EDGE", previousTeam: "lac", contractNote: "$24M" },
      { player: "K'Lavon Chaisson", position: "EDGE", previousTeam: "ne", contractNote: "$11M" },
      { player: "Chiqoziem Okonkwo", position: "TE", previousTeam: "ten" },
      { player: "Leo Chenal", position: "LB", previousTeam: "kc", contractNote: "$6.30M" },
      { player: "Amik Robertson", position: "CB", previousTeam: "det", contractNote: "$4.13M" },
      { player: "Charles Omenihu", position: "EDGE", contractNote: "$4M" },
      { player: "Dyami Brown", position: "WR", contractNote: "$1.8M" },
    ],
    keyDepartures: [
      { player: "Deebo Samuel", position: "WR" },
      { player: "Marshon Lattimore", position: "CB" },
      { player: "Bobby Wagner", position: "LB" },
      { player: "Jacob Martin", position: "EDGE", newTeam: "ten" },
      { player: "Zach Ertz", position: "TE" },
      { player: "Von Miller", position: "EDGE" },
      { player: "Chris Rodriguez Jr.", position: "RB", newTeam: "jax" },
      { player: "Noah Brown", position: "WR" },
    ],
    draftAdditions: [
      { round: 1, pick: 7, player: "Sonny Styles", position: "LB", college: "Ohio State" },
      { round: 3, pick: 71, player: "Antonio Williams", position: "WR", college: "Clemson" },
      { round: 5, pick: 147, player: "Joshua Josephs", position: "DE", college: "Tennessee" },
      { round: 5, pick: 187, player: "Kaytron Allen", position: "RB", college: "Penn State" },
      { round: 5, pick: 209, player: "Matt Gulbin", position: "C", college: "Michigan State" },
      { round: 6, pick: 223, player: "Athan Kaliakmanis", position: "QB", college: "Rutgers" },
    ],
    positionalRatings: {
      quarterbacks: 14, offensiveLine: 22, receivers: 31, runningBacks: 32,
      front7: 24, secondary: 31, headCoach: 22, sourcePage: 607,
    },
    outlook: {
      strengths: [
        "Quarterback ranks #14 — Jayden Daniels takes a second-year leap with an established offensive identity; Sharp views him as a legitimate franchise QB.",
        "Odafe Oweh ($24M AAV) and K'Lavon Chaisson add genuine pass-rush production to a front that previously lacked edge-rush depth.",
        "Dan Quinn (Year 3) provides organizational continuity in a division prone to coaching instability.",
      ],
      concerns: [
        "Receivers rank #31 and running backs rank #32 — Washington's skill-position group outside of the tight end is arguably the weakest in the NFC.",
        "Sharp writes 'what goes up must come down' — the Commanders went 12-5 in 2025 against the #1 easiest schedule; regression is near-certain.",
        "New offensive and defensive coordinators (Blough + Jones) must rebuild around Daniels while the receiving corps is rebuilt from scratch.",
      ],
      jkbTakeaway: "Washington's 2025 success was the NFL's biggest schedule-driven story, and Sharp is unambiguous that the correction is coming in 2026. Daniels is a legitimate #14 QB but his receivers rank #31 — he's being set up for statistical difficulty. JKB model projects regression to 7.5 wins. Under is the rational position, though Daniels' mobility and improvisation ability provide a floor that pure metrics undervalue.",
    },
  },
];

// ── Lookup utilities ─────────────────────────────────────────────────────────

export const WS_TEAM_MAP = new Map<string, WarrenSharpTeamProfile2026>(
  TEAMS.map((t) => [t.abbr, t])
);

export function getWarrenSharpProfile(abbr: string): WarrenSharpTeamProfile2026 | null {
  return WS_TEAM_MAP.get(abbr.toLowerCase()) ?? null;
}

/** Color tier for positional ranks: #1 = strongest */
export function getPositionalRankTone(rank: number): "green" | "light-green" | "amber" | "red" {
  if (rank <= 8) return "green";
  if (rank <= 16) return "light-green";
  if (rank <= 24) return "amber";
  return "red";
}

export const POSITIONAL_RATING_LABELS: Record<keyof Omit<WsPositionalRatings, "sourcePage">, string> = {
  quarterbacks: "Quarterbacks",
  offensiveLine: "Offensive Line",
  receivers: "Receivers",
  runningBacks: "Running Backs",
  front7: "Front 7",
  secondary: "Secondary",
  headCoach: "Head Coach",
};

export { TEAMS as WS_TEAMS_2026 };
export type { WarrenSharpTeamProfile2026, WsPositionalRatings, WsCoachingStaff };
