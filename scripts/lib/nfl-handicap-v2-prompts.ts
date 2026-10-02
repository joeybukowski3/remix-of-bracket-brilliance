/**
 * AI Picks v2 WU3 -- the Stage A and Stage B prompts for the handicap-oriented
 * v2 output. ONE implementation shared by Grok and ChatGPT: the only
 * provider-specific input is the `model` name printed in the JSON example, so
 * the two providers cannot drift into different contracts.
 *
 * Design rules encoded here:
 *  - Stage A stays completely market blind (its data block is the WU2 blind
 *    packet; no sportsbook figure or JKB opinion can be printed) and produces a
 *    small handicap, not a scouting report: a fair spread, a total, 3-5 drivers
 *    that actually move the game, one real risk, and an uncertainty level.
 *  - Stage B receives everything it needs to write the answer -- the locked
 *    projection INCLUDING its drivers and risk, the same football data, the
 *    validated evidence, and the exact current market with key-number
 *    metadata -- so it never has to write from a one-line thesis.
 *  - Neither prompt tells the model what to conclude. PASS is explicitly valid;
 *    the verdict, preferred side and cover probabilities are the model's own.
 */
import { buildBlindContextSummaryLines } from "./nfl-ai-blind-context-lines";
import { sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import type { EvidenceModel } from "./nfl-evidence-types";
import type { EvidenceAliasMap } from "./nfl-handicap-v2-evidence-aliases";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import type { HandicapV2MarketContext } from "./nfl-handicap-v2-market";
import { SITE_INJURY_RULE, siteAvailabilityLines, type SitePromptContext } from "./nfl-handicap-v2-site-context";
import { formatSignedLine, renderHandicapV2MarketLines, teamNickname } from "./nfl-handicap-v2-market";
import { WORD_TARGET_MAX, WORD_TARGET_MIN } from "./nfl-handicap-v2-text";
import { CONFIDENCE_LEVELS, HANDICAP_V2_SCHEMA_VERSION, KEY_DRIVERS_MAX, KEY_DRIVERS_MIN, UNCERTAINTY_LEVELS, VERDICTS, type StageAV2 } from "./nfl-handicap-v2-types";

export interface HandicapV2GameFacts {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamFull: string;
  awayTeamFull: string;
  kickoffUtc: string;
}

function teamCodeLines(game: HandicapV2GameFacts): string[] {
  return [
    "=== VALID TEAM CODES FOR THIS GAME ===",
    `- ${game.awayTeam.toUpperCase()} (away, ${teamNickname(game.awayTeamFull)})`,
    `- ${game.homeTeam.toUpperCase()} (home, ${teamNickname(game.homeTeamFull)})`,
    "Use one of these two abbreviations wherever a team is requested. Do not use a full name, a city, or another code.",
  ];
}

/** Splits a rendered evidence line (`[<evidenceId>] (category=...) claim`) into its canonical id and the rest, or null if it is not shaped like one. */
function splitEvidenceLine(line: string): { id: string; rest: string } | null {
  const match = /^\[([^\]\s]+)\]\s*([\s\S]*)$/.exec(line);
  return match ? { id: match[1], rest: match[2] } : null;
}

/**
 * The evidence block, in terms of the short aliases (E1, E2, ...) and never a canonical id: the model is
 * asked to cite `E3`, not to reproduce a 16-hex hash, which production showed it cannot do reliably. Each
 * record line begins `E<n> | `. Aliases come from the caller's map (nfl-handicap-v2-evidence-aliases.ts),
 * so an alias means the same record in Stage A and Stage B. Throws -- before anything is paid for -- if a
 * line is not an evidence line or its record has no alias: a record the model can see but is not allowed
 * to cite is a guaranteed failed call.
 */
