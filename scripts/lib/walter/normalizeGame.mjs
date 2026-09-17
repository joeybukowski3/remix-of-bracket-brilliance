import { resolveTeamAbbr } from "./teamAbbreviations.mjs";

/**
 * Turns one raw parsed game panel (from parseGamePage.mjs) into the stable,
 * typed WalterGameCapture artifact the UI and diff step consume. Never
 * throws -- a malformed/incomplete panel still produces a capture, just with
 * parseStatus "partial" and populated parseWarnings, so one bad game never
 * blocks the rest of a week's capture.
 *
 * Heuristic extraction (injuries, uncommon angles) intentionally stays
 * conservative: it only pulls sentences that already exist verbatim in
 * Walt's free analysis, tagged with which team section they came from. It
 * never invents a player, status, or angle that isn't textually present.
 */

const INJURY_KEYWORDS = [
  "injur",
  "questionable",
  "doubtful",
  "out for",
  "ruled out",
  "IR",
  "injured reserve",
  "hurt",
  "ailing",
  "banged up",
  "limited in practice",
  "did not practice",
  "sidelined",
  "missed practice",
  "healthy now",
  "recovering from",
];

const UNCOMMON_ANGLE_KEYWORDS = [
  "revenge",
  "coordinator",
  "coaching",
  "head coach",
  "travel",
  "rest",
  "short week",
  "bye week",
  "weather",
  "wind",
  "rain",
  "snow",
  "dome",
  "public",
  "sharp",
  "money on",
  "line moved",
  "line movement",
  "motivation",
  "trap game",
  "letdown",
  "lookahead",
  "roster move",
  "trade",
  "suspension",
  "suspended",
];

function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function labelTeamSide(label, awayName, homeName) {
  const upper = label.toUpperCase();
  const awayWords = (awayName ?? "").toUpperCase().split(/\s+/).filter((w) => w.length > 2);
  const homeWords = (homeName ?? "").toUpperCase().split(/\s+/).filter((w) => w.length > 2);
  if (awayWords.some((w) => upper.includes(w))) return "away";
  if (homeWords.some((w) => upper.includes(w))) return "home";
  return null;
}

function extractInjuries(labeledBlocks, awayName, homeName) {
  const injuries = [];
  for (const block of labeledBlocks) {
    const side = labelTeamSide(block.label, awayName, homeName);
    if (!side) continue;
    for (const sentence of splitSentences(block.text)) {
      const lower = sentence.toLowerCase();
      if (INJURY_KEYWORDS.some((kw) => lower.includes(kw))) {
        injuries.push({ team: side, sourceLabel: block.label, sentence });
      }
    }
  }
  return injuries;
}

function extractUncommonAngles(labeledBlocks, motivationText, recapText) {
  const angles = [];
  const seen = new Set();
  const candidateBlocks = [...labeledBlocks.map((b) => b.text), motivationText, recapText].filter(Boolean);
  for (const text of candidateBlocks) {
    for (const sentence of splitSentences(text)) {
      const lower = sentence.toLowerCase();
      if (UNCOMMON_ANGLE_KEYWORDS.some((kw) => lower.includes(kw)) && !seen.has(sentence)) {
        seen.add(sentence);
        angles.push(sentence);
      }
    }
  }
  return angles;
}

function findLabel(labeledBlocks, matcher) {
  return labeledBlocks.find((b) => matcher.test(b.label));
}

