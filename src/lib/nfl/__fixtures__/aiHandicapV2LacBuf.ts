/**
 * Real, validated live LAC @ BUF (2026 wk 3) v2 handicap output, as published to the public artifact.
 * Development/test fixture only -- no production behavior depends on this matchup.
 */
import type { AiHandicapV2Card } from "@/lib/nfl/aiHandicapPresentation";

export const LAC_BUF_HOME = "buf";
export const LAC_BUF_AWAY = "lac";

export const CHATGPT_V2_LAC_BUF: AiHandicapV2Card = {
  "schemaVersion": "nfl-handicap-v2",
  "provider": "chatgpt",
  "displayName": "Chatty Ice",
  "generatedAt": "2026-09-25T19:55:39.928Z",
  "verdict": "LEAN",
  "preferredSide": "home",
  "preferredTeam": "buf",
  "preferredLine": -7,
  "marketSpread": {
    "sportsbook": "draftkings",
    "homeLine": -7,
    "awayLine": 7,
    "homePrice": -112,
    "awayPrice": -108,
    "asOf": "2026-09-25T15:03:10.659Z"
  },
  "marketTotal": 50.5,
  "coverProbabilityPreferred": 56,
  "coverProbabilityOther": 38,
  "impliedPushProbability": 6,
  "fairSpread": {
    "team": "buf",
    "line": -8.5
  },
  "fairScoreAway": 21,
  "fairScoreHome": 29,
  "projectedTotal": 50,
  "confidence": "MEDIUM",
  "uncertainty": "HIGH",
  "keyNumberSensitivity": "Bills -7 is materially better than -7.5 because exactly seven becomes a push rather than a loss. I would be noticeably less interested at -7.5, while -6.5 would improve the Bills case because it captures a full win on a seven-point margin.",
  "analysisMarkdown": "I prefer Bills -7, but this is a lean rather than an automatic play. My locked number is Buffalo -8.5, so the market is giving me some cushion at the exact line, but the early-season uncertainty is too high for a strong position. The key distinction is that I like Buffalo to win by more than a touchdown more often than not, not that I expect a routine blowout every time.\n\nThe displayed number is Bills -7 at -112, with Chargers +7 at -108. Across the market, four books are at -7.5 and five are at -7. That split matters because seven is a major landing spot: at -7, a Bills win by exactly seven pushes, while at -7.5 it loses. The total is 50.5, with the under carrying the slightly heavier price, and that is close to my projected scoring level rather than a reason to force a side-total combination.\n\nBuffalo's offense has been the clearest separator through two games: it is averaging 38.5 points and has produced a very strong 0.3784 offensive EPA per play. I regress that aggressively because the sample is only two games, but it still supports a substantial home offensive edge. The Chargers have scored only 14 points per game, posted negative offensive EPA per play in both games, and committed five turnovers. Those are correlated signals, but together they describe a team struggling to sustain drives against a Buffalo offense capable of creating explosive plays.\n\nThe defensive case is less clean. Buffalo has allowed 31 points per game, while the Chargers have allowed 26, so this is not a matchup where I expect Buffalo to smother Los Angeles. The Chargers also have several offensive-line absences, and Trey Lance is questionable; those issues modestly strengthen Buffalo's edge but add volatility. Buffalo has its own questionable players, including skill-position uncertainty, so I am not treating the injury report as a one-way adjustment.\n\nMy strongest hesitation is the turnover matchup. If Los Angeles' five giveaways through two games regress sharply and the Chargers' offense returns toward its 2025 scoring baseline, Buffalo's vulnerable pass defense could let LAC reach the twenties and turn this into a one-score game. That is the clearest route to Chargers +7 covering.\n\n**Bills -7: ~56% cover probability**\n**Chargers +7: ~38%**\n**Fair-ish score: Chargers 21, Bills 29**\n**Projected total: ~50**\n\nSo at the exact line I would choose Bills -7, but only as a lean. If it moved to Bills -7.5, I would be noticeably less interested because the push protection on the key number disappears; Bills -6.5 would make it a stronger play.",
  "keyDrivers": [
    {
      "summary": "BUF has produced 38.5 points per game with a strong 0.3784 offensive EPA per play, 17 explosive pass plays and seven explosive runs through two games. That is above last year's 28.3-point baseline, so I regress the attack but still project a clear offensive edge at home."
    },
    {
      "summary": "LAC has scored only 14 points per game and posted negative offensive EPA per play in both its two-game sample and its most recent game, while committing five turnovers. Even allowing for early-season noise and regression toward its 2025 scoring level, that profile limits the Chargers' expected scoring against BUF."
    },
    {
      "summary": "The current defensive data is less one-sided than the records suggest: BUF has allowed 31 points per game and 0.1661 EPA per defensive play, while LAC has allowed 26 points per game. That keeps the total near 50 rather than pushing it toward a low-scoring projection, but BUF's stronger offense still drives the margin."
    },
    {
      "summary": "LAC has several offensive-line absences and Trey Lance is questionable, while BUF has multiple questionable skill and defensive players. Those availability issues modestly support BUF's home edge but add uncertainty to both the offensive ceiling and the final scoring level."
    }
  ],
  "mainRisk": "The projection is wrong if LAC's five turnovers through two games regress sharply and its offense returns toward its 2025 level, allowing the Chargers to sustain drives against a BUF defense that has allowed 31 points per game.",
  "sources": [
    {
      "label": "Los Angeles Chargers",
      "url": "https://www.chargers.com/news/bills-injury-report-week-3-ladd-mcconkey-fantasy",
      "type": "injury"
    },
    {
      "label": "NFL.com",
      "url": "https://amp.nfl.com/news/nfl-week-3-injury-report-player-statuses-for-all-16-games",
      "type": "injury"
    },
    {
      "label": "draftkings spread and total (JKB betting lines, as of 2026-09-25T15:03:10.659Z)",
      "url": null,
      "type": "market"
    },
    {
      "label": "Team game data: nflverse play-by-play and official team stats (JKB)",
      "url": null,
      "type": "other"
    }
  ]
};