function evidenceSection(header: string, evidenceLines: readonly string[], aliases: EvidenceAliasMap, site?: SitePromptContext): string[] {
  if (evidenceLines.length === 0) {
    return [header, site ? SITE_ONLY_NO_EVIDENCE_LINE : "(no citable evidence available -- make no claim about injuries, participation, quarterback status, personnel changes, weather or outside reporting; every evidenceRefs / evidenceRefsUsed array must be empty)"];
  }
  const rows = evidenceLines.map((line) => {
    const parts = splitEvidenceLine(line);
    if (!parts) throw new Error("evidence line does not begin with its bracketed evidenceId -- cannot alias it");
    const alias = aliases.idToAlias.get(parts.id);
    if (!alias) throw new Error(`evidence record ${parts.id} has no alias -- it is not in the alias map for this call`);
    return { alias, order: Number(alias.slice(1)), text: `${alias} | ${parts.rest}` };
  });
  rows.sort((x, y) => x.order - y.order);
  return [
    header,
    `Cite evidence ONLY by its short reference (${rows.map((r) => r.alias).join(", ")}) exactly as printed at the start of a line below. That is the complete list of references; anything else is rejected.`,
    ...rows.map((r) => r.text),
  ];
}

/** Shared by both stages: what external evidence is and is not. */
const EVIDENCE_RULES: readonly string[] = [
  "External evidence (injuries, participation, quarterback status, meaningful personnel changes, weather, credible team/NFL reporting) is FACT INPUT. Weigh each record by its stated verification, freshness, citation and authority; treat superseded or conflicting records with caution.",
  "There is no internal injury or availability data in the football data above: every injury, availability, weather or reporting claim you make must come from a cited evidence record. Never use anyone's picks, predictions or betting opinions.",
];

/**
 * Site-only mode (research mode "site-only"): the model is run on JKB/local data alone. No evidence record exists, so
 * the evidence arrays are empty by construction and the only availability information is the local availability line.
 */
const SITE_ONLY_NO_EVIDENCE_LINE = "(no external evidence is supplied in this run: the football data and the availability line above are everything you have; every evidenceRefs / evidenceRefsUsed array must be empty, []. Use factRefs for the deterministic football data.)";

const SITE_ONLY_EVIDENCE_RULES: readonly string[] = [
  "This run uses JKB site data only. No outside reporting, news, weather information or evidence records are supplied: make no claim about weather, coaching or personnel news, or anything that is not in the football data and the availability line above. Never use anyone's picks, predictions or betting opinions.",
  `Availability comes only from the availability line in the football data. ${SITE_INJURY_RULE}`,
];

/** The football-data lines for a prompt. In site-only mode the weather line (which tells the model weather must be researched) is replaced by the availability block. */
function dataLines(blind: ReturnType<typeof sanitizeGameContextPacketForBlindStageA>, game: HandicapV2GameFacts, site?: SitePromptContext): string[] {
  const lines = buildBlindContextSummaryLines(blind);
  if (!site) return lines;
  const at = lines.findIndex((l) => l.startsWith("weather:"));
  const block = siteAvailabilityLines(site.availability, { home: game.homeTeam, away: game.awayTeam });
  return at === -1 ? [...lines, ...block] : [...lines.slice(0, at), ...block, ...lines.slice(at + 1)];
}

/** Shared by both stages: how evidence references may be used. Validation is strict and never repairs a bad reference, so these are the only guard against a near-miss. */
export const EVIDENCE_REF_RULES: readonly string[] = [
  "Evidence references: put in evidenceRefs / evidenceRefsUsed only the short references (E1, E2, ...) printed in the evidence list, exactly as printed. Never invent, combine, renumber or extend a reference, and never write anything else in those arrays. A reference that is not printed in the list is rejected and discards the whole answer. References (E1, E2, ...) belong ONLY in those arrays: never write one in a summary, mainRisk, counterargument or analysisMarkdown.",
  "Cite only the smallest set of evidence records the statement actually needs. If no supplied record directly supports a statement -- for example a driver that rests only on the football data -- leave evidenceRefs / evidenceRefsUsed empty ([]) rather than guessing: a driver tied to football-data factRefs alone is complete.",
];