function parsePickBlockText(rawText) {
  if (!rawText) {
    return { scorePrediction: null, spreadPick: null, spreadUnits: null, totalPick: null, totalUnits: null, sameGameParlay: null };
  }

  const scoreMatch = rawText.match(/Week \d+ NFL Pick:\s*([^A-Za-z]*[A-Za-z].*?\d+,\s*[A-Za-z].*?\d+)/);
  const spreadMatch = rawText.match(/([A-Za-z .'-]+ [+-]\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?) Units?\)/);
  const totalMatch = rawText.match(/((?:Over|Under) \d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?) Units?\)/);
  const parlayMatch = rawText.match(/Same-Game Parlay:\s*(.+?)(?:\s*-\s*[A-Za-z]+)?$/);

  return {
    scorePrediction: scoreMatch ? scoreMatch[1].trim() : null,
    spreadPick: spreadMatch ? spreadMatch[1].trim() : null,
    spreadUnits: spreadMatch ? Number(spreadMatch[2]) : null,
    totalPick: totalMatch ? totalMatch[1].trim() : null,
    totalUnits: totalMatch ? Number(totalMatch[2]) : null,
    sameGameParlay: parlayMatch ? parlayMatch[1].trim() : null,
  };
}

function buildSourceBreakdown(rawGame) {
  const entries = [];
  let order = 0;

  const push = (topic, concerns, paraphrase) => {
    if (!paraphrase) return;
    entries.push({
      order: order++,
      topic,
      concerns,
      paraphrase,
      excerpt: paraphrase.length > 220 ? `${paraphrase.slice(0, 217)}...` : paraphrase,
    });
  };

  const matchup = rawGame.sections.matchup;
  if (matchup) {
    matchup.leadingParagraphs.forEach((p) => push("Matchup intro", "matchup", p));
    matchup.labeledBlocks.forEach((b) => {
      const side = labelTeamSide(b.label, rawGame.awayName, rawGame.homeName);
      push(b.label, side ?? "matchup", b.text);
    });
  }
  if (rawGame.sections.motivation?.text) push("Motivation", "matchup", rawGame.sections.motivation.text);
  if (rawGame.sections.spread) {
    const spreadText = Object.entries(rawGame.sections.spread.lines)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" ");
    push("Spread math", "matchup", spreadText);
  }
  if (rawGame.sections.vegas?.paragraphs?.length) {
    push("Vegas action", "matchup", rawGame.sections.vegas.paragraphs.join(" "));
  }
  if (rawGame.sections.trends) {
    const trendsText = [...rawGame.sections.trends.items, ...Object.entries(rawGame.sections.trends.lines).map(([k, v]) => `${k}: ${v}`)].join(" ");
    push("Trends", "matchup", trendsText);
  }
  if (rawGame.pick?.rawText) push("Official pick", "matchup", rawGame.pick.rawText);

  return entries;
}

/**
 * @param {ReturnType<typeof import('./parseGamePage.mjs').parseWalterWindowPage>['games'][number]} rawGame
 * @param {{ season: number, week: number, captureType: 'wednesday'|'thursday'|'saturday'|'sunday', capturedAt: string, sourceUrl: string, window: string }} context
 */
export function normalizeGame(rawGame, context) {
  const warnings = [...(rawGame.parseWarnings ?? [])];

  const awayAbbr = resolveTeamAbbr(rawGame.awayName);
  const homeAbbr = resolveTeamAbbr(rawGame.homeName);
  if (!awayAbbr) warnings.push(`could not resolve away team abbreviation for "${rawGame.awayName}"`);
  if (!homeAbbr) warnings.push(`could not resolve home team abbreviation for "${rawGame.homeName}"`);

  const gameId = awayAbbr && homeAbbr ? `${context.season}_${String(context.week).padStart(2, "0")}_${awayAbbr}_${homeAbbr}` : null;

  const matchup = rawGame.sections.matchup ?? { edge: null, leadingParagraphs: [], labeledBlocks: [] };
  const recapBlock = findLabel(matchup.labeledBlocks, /^RECAP$/i);
  const motivationText = rawGame.sections.motivation?.text ?? null;

  const thesis = recapBlock?.text ?? matchup.leadingParagraphs[0] ?? matchup.labeledBlocks[0]?.text ?? null;

  const injuries = extractInjuries(matchup.labeledBlocks, rawGame.awayName, rawGame.homeName);
  const uncommonAngles = extractUncommonAngles(matchup.labeledBlocks, motivationText, recapBlock?.text ?? null);

  const pickFields = parsePickBlockText(rawGame.pick?.rawText ?? null);

  const openingLine = rawGame.sections.trends?.lines?.["Opening Line"] ?? null;
  const currentLineText = rawGame.headerLine ?? null;
  const lineMovement =
    openingLine && currentLineText && !currentLineText.includes(openingLine.replace(/\.$/, ""))
      ? `Opened ${openingLine} -> now ${currentLineText}`
      : null;

  if (!rawGame.pick) warnings.push("no official pick block found");
  if (!matchup.labeledBlocks.length && !matchup.leadingParagraphs.length) warnings.push("matchup section had no extractable prose");

  const parseStatus = !gameId || !rawGame.pick ? "partial" : "ok";

  return {
    schemaVersion: "walter-v0.1",
    season: context.season,
    week: context.week,
    captureType: context.captureType,
    capturedAt: context.capturedAt,
    game: {
      gameId,
      away: { name: rawGame.awayName, abbr: awayAbbr },
      home: { name: rawGame.homeName, abbr: homeAbbr },
      kickoffEt: rawGame.kickoffText || null,
      window: context.window,
    },
    source: {
      url: context.sourceUrl,
      fetchedAt: context.capturedAt,
      detectedUpdateLabel: null,
    },
    snapshot: {
      thesis,
      teamAdvantage: {
        away: matchup.edge && matchup.edge === rawGame.awayName?.split(" ").pop() ? matchup.edge : null,
        home: matchup.edge && matchup.edge === rawGame.homeName?.split(" ").pop() ? matchup.edge : null,
      },
      keyMatchup: matchup.edge ? `Edge: ${matchup.edge}` : null,
    },
    teamBreakdowns: {
      away: matchup.labeledBlocks.filter((b) => labelTeamSide(b.label, rawGame.awayName, rawGame.homeName) === "away").map((b) => b.text),
      home: matchup.labeledBlocks.filter((b) => labelTeamSide(b.label, rawGame.awayName, rawGame.homeName) === "home").map((b) => b.text),
    },
    injuries,
    uncommonAngles,
    betting: {
      pick: {
        team: pickFields.spreadPick,
        spread: pickFields.spreadPick,
        units: pickFields.spreadUnits,
      },
      total: pickFields.totalPick,
      lineMovement,
      vegasAction: rawGame.sections.vegas?.paragraphs?.join(" ") ?? null,
    },
    sourceBreakdown: buildSourceBreakdown(rawGame),
    parseStatus,
    parseWarnings: warnings,
  };
}