export const GROK_V2_LAC_BUF: AiHandicapV2Card = {
  "schemaVersion": "nfl-handicap-v2",
  "provider": "grok",
  "displayName": "Grokowski",
  "generatedAt": "2026-09-25T21:05:02.709Z",
  "verdict": "LEAN",
  "preferredSide": "home",
  "preferredTeam": "buf",
  "preferredLine": -7,
  "marketSpread": {
    "sportsbook": "draftkings",
    "homeLine": -7,
    "awayLine": 7,
    "homePrice": -112,
    "awayPrice": -108,
    "asOf": "2026-09-25T15:03:10.659Z"
  },
  "marketTotal": 50.5,
  "coverProbabilityPreferred": 55,
  "coverProbabilityOther": 39,
  "impliedPushProbability": 6,
  "fairSpread": {
    "team": "buf",
    "line": -9.5
  },
  "fairScoreAway": 19,
  "fairScoreHome": 29,
  "projectedTotal": 47.5,
  "confidence": "MEDIUM",
  "uncertainty": "HIGH",
  "keyNumberSensitivity": "Bills -7 is a meaningfully better number than -7.5 because a seven-point Buffalo win pushes here and loses at the half-point. I would back off at -7.5 and get more interested at -6.5.",
  "analysisMarkdown": "I'm on Bills -7 here, but it's a lean, not something I'd press. I have Buffalo a couple points better than this number, so laying seven at -112 is the right side. Two weeks of tape and a lot of regression risk keep me from treating it as an automatic play.\n\nYou're looking at Bills -7 on DraftKings, with the Chargers getting seven on the other side. The street is split right on the key, with some shops already at -7.5, and the total is 50.5, which is higher than I want. Seven being a key number actually matters: a Bills win by exactly seven pushes here and loses if you're laying the extra half, so this is a cleaner favorite number than the shops hanging 7.5.\n\nBuffalo's offense has been the mismatch through two games: explosive, efficient through the air, and scoring in bunches. Los Angeles has scored 14 a game, lived in negative EPA, and is sitting on a minus-four turnover margin with a broken run game. Their pass defense has already been leaky, which is why the home side should be a two-score favorite. Last year these were both strong clubs, though, and Buffalo has been giving up points too, so I'm not rewriting identities off an unadjusted pair of weeks. Home and the extra rest still lean Buffalo.\n\nLos Angeles is also dinged up front. Kayode Awosika is out, Trevor Penning starts at left guard, Trey Pipkins is out, and Charlie Kolar sits after forearm surgery. Ladd McConkey and Rashawn Slater are expected to play, which is why I haven't buried the Chargers' scoring completely, but that interior and the missing tight end still cap them.\n\nWhat keeps me from calling it a bet is the sample. If Los Angeles with McConkey and Slater looks more like last year's offense than these first two weeks, and Buffalo's early scoring pace and leaky pass defense both come back, this lands as a one-score Bills win that doesn't cash -7.\n\n**Bills -7: ~55% cover probability**\n**Chargers +7: ~39%**\n**Fair-ish score: Chargers 19, Bills 29**\n**Projected total: ~47.5**\n\nSo at the exact line I would take Bills -7 as a lean. Minus-112 needs a little over 52 percent to break even, and I have it there with plenty of variance, so I'm not pressing. If it moved to -7.5 I'd back off because you lose the push on a seven-point game. At -6.5 I'd be more interested.",
  "keyDrivers": [
    {
      "summary": "Buffalo has been a highly efficient, explosive offense through two games while Los Angeles has allowed efficient passing. That mismatch is the main reason the home side is a two-score favorite and why the total is not a defensive number."
    },
    {
      "summary": "Los Angeles has been a negative-EPA offense with a broken run game and a minus-four turnover margin, and they are without a starting guard (Penning starting in his place), a tackle, and tight end Kolar after forearm surgery. That holds their scoring outlook well below last season even with McConkey and Slater expected to play."
    },
    {
      "summary": "Last season Buffalo was the better offense but Los Angeles had the better defense and both were strong 11-win teams, so two unadjusted games should not be treated as a new identity. The gap is real and widened by home and a rest edge, but it is not a blowout prior."
    },
    {
      "summary": "Both defenses have allowed positive EPA so far, and Buffalo has already given up 31 points per game, so the total stays in the high 40s even with the Chargers' slow start. Buffalo has also been turnover-free while Los Angeles has been sloppy, which still leans the margin to the home side."
    }
  ],
  "mainRisk": "The two-game samples overstate the gap: if Los Angeles' offense with McConkey and Slater available plays closer to 2025 than to weeks 1-2, and Buffalo's 38-point pace and leaky pass defense both regress, this lands as a one-score Bills win rather than a two-score game.",
  "sources": [
    {
      "label": "Los Angeles Chargers",
      "url": "https://www.chargers.com/news/bills-injury-report-week-3-ladd-mcconkey-fantasy",
      "type": "injury"
    },
    {
      "label": "CBS Sports",
      "url": "https://www.cbssports.com/nfl/news/nfl-injury-report-for-week-3/",
      "type": "news"
    },
    {
      "label": "Bolts From The Blue",
      "url": "https://www.boltsfromtheblue.com/los-angeles-chargers-injuries/65733/chargers-bills-injury-report-brenen-thompson-kayode-awosika-out-for-week-3",
      "type": "injury"
    },
    {
      "label": "draftkings spread and total (JKB betting lines, as of 2026-09-25T15:03:10.659Z)",
      "url": null,
      "type": "market"
    },
    {
      "label": "Team game data: nflverse play-by-play and official team stats (JKB)",
      "url": null,
      "type": "other"
    }
  ]
};