const NO_INVENTION_RULES: readonly string[] = [
  "Use ONLY the football data and evidence supplied here for any statistic or external fact. Never estimate, round-trip, or restate a number you were not given, and never invent injuries, quotes, trends or player status.",
  "Write in plain football English. Never expose a field name, JSON key, dot-path, `FACT:`/`INTERPRETATION:` label or any pipeline/data language inside prose fields.",
  "Do not paste evidence IDs, fact IDs, JSON paths, schema field names, or internal identifiers (for example a dot-path like teamForm.home.seasonToDate.points) into the prose. Put evidence IDs only in the evidence-reference arrays (evidenceRefs / evidenceRefsUsed) and fact paths only in the fact-reference arrays (factRefs / factRefsUsed). In prose, refer to a source in plain words (\"the Chargers' injury report\").",
];

/* -------------------------------------------------------------------------- */
/* Stage A                                                                    */
/* -------------------------------------------------------------------------- */

export interface StageAV2PromptInput {
  provider: EvidenceModel;
  game: HandicapV2GameFacts;
  packet: NflGameContextPacket;
  evidenceLines: readonly string[];
  /** Short model-facing references for this run's evidence (buildEvidenceAliasMap); the SAME map must be used for Stage A and Stage B. */
  evidenceAliases: EvidenceAliasMap;
  /** Present = site-only mode: local availability block, no weather line, no-external-evidence rules. Absent = live-research prompts, unchanged. */
  site?: SitePromptContext;
}

export function buildStageAV2Prompt(input: StageAV2PromptInput): string {
  const { provider, game } = input;
  const blind = sanitizeGameContextPacketForBlindStageA(input.packet);
  const example = {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    model: provider,
    gameId: game.gameId,
    contextHash: "<leave as empty string -- the engine fills this in>",
    fairSpread: { team: "<the favored team's abbreviation>", line: "<number <= 0, in half-point steps>" },
    projectedTotal: "<number>",
    keyDrivers: [{ summary: "<1-2 plain sentences: the fact AND why it moves your projection>", factRefs: ["<dot-path into the football data>"], evidenceRefs: ["<a short reference such as E1 from the evidence list, or leave the array empty>"] }],
    mainRisk: "<the single most realistic way your projection is wrong, specific to this game>",
    uncertainty: UNCERTAINTY_LEVELS.join("|"),
  };
  return [
    `You are an experienced NFL handicapper. Game: ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}, kickoff ${game.kickoffUtc}).`,
    "",
    "This is STAGE 1 of a two-stage handicap: a MARKET-BLIND football projection. You are deliberately NOT shown any sportsbook spread, total, moneyline or market opinion, and you are NOT given anyone's rating, projection or pick. Form your own view from the football data and cited evidence below. A separate second stage will later show you the market and ask for a betting decision; you will not see it here.",
    "",
    "YOUR JOB: decide what you think the fair point spread and game total are, and the few things that drive that view. Nothing else.",
    "",
    "=== FOOTBALL DATA (deterministic facts; no market pricing and no model opinion of any kind) ===",
    ...dataLines(blind, game, input.site),
    "",
    ...evidenceSection("=== CITABLE EVIDENCE (cite by the short reference at the start of each line) ===", input.evidenceLines, input.evidenceAliases, input.site),
    "",
    "=== HOW TO HANDICAP ===",
    `- Choose ${KEY_DRIVERS_MIN} to ${KEY_DRIVERS_MAX} keyDrivers: only the things that actually move the projected margin or total. Do NOT cover every unit or category and do not pad; leave out anything that does not matter.`,
    "- Each driver is one or two sentences saying what the fact is AND why it moves your projection. Tie it to the data with factRefs and/or to evidence with evidenceRefs. factRefs are dot-paths into the football data above, for example \"teamForm.away.recentGame.facts.efficiency.offense.epaPerPlay\", \"teamForm.home.seasonToDate.points\" or \"teamMetrics.epa\".",
    "- Current-season samples may still be small. Weigh recent evidence against broader prior information appropriately and account for sample uncertainty; prior-season data is background, not automatically dominant.",
    "- mainRisk is the single most realistic reason your projection turns out wrong. It must be specific to this game (name the team, player, unit or number). Generic lines such as \"anything can happen\" are rejected.",
    "- uncertainty (LOW, MEDIUM or HIGH) is how confident you are in the projected margin given sample size and information quality.",
    ...(input.site ? SITE_ONLY_EVIDENCE_RULES : EVIDENCE_RULES).map((rule) => `- ${rule}`),
    ...EVIDENCE_REF_RULES.map((rule) => `- ${rule}`),
    ...NO_INVENTION_RULES.map((rule) => `- ${rule}`),
    "",
    ...teamCodeLines(game),
    "Sign convention for fairSpread: `line` is <= 0 for the favored team (for example { team: \"BUF\", line: -7.5 } means you make Buffalo a 7.5-point favorite).",
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence) matching this shape:",
    JSON.stringify(example, null, 2),
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Stage B                                                                    */
/* -------------------------------------------------------------------------- */

export interface StageBV2PromptInput {
  provider: EvidenceModel;
  game: HandicapV2GameFacts;
  packet: NflGameContextPacket;
  lockedStageA: StageAV2;
  market: HandicapV2MarketContext;
  evidenceLines: readonly string[];
  /** The same alias map Stage A used for this run. The locked Stage A's canonical evidence ids are shown through it. */
  evidenceAliases: EvidenceAliasMap;
  /** Present = site-only mode (see StageAV2PromptInput.site). */
  site?: SitePromptContext;
}

/** "~50" for a whole number, "~50.5" for a half. */
export function formatProjectedTotal(total: number): string {
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}

export function fairScoreLine(game: HandicapV2GameFacts, stageA: StageAV2): string {
  return `Fair-ish score: ${teamNickname(game.awayTeamFull)} ${stageA.fairScore.away}, ${teamNickname(game.homeTeamFull)} ${stageA.fairScore.home}`;
}

export function projectedTotalLine(stageA: StageAV2): string {
  return `Projected total: ~${formatProjectedTotal(stageA.projectedTotal)}`;
}

function lockedStageALines(game: HandicapV2GameFacts, stageA: StageAV2, aliases: EvidenceAliasMap): string[] {
  const favorite = stageA.fairSpread.team.toUpperCase();
  return [
    `fair spread: ${favorite} ${formatSignedLine(stageA.fairSpread.line)}`,
    `projected total: ${formatProjectedTotal(stageA.projectedTotal)}`,
    `${fairScoreLine(game, stageA).replace("Fair-ish score", "fair-ish score")} (derived from your two numbers)`,
    `uncertainty: ${stageA.uncertainty}`,
    "key drivers:",
    ...stageA.keyDrivers.map((d, i) => {
      // The stored Stage A carries canonical ids; Stage B sees them only as this call's aliases (a ref with no alias is simply not shown).
      const refs = [...d.factRefs, ...d.evidenceRefs.flatMap((id) => aliases.idToAlias.get(id) ?? [])];
      return `  ${i + 1}. ${d.summary}${refs.length > 0 ? ` [refs: ${refs.join(", ")}]` : ""}`;
    }),
    `main risk: ${stageA.mainRisk}`,
  ];
}

export function buildStageBV2Prompt(input: StageBV2PromptInput): string {
  const { provider, game, market, lockedStageA } = input;
  const blind = sanitizeGameContextPacketForBlindStageA(input.packet);
  const preferredLabelExample = `${market.sideLabels.home} or ${market.sideLabels.away}`;
  const example = {
    schemaVersion: HANDICAP_V2_SCHEMA_VERSION,
    model: provider,
    gameId: game.gameId,
    contextHash: "<leave as empty string -- the engine fills this in>",
    verdict: VERDICTS.join("|"),
    preferredTeam: `<${game.awayTeam.toUpperCase()} or ${game.homeTeam.toUpperCase()}>`,
    coverProbabilityPreferred: "<a JSON NUMBER from 0 to 100 with no percent sign and no quotes, e.g. 59 -- your estimate that the preferred side covers the exact displayed line>",
    coverProbabilityOther: "<a JSON NUMBER from 0 to 100 with no percent sign and no quotes, e.g. 36 -- the other side>",
    confidence: CONFIDENCE_LEVELS.join("|"),
    keyNumberSensitivity: "<1-3 sentences on where the number gets meaningfully better or worse, or null if key numbers are not material>",
    counterargument: "<1-2 sentences: the strongest realistic reason the preferred side fails to cover at this exact line>",
    analysisMarkdown: "<the 250-450 word write-up described below, as one string with \\n\\n between paragraphs>",
    factRefsUsed: ["<dot-path into the football data>"],
    evidenceRefsUsed: ["<a short reference such as E1 from the evidence list that the write-up actually relies on, or leave the array empty>"],
  };
  return [
    `You are an experienced NFL bettor. Someone asks you: "What do you think about this game and spread?" Game: ${game.awayTeamFull} at ${game.homeTeamFull} (gameId ${game.gameId}, kickoff ${game.kickoffUtc}).`,
    "",
    "STAGE 1 already produced your LOCKED football projection below, formed before you saw any market number. You may not revise it. Your job now is to compare it to the exact current line, decide what you think of the number, and explain it.",
    "",
    "=== YOUR LOCKED FOOTBALL PROJECTION (immutable) ===",
    ...lockedStageALines(game, lockedStageA, input.evidenceAliases),
    "",
    "=== FOOTBALL DATA (deterministic facts; the same data Stage 1 saw) ===",
    ...dataLines(blind, game, input.site),
    "",
    ...evidenceSection("=== CITABLE EVIDENCE (cite by the short reference at the start of each line) ===", input.evidenceLines, input.evidenceAliases, input.site),
    "",
    "=== CURRENT MARKET (the exact line JKB displays for this game; do not search for or restate other numbers) ===",
    ...renderHandicapV2MarketLines(market),
    "",
    "=== HOW TO DECIDE ===",
    "- preferredTeam is the side you think is the better bet at this exact number, even when you would pass. Never invert home/away: use the team abbreviations and side labels above.",
    "- verdict: BET = you would make this play with real conviction at this number; LEAN = a modest edge you would take but not press; PASS = no edge worth the price at this number, or too much uncertainty. PASS is fully valid and expected when there is no clear edge. Do not force a play, and do not force disagreement with the market either.",
    "- coverProbabilityPreferred and coverProbabilityOther are YOUR estimates, in percent, that each side covers the exact displayed line. In the JSON they are plain numbers: 59, not \"59%\" and not 0.59 (the percent sign appears only in the bold final-read lines of the write-up). On a half-point line they sum to 100 (a push is impossible). On a whole-number line they sum to 100 minus your push estimate (typically 3-9% on 3 or 7, 1-4% elsewhere). They must agree with your verdict: you cannot BET or LEAN a side you rate as less likely to cover.",
    "- Your locked fair spread is fixed. Your probabilities and verdict should be consistent with it and with the evidence, but they are your judgment, not a formula.",
    "- confidence (LOW, MEDIUM, MEDIUM_HIGH or HIGH) is how confident you are in this overall assessment, including the information quality.",
    "- keyNumberSensitivity is required when the market block marks key numbers MATERIAL: say where the number gets meaningfully better or worse (for example how -7 vs -7.5 changes the case). Otherwise use null. Do not force a key-number discussion.",
    "- counterargument is the strongest realistic reason the side you prefer fails to cover at this exact line. It must be specific (name the team, player, unit or number); \"anything can happen\" is rejected. Say it again in your write-up in your own words.",
    ...(input.site ? SITE_ONLY_EVIDENCE_RULES : EVIDENCE_RULES).map((rule) => `- ${rule}`),
    ...EVIDENCE_REF_RULES.map((rule) => `- ${rule}`),
    ...NO_INVENTION_RULES.map((rule) => `- ${rule}`),
    "",
    "=== HOW TO WRITE analysisMarkdown ===",
    `Answer the question the way an experienced bettor would explain it to a friend: direct, conversational, opinionated, grounded. ${WORD_TARGET_MIN}-${WORD_TARGET_MAX} words. Plain paragraphs separated by a blank line. No headings, no bullet or numbered lists, no "Key Takeaways", no unit-by-unit sections, no stat dump.`,
    "Use these paragraphs, in this order:",
    `1. Your opinion on the EXACT displayed number: which side you prefer at it (name it with its line, e.g. ${preferredLabelExample}) and how strongly, and whether it is an automatic play.`,
    "2. The market: the displayed line, how the books compare, the total, and what the key numbers mean for THIS number (only if they are material).",
    "3. The strongest matchup evidence: two to four facts that actually decide the game, and why each matters. Prefer current-season facts and say how many games they cover.",
    input.site
      ? "4. Injuries or availability -- ONLY if the availability line in the football data is CURRENT and makes it material (then cite availability.injuries in factRefsUsed). If it is unavailable or stale, skip this paragraph and make no specific injury claims; do not discuss weather or outside reporting. When you do use it, name the few players who actually move the handicap instead of vague phrases, and leave out anyone who does not matter."
      : "4. Injuries, availability, weather or situational context -- ONLY if the cited evidence makes it material. Every such claim must come from a cited evidence record. Skip this paragraph if nothing is material. When you do use it, name the few players who actually move the handicap (for example the specific offensive linemen, receiver or quarterback involved) instead of vague phrases like \"skill-position uncertainty\" or \"several offensive-line absences\". Do not list every injured player; leave out anyone who does not matter.",
    "5. Your strongest hesitation: the single most realistic reason the side you prefer fails to cover at this exact number. Be specific.",
    "That is 4 to 6 paragraphs before the final read. Then, with a blank line before it, this compact final read as four consecutive bold lines (no blank lines between them):",
    `**<preferred side label>: ~<X>% cover probability**`,
    `**<other side label>: ~<Y>%**`,
    `**${fairScoreLine(game, lockedStageA)}**`,
    `**${projectedTotalLine(lockedStageA)}**`,
    "Copy the fair-ish score and projected total lines exactly as shown; fill in the two side labels (from the market block) and your own percentages, which must equal coverProbabilityPreferred and coverProbabilityOther.",
    "Then ONE closing paragraph: your recommendation at the exact line, and how a nearby number would change it (for example \"So at the exact line I would choose <side>. If it moved to <line>, I would be noticeably less interested because ...\"). If you pass, say so plainly and say what number would interest you.",
    "Price matters: you know the exact price on each side. Where the price genuinely helps explain why this is a BET, LEAN or PASS, reason about it as part of the wager (for example, at -112 the break-even cover rate is a little above 52%, so a 56% estimate is an edge but not a huge one). Do not force a price sentence into every write-up, and the verdict stays your judgment, not a formula.",
    "Voice: write like a person talking, in direct sentences (\"What keeps me from calling it a bet is...\", \"The bigger concern is...\", \"At -7, I'm comfortable with...\", \"At -7.5, I'd back off.\"). Avoid stiff, consultant-style phrasing such as \"the key distinction is\", \"the underlying profile\", \"from a market perspective\" or \"the data suggests that\".",
    "Style: use no more than about 5-7 numbers in the analytical paragraphs; distinguish what the data shows from what you judge; state uncertainty where warranted; never write filler such as \"both teams will need to execute\" or \"it is important to note\"; never repeat the same conclusion twice; do not mention JKB, models, ratings or this process.",
    "",
    "=== OUTPUT SCHEMA (JSON object) ===",
    "Respond with ONLY a single JSON object (no prose before or after, no markdown code fence). Do NOT include a fair spread, projected total, market numbers, fair score or sources: those are attached mechanically.",
    JSON.stringify(example, null, 2),
  ].join("\n");
}
