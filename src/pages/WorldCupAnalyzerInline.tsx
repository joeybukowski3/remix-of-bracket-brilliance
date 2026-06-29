/**
 * WorldCupAnalyzerInline.tsx
 *
 * Renders all analyzer sections given two team names as props.
 * Used by:
 *   1. WorldCup2026.tsx — the ⚔️ Analyzer tab, with schedule dropdown controlling team names
 *   2. WorldCupAnalyzer.tsx — the standalone /world-cup/analyzer page
 *
 * All model logic lives here. WorldCupAnalyzer.tsx becomes a thin wrapper.
 */

import { useState, useEffect } from "react";
import { buildMatchupValue, bestValueOutcome, formatEdge, teamsMatch, isMarketFresh, type MatchupMarketValue } from "@/lib/wc/wcThreeWayValue";

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAV = "#031635";
const ACC = "#e05c2e";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WCTeam = {
  name: string;
  code: string;
  group: string;
  powerScore: number;
  attack: number;
  defense: number;
  form: number;
  fifaRank: number;
};

type GroupMatch = {
  group: string;
  matchday: number;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homePossession: number;
  awayPossession: number;
  result: "home" | "away" | "draw";
};

type PerMatchStats = {
  gamesPlayed: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  xgFor: number;
  xgAgainst: number;
  xgDiff: number;
  shotsFor: number;
  shotsAgainst: number;
  shotsOnTargetFor: number;
  shotsOnTargetAgainst: number;
  possession: number;
  savePercent: number;
  cleanSheetRate: number;
};

type ExpectationMetrics = {
  matchesPlayed: number;
  actualPoints: number;
  expectedPoints: number;
  pointsOverExpectation: number;
  actualGoals: number;
  expectedGoals: number;
  goalsOverExpectation: number;
  actualGoalsAgainst: number;
  expectedGoalsAgainst: number;
  goalsPreventedVsExpectation: number;
  actualGoalDifference: number;
  expectedGoalDifference: number;
  goalDifferenceOverExpectation: number;
};

// ─── Team data (canonical source) ─────────────────────────────────────────────
export const ALL_TEAMS: WCTeam[] = [
  { name: "Mexico",        code: "mx",     group: "A", powerScore: 84, attack: 82, defense: 76, form: 88, fifaRank: 14 },
  { name: "Korea Rep.",    code: "kr",     group: "A", powerScore: 50, attack: 50, defense: 54, form: 44, fifaRank: 22 },
  { name: "Czechia",       code: "cz",     group: "A", powerScore: 61, attack: 60, defense: 62, form: 60, fifaRank: 27 },
  { name: "South Africa",  code: "za",     group: "A", powerScore: 41, attack: 40, defense: 45, form: 38, fifaRank: 45 },
  { name: "Canada",        code: "ca",     group: "B", powerScore: 75, attack: 75, defense: 71, form: 78, fifaRank: 13 },
  { name: "Switzerland",   code: "ch",     group: "B", powerScore: 80, attack: 76, defense: 82, form: 78, fifaRank: 13 },
  { name: "Bosnia & Herz", code: "ba",     group: "B", powerScore: 55, attack: 54, defense: 56, form: 54, fifaRank: 48 },
  { name: "Qatar",         code: "qa",     group: "B", powerScore: 44, attack: 43, defense: 46, form: 43, fifaRank: 37 },
  { name: "Brazil",        code: "br",     group: "C", powerScore: 96, attack: 93, defense: 90, form: 97, fifaRank: 1 },
  { name: "Morocco",       code: "ma",     group: "C", powerScore: 78, attack: 75, defense: 80, form: 79, fifaRank: 15 },
  { name: "Scotland",      code: "gb-sct", group: "C", powerScore: 63, attack: 64, defense: 62, form: 61, fifaRank: 29 },
  { name: "Haiti",         code: "ht",     group: "C", powerScore: 31, attack: 30, defense: 33, form: 29, fifaRank: 101 },
  { name: "USA",           code: "us",     group: "D", powerScore: 66, attack: 65, defense: 67, form: 65, fifaRank: 11 },
  { name: "Türkiye",       code: "tr",     group: "D", powerScore: 61, attack: 63, defense: 59, form: 60, fifaRank: 19 },
  { name: "Paraguay",      code: "py",     group: "D", powerScore: 68, attack: 65, defense: 67, form: 69, fifaRank: 32 },
  { name: "Australia",     code: "au",     group: "D", powerScore: 57, attack: 56, defense: 58, form: 56, fifaRank: 23 },
  { name: "Germany",       code: "de",     group: "E", powerScore: 70, attack: 72, defense: 74, form: 65, fifaRank: 5 },
  { name: "Côte d'Ivoire", code: "ci",     group: "E", powerScore: 60, attack: 62, defense: 58, form: 59, fifaRank: 28 },
  { name: "Ecuador",       code: "ec",     group: "E", powerScore: 64, attack: 66, defense: 61, form: 65, fifaRank: 35 },
  { name: "Curaçao",       code: "cw",     group: "E", powerScore: 38, attack: 37, defense: 39, form: 37, fifaRank: 80 },
  { name: "Netherlands",   code: "nl",     group: "F", powerScore: 87, attack: 85, defense: 83, form: 88, fifaRank: 6 },
  { name: "Japan",         code: "jp",     group: "F", powerScore: 68, attack: 68, defense: 66, form: 70, fifaRank: 17 },
  { name: "Sweden",        code: "se",     group: "F", powerScore: 61, attack: 62, defense: 63, form: 59, fifaRank: 21 },
  { name: "Tunisia",       code: "tn",     group: "F", powerScore: 55, attack: 54, defense: 57, form: 53, fifaRank: 26 },
  { name: "Belgium",       code: "be",     group: "G", powerScore: 71, attack: 73, defense: 70, form: 70, fifaRank: 9 },
  { name: "IR Iran",       code: "ir",     group: "G", powerScore: 60, attack: 58, defense: 62, form: 59, fifaRank: 25 },
  { name: "Egypt",         code: "eg",     group: "G", powerScore: 64, attack: 62, defense: 65, form: 63, fifaRank: 34 },
  { name: "New Zealand",   code: "nz",     group: "G", powerScore: 44, attack: 43, defense: 46, form: 43, fifaRank: 93 },
  { name: "Spain",         code: "es",     group: "H", powerScore: 90, attack: 88, defense: 88, form: 92, fifaRank: 8 },
  { name: "Uruguay",       code: "uy",     group: "H", powerScore: 65, attack: 67, defense: 64, form: 63, fifaRank: 18 },
  { name: "Saudi Arabia",  code: "sa",     group: "H", powerScore: 54, attack: 52, defense: 57, form: 53, fifaRank: 40 },
  { name: "Cabo Verde",    code: "cv",     group: "H", powerScore: 43, attack: 42, defense: 45, form: 42, fifaRank: 62 },
  { name: "France",        code: "fr",     group: "I", powerScore: 94, attack: 92, defense: 91, form: 95, fifaRank: 3 },
  { name: "Norway",        code: "no",     group: "I", powerScore: 70, attack: 73, defense: 67, form: 70, fifaRank: 12 },
  { name: "Senegal",       code: "sn",     group: "I", powerScore: 63, attack: 63, defense: 64, form: 62, fifaRank: 20 },
  { name: "Iraq",          code: "iq",     group: "I", powerScore: 47, attack: 46, defense: 48, form: 46, fifaRank: 58 },
  { name: "Argentina",     code: "ar",     group: "J", powerScore: 95, attack: 95, defense: 87, form: 96, fifaRank: 2 },
  { name: "Austria",       code: "at",     group: "J", powerScore: 59, attack: 60, defense: 57, form: 58, fifaRank: 26 },
  { name: "Algeria",       code: "dz",     group: "J", powerScore: 52, attack: 53, defense: 56, form: 48, fifaRank: 30 },
  { name: "Jordan",        code: "jo",     group: "J", powerScore: 46, attack: 45, defense: 48, form: 45, fifaRank: 66 },
  { name: "Portugal",      code: "pt",     group: "K", powerScore: 75, attack: 80, defense: 74, form: 73, fifaRank: 7 },
  { name: "Colombia",      code: "co",     group: "K", powerScore: 79, attack: 77, defense: 72, form: 79, fifaRank: 10 },
  { name: "Uzbekistan",    code: "uz",     group: "K", powerScore: 52, attack: 51, defense: 53, form: 50, fifaRank: 68 },
  { name: "Congo DR",      code: "cd",     group: "K", powerScore: 49, attack: 48, defense: 51, form: 48, fifaRank: 54 },
  { name: "England",       code: "gb-eng", group: "L", powerScore: 84, attack: 83, defense: 82, form: 84, fifaRank: 4 },
  { name: "Croatia",       code: "hr",     group: "L", powerScore: 66, attack: 67, defense: 70, form: 65, fifaRank: 16 },
  { name: "Ghana",         code: "gh",     group: "L", powerScore: 57, attack: 56, defense: 58, form: 55, fifaRank: 51 },
  { name: "Panama",        code: "pa",     group: "L", powerScore: 51, attack: 49, defense: 53, form: 50, fifaRank: 43 },
];

// ─── Group-stage match results [MODELED] ──────────────────────────────────────
const GROUP_MATCHES: GroupMatch[] = [
  // ── Group A (Mexico, Korea Rep., Czechia, South Africa) — real results ──
  { group:"A", matchday:1, homeTeam:"Mexico",       awayTeam:"Korea Rep.",    homeGoals:1, awayGoals:0, homeXg:1.4, awayXg:0.9, homeShots:12, awayShots:9,  homeShotsOnTarget:4, awayShotsOnTarget:2, homePossession:54, awayPossession:46, result:"home" },
  { group:"A", matchday:1, homeTeam:"Czechia",      awayTeam:"South Africa",  homeGoals:1, awayGoals:1, homeXg:1.2, awayXg:1.1, homeShots:10, awayShots:9,  homeShotsOnTarget:3, awayShotsOnTarget:3, homePossession:52, awayPossession:48, result:"draw" },
  { group:"A", matchday:2, homeTeam:"Mexico",       awayTeam:"Czechia",       homeGoals:3, awayGoals:0, homeXg:2.8, awayXg:0.4, homeShots:16, awayShots:5,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:60, awayPossession:40, result:"home" },
  { group:"A", matchday:2, homeTeam:"South Africa", awayTeam:"Korea Rep.",    homeGoals:1, awayGoals:0, homeXg:1.2, awayXg:0.8, homeShots:10, awayShots:9,  homeShotsOnTarget:4, awayShotsOnTarget:2, homePossession:46, awayPossession:54, result:"home" },
  // ── Group B (Canada, Switzerland, Bosnia & Herz, Qatar) ─────────────────
  { group:"B", matchday:1, homeTeam:"Canada",       awayTeam:"Qatar",         homeGoals:6, awayGoals:0, homeXg:4.1, awayXg:0.3, homeShots:21, awayShots:4,  homeShotsOnTarget:9, awayShotsOnTarget:1, homePossession:65, awayPossession:35, result:"home" },
  { group:"B", matchday:1, homeTeam:"Switzerland",  awayTeam:"Bosnia & Herz", homeGoals:4, awayGoals:1, homeXg:3.2, awayXg:0.9, homeShots:17, awayShots:8,  homeShotsOnTarget:7, awayShotsOnTarget:3, homePossession:60, awayPossession:40, result:"home" },
  { group:"B", matchday:2, homeTeam:"Switzerland",  awayTeam:"Canada",        homeGoals:2, awayGoals:1, homeXg:1.9, awayXg:1.4, homeShots:13, awayShots:11, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:55, awayPossession:45, result:"home" },
  { group:"B", matchday:2, homeTeam:"Bosnia & Herz",awayTeam:"Qatar",         homeGoals:3, awayGoals:1, homeXg:2.4, awayXg:0.8, homeShots:14, awayShots:7,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:55, awayPossession:45, result:"home" },
  // ── Group C (Brazil, Morocco, Scotland, Haiti) ──────────────────────────
  { group:"C", matchday:1, homeTeam:"Brazil",       awayTeam:"Haiti",         homeGoals:3, awayGoals:0, homeXg:3.2, awayXg:0.3, homeShots:18, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:69, awayPossession:31, result:"home" },
  { group:"C", matchday:1, homeTeam:"Scotland",     awayTeam:"Morocco",       homeGoals:0, awayGoals:1, homeXg:0.8, awayXg:1.2, homeShots:9,  awayShots:11, homeShotsOnTarget:2, awayShotsOnTarget:4, homePossession:49, awayPossession:51, result:"away" },
  { group:"C", matchday:2, homeTeam:"Scotland",     awayTeam:"Brazil",        homeGoals:0, awayGoals:3, homeXg:0.5, awayXg:2.6, homeShots:5,  awayShots:16, homeShotsOnTarget:1, awayShotsOnTarget:7, homePossession:32, awayPossession:68, result:"away" },
  { group:"C", matchday:2, homeTeam:"Morocco",      awayTeam:"Haiti",         homeGoals:4, awayGoals:2, homeXg:2.9, awayXg:1.2, homeShots:15, awayShots:9,  homeShotsOnTarget:7, awayShotsOnTarget:4, homePossession:57, awayPossession:43, result:"home" },
  // ── Group D (USA, Türkiye, Paraguay, Australia) ──────────────────────────
  { group:"D", matchday:1, homeTeam:"USA",          awayTeam:"Australia",     homeGoals:2, awayGoals:0, homeXg:2.0, awayXg:0.7, homeShots:14, awayShots:8,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:57, awayPossession:43, result:"home" },
  { group:"D", matchday:1, homeTeam:"Türkiye",      awayTeam:"Paraguay",      homeGoals:0, awayGoals:1, homeXg:1.0, awayXg:1.3, homeShots:9,  awayShots:11, homeShotsOnTarget:2, awayShotsOnTarget:4, homePossession:48, awayPossession:52, result:"away" },
  { group:"D", matchday:2, homeTeam:"Türkiye",      awayTeam:"USA",           homeGoals:3, awayGoals:2, homeXg:2.4, awayXg:1.8, homeShots:14, awayShots:12, homeShotsOnTarget:6, awayShotsOnTarget:5, homePossession:51, awayPossession:49, result:"home" },
  { group:"D", matchday:2, homeTeam:"Paraguay",     awayTeam:"Australia",     homeGoals:0, awayGoals:0, homeXg:0.9, awayXg:0.8, homeShots:8,  awayShots:8,  homeShotsOnTarget:2, awayShotsOnTarget:2, homePossession:50, awayPossession:50, result:"draw" },
  // ── Group E (Germany, Cote d'Ivoire, Ecuador, Curacao) ──────────────────
  { group:"E", matchday:1, homeTeam:"Germany",       awayTeam:"Cote d'Ivoire", homeGoals:2, awayGoals:1, homeXg:1.9, awayXg:1.2, homeShots:13, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:55, awayPossession:45, result:"home" },
  { group:"E", matchday:1, homeTeam:"Ecuador",       awayTeam:"Curacao",       homeGoals:0, awayGoals:0, homeXg:1.1, awayXg:0.7, homeShots:10, awayShots:7,  homeShotsOnTarget:3, awayShotsOnTarget:2, homePossession:56, awayPossession:44, result:"draw" },
  { group:"E", matchday:2, homeTeam:"Ecuador",       awayTeam:"Germany",       homeGoals:2, awayGoals:1, homeXg:1.7, awayXg:1.6, homeShots:11, awayShots:12, homeShotsOnTarget:5, awayShotsOnTarget:5, homePossession:44, awayPossession:56, result:"home" },
  { group:"E", matchday:2, homeTeam:"Cote d'Ivoire",awayTeam:"Curacao",       homeGoals:2, awayGoals:0, homeXg:2.1, awayXg:0.5, homeShots:14, awayShots:5,  homeShotsOnTarget:6, awayShotsOnTarget:1, homePossession:59, awayPossession:41, result:"home" },
  // ── Group F (Netherlands, Japan, Sweden, Tunisia) ────────────────────────
  { group:"F", matchday:1, homeTeam:"Netherlands",  awayTeam:"Sweden",        homeGoals:5, awayGoals:1, homeXg:3.8, awayXg:0.9, homeShots:19, awayShots:8,  homeShotsOnTarget:9, awayShotsOnTarget:3, homePossession:62, awayPossession:38, result:"home" },
  { group:"F", matchday:1, homeTeam:"Tunisia",      awayTeam:"Japan",         homeGoals:0, awayGoals:4, homeXg:0.6, awayXg:3.1, homeShots:5,  awayShots:16, homeShotsOnTarget:1, awayShotsOnTarget:7, homePossession:36, awayPossession:64, result:"away" },
  { group:"F", matchday:2, homeTeam:"Tunisia",      awayTeam:"Netherlands",   homeGoals:1, awayGoals:3, homeXg:0.8, awayXg:2.6, homeShots:7,  awayShots:15, homeShotsOnTarget:2, awayShotsOnTarget:6, homePossession:38, awayPossession:62, result:"away" },
  { group:"F", matchday:2, homeTeam:"Japan",        awayTeam:"Sweden",        homeGoals:1, awayGoals:1, homeXg:1.4, awayXg:1.3, homeShots:11, awayShots:11, homeShotsOnTarget:4, awayShotsOnTarget:4, homePossession:51, awayPossession:49, result:"draw" },
  // ── Group G (Belgium, IR Iran, Egypt, New Zealand) ───────────────────────
  { group:"G", matchday:1, homeTeam:"Belgium",      awayTeam:"IR Iran",       homeGoals:0, awayGoals:0, homeXg:1.2, awayXg:1.0, homeShots:11, awayShots:10, homeShotsOnTarget:3, awayShotsOnTarget:3, homePossession:54, awayPossession:46, result:"draw" },
  { group:"G", matchday:1, homeTeam:"Egypt",        awayTeam:"New Zealand",   homeGoals:3, awayGoals:1, homeXg:2.4, awayXg:0.9, homeShots:14, awayShots:8,  homeShotsOnTarget:6, awayShotsOnTarget:3, homePossession:55, awayPossession:45, result:"home" },
  { group:"G", matchday:2, homeTeam:"Belgium",      awayTeam:"New Zealand",   homeGoals:5, awayGoals:1, homeXg:3.9, awayXg:0.7, homeShots:19, awayShots:6,  homeShotsOnTarget:9, awayShotsOnTarget:2, homePossession:65, awayPossession:35, result:"home" },
  { group:"G", matchday:2, homeTeam:"IR Iran",      awayTeam:"Egypt",         homeGoals:1, awayGoals:1, homeXg:1.2, awayXg:1.1, homeShots:10, awayShots:10, homeShotsOnTarget:4, awayShotsOnTarget:4, homePossession:50, awayPossession:50, result:"draw" },
  // ── Group H (Spain, Uruguay, Saudi Arabia, Cabo Verde) ───────────────────
  { group:"H", matchday:1, homeTeam:"Spain",        awayTeam:"Cabo Verde",    homeGoals:0, awayGoals:0, homeXg:1.8, awayXg:0.9, homeShots:14, awayShots:8,  homeShotsOnTarget:4, awayShotsOnTarget:3, homePossession:62, awayPossession:38, result:"draw" },
  { group:"H", matchday:1, homeTeam:"Saudi Arabia", awayTeam:"Uruguay",       homeGoals:1, awayGoals:1, homeXg:1.1, awayXg:1.3, homeShots:9,  awayShots:11, homeShotsOnTarget:3, awayShotsOnTarget:4, homePossession:44, awayPossession:56, result:"draw" },
  { group:"H", matchday:2, homeTeam:"Spain",        awayTeam:"Saudi Arabia",  homeGoals:4, awayGoals:0, homeXg:3.2, awayXg:0.4, homeShots:17, awayShots:4,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:67, awayPossession:33, result:"home" },
  { group:"H", matchday:2, homeTeam:"Uruguay",      awayTeam:"Cabo Verde",    homeGoals:2, awayGoals:2, homeXg:1.8, awayXg:1.6, homeShots:12, awayShots:11, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:53, awayPossession:47, result:"draw" },
  { group:"H", matchday:3, homeTeam:"Uruguay",      awayTeam:"Spain",         homeGoals:0, awayGoals:1, homeXg:0.9, awayXg:1.4, homeShots:8,  awayShots:12, homeShotsOnTarget:2, awayShotsOnTarget:4, homePossession:44, awayPossession:56, result:"away" },
  { group:"H", matchday:3, homeTeam:"Saudi Arabia", awayTeam:"Cabo Verde",    homeGoals:0, awayGoals:0, homeXg:0.9, awayXg:0.8, homeShots:8,  awayShots:7,  homeShotsOnTarget:2, awayShotsOnTarget:2, homePossession:51, awayPossession:49, result:"draw" },
  // ── Group I (France, Norway, Senegal, Iraq) ──────────────────────────────
  { group:"I", matchday:1, homeTeam:"France",       awayTeam:"Senegal",       homeGoals:3, awayGoals:1, homeXg:2.6, awayXg:0.9, homeShots:15, awayShots:8,  homeShotsOnTarget:6, awayShotsOnTarget:3, homePossession:61, awayPossession:39, result:"home" },
  { group:"I", matchday:1, homeTeam:"Iraq",         awayTeam:"Norway",        homeGoals:1, awayGoals:4, homeXg:0.7, awayXg:3.1, homeShots:6,  awayShots:16, homeShotsOnTarget:2, awayShotsOnTarget:7, homePossession:38, awayPossession:62, result:"away" },
  { group:"I", matchday:2, homeTeam:"France",       awayTeam:"Iraq",          homeGoals:3, awayGoals:0, homeXg:2.8, awayXg:0.4, homeShots:16, awayShots:4,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:68, awayPossession:32, result:"home" },
  { group:"I", matchday:2, homeTeam:"Norway",       awayTeam:"Senegal",       homeGoals:3, awayGoals:2, homeXg:2.3, awayXg:1.6, homeShots:14, awayShots:11, homeShotsOnTarget:6, awayShotsOnTarget:5, homePossession:55, awayPossession:45, result:"home" },
  { group:"I", matchday:3, homeTeam:"Norway",       awayTeam:"France",        homeGoals:1, awayGoals:4, homeXg:1.2, awayXg:3.3, homeShots:9,  awayShots:17, homeShotsOnTarget:3, awayShotsOnTarget:8, homePossession:40, awayPossession:60, result:"away" },
  { group:"I", matchday:3, homeTeam:"Senegal",      awayTeam:"Iraq",          homeGoals:5, awayGoals:0, homeXg:3.6, awayXg:0.4, homeShots:18, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:62, awayPossession:38, result:"home" },
  // ── Group J (Argentina, Austria, Algeria, Jordan) ────────────────────────
  { group:"J", matchday:1, homeTeam:"Argentina",    awayTeam:"Algeria",       homeGoals:3, awayGoals:0, homeXg:2.8, awayXg:0.4, homeShots:16, awayShots:5,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:63, awayPossession:37, result:"home" },
  { group:"J", matchday:1, homeTeam:"Austria",      awayTeam:"Jordan",        homeGoals:3, awayGoals:1, homeXg:2.4, awayXg:0.8, homeShots:14, awayShots:7,  homeShotsOnTarget:6, awayShotsOnTarget:3, homePossession:59, awayPossession:41, result:"home" },
  { group:"J", matchday:2, homeTeam:"Argentina",    awayTeam:"Austria",       homeGoals:2, awayGoals:0, homeXg:2.1, awayXg:0.7, homeShots:14, awayShots:7,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:61, awayPossession:39, result:"home" },
  { group:"J", matchday:2, homeTeam:"Jordan",       awayTeam:"Algeria",       homeGoals:1, awayGoals:2, homeXg:0.9, awayXg:1.5, homeShots:8,  awayShots:11, homeShotsOnTarget:3, awayShotsOnTarget:4, homePossession:44, awayPossession:56, result:"away" },
  { group:"J", matchday:3, homeTeam:"Argentina",    awayTeam:"Jordan",        homeGoals:3, awayGoals:1, homeXg:2.6, awayXg:0.8, homeShots:15, awayShots:7,  homeShotsOnTarget:6, awayShotsOnTarget:3, homePossession:64, awayPossession:36, result:"home" },
  { group:"J", matchday:3, homeTeam:"Algeria",      awayTeam:"Austria",       homeGoals:3, awayGoals:3, homeXg:2.2, awayXg:2.1, homeShots:13, awayShots:12, homeShotsOnTarget:5, awayShotsOnTarget:5, homePossession:51, awayPossession:49, result:"draw" },
  // ── Group K (Portugal, Colombia, Uzbekistan, Congo DR) ───────────────────
  { group:"K", matchday:1, homeTeam:"Portugal",     awayTeam:"Congo DR",      homeGoals:1, awayGoals:1, homeXg:1.6, awayXg:1.3, homeShots:13, awayShots:11, homeShotsOnTarget:4, awayShotsOnTarget:4, homePossession:55, awayPossession:45, result:"draw" },
  { group:"K", matchday:1, homeTeam:"Uzbekistan",   awayTeam:"Colombia",      homeGoals:1, awayGoals:3, homeXg:0.8, awayXg:2.2, homeShots:7,  awayShots:14, homeShotsOnTarget:2, awayShotsOnTarget:6, homePossession:40, awayPossession:60, result:"away" },
  { group:"K", matchday:2, homeTeam:"Portugal",     awayTeam:"Uzbekistan",    homeGoals:5, awayGoals:0, homeXg:3.8, awayXg:0.4, homeShots:18, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:66, awayPossession:34, result:"home" },
  { group:"K", matchday:2, homeTeam:"Colombia",     awayTeam:"Congo DR",      homeGoals:1, awayGoals:0, homeXg:1.4, awayXg:0.9, homeShots:12, awayShots:9,  homeShotsOnTarget:4, awayShotsOnTarget:3, homePossession:56, awayPossession:44, result:"home" },
  { group:"K", matchday:3, homeTeam:"Colombia",     awayTeam:"Portugal",      homeGoals:0, awayGoals:0, homeXg:1.1, awayXg:1.2, homeShots:10, awayShots:11, homeShotsOnTarget:3, awayShotsOnTarget:3, homePossession:49, awayPossession:51, result:"draw" },
  { group:"K", matchday:3, homeTeam:"Congo DR",     awayTeam:"Uzbekistan",    homeGoals:3, awayGoals:1, homeXg:2.2, awayXg:0.8, homeShots:13, awayShots:7,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:55, awayPossession:45, result:"home" },
  // ── Group L (England, Croatia, Ghana, Panama) ────────────────────────────
  { group:"L", matchday:1, homeTeam:"England",      awayTeam:"Croatia",       homeGoals:4, awayGoals:2, homeXg:3.1, awayXg:1.6, homeShots:16, awayShots:11, homeShotsOnTarget:7, awayShotsOnTarget:5, homePossession:57, awayPossession:43, result:"home" },
  { group:"L", matchday:1, homeTeam:"Ghana",        awayTeam:"Panama",        homeGoals:1, awayGoals:0, homeXg:1.3, awayXg:0.8, homeShots:11, awayShots:8,  homeShotsOnTarget:4, awayShotsOnTarget:2, homePossession:53, awayPossession:47, result:"home" },
  { group:"L", matchday:2, homeTeam:"England",      awayTeam:"Ghana",         homeGoals:0, awayGoals:0, homeXg:1.4, awayXg:1.1, homeShots:12, awayShots:10, homeShotsOnTarget:4, awayShotsOnTarget:3, homePossession:58, awayPossession:42, result:"draw" },
  { group:"L", matchday:2, homeTeam:"Panama",       awayTeam:"Croatia",       homeGoals:0, awayGoals:1, homeXg:0.6, awayXg:1.2, homeShots:6,  awayShots:12, homeShotsOnTarget:1, awayShotsOnTarget:4, homePossession:42, awayPossession:58, result:"away" },
  { group:"L", matchday:3, homeTeam:"Panama",       awayTeam:"England",       homeGoals:0, awayGoals:2, homeXg:0.5, awayXg:1.8, homeShots:5,  awayShots:14, homeShotsOnTarget:1, awayShotsOnTarget:5, homePossession:37, awayPossession:63, result:"away" },
  { group:"L", matchday:3, homeTeam:"Croatia",      awayTeam:"Ghana",         homeGoals:2, awayGoals:1, homeXg:1.8, awayXg:1.2, homeShots:13, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:54, awayPossession:46, result:"home" },
];

// ─── Model helpers ─────────────────────────────────────────────────────────────

function teamMatches(teamName: string) {
  return GROUP_MATCHES
    .filter(m => m.homeTeam === teamName || m.awayTeam === teamName)
    .map(m => ({ ...m, teamIsHome: m.homeTeam === teamName }));
}

function computePerMatchStats(teamName: string): PerMatchStats {
  const matches = teamMatches(teamName);
  if (!matches.length) return { gamesPlayed:0,points:0,goalsFor:0,goalsAgainst:0,goalDiff:0,xgFor:0,xgAgainst:0,xgDiff:0,shotsFor:0,shotsAgainst:0,shotsOnTargetFor:0,shotsOnTargetAgainst:0,possession:50,savePercent:0,cleanSheetRate:0 };
  let pts=0,gf=0,ga=0,xgf=0,xga=0,sf=0,sa=0,sotf=0,sota=0,poss=0,cs=0;
  for (const m of matches) {
    const myG=m.teamIsHome?m.homeGoals:m.awayGoals, oppG=m.teamIsHome?m.awayGoals:m.homeGoals;
    const myXg=m.teamIsHome?m.homeXg:m.awayXg, oppXg=m.teamIsHome?m.awayXg:m.homeXg;
    gf+=myG;ga+=oppG;xgf+=myXg;xga+=oppXg;
    sf+=m.teamIsHome?m.homeShots:m.awayShots; sa+=m.teamIsHome?m.awayShots:m.homeShots;
    sotf+=m.teamIsHome?m.homeShotsOnTarget:m.awayShotsOnTarget; sota+=m.teamIsHome?m.awayShotsOnTarget:m.homeShotsOnTarget;
    poss+=m.teamIsHome?m.homePossession:m.awayPossession;
    if(oppG===0)cs++;
    pts+=myG>oppG?3:myG===oppG?1:0;
  }
  const n=matches.length;
  return { gamesPlayed:n, points:pts/n, goalsFor:gf/n, goalsAgainst:ga/n, goalDiff:(gf-ga)/n, xgFor:xgf/n, xgAgainst:xga/n, xgDiff:(xgf-xga)/n, shotsFor:sf/n, shotsAgainst:sa/n, shotsOnTargetFor:sotf/n, shotsOnTargetAgainst:sota/n, possession:poss/n, savePercent:sota>0?((sota-ga)/sota)*100:100, cleanSheetRate:(cs/n)*100 };
}

function expectedProbabilities(teamRating: number, oppRating: number) {
  const diff = teamRating - oppRating;
  const rawWin = 1 / (1 + Math.pow(10, -diff / 20));
  const drawBase = 0.30 * Math.exp(-Math.abs(diff) / 30);
  return { win: rawWin*(1-drawBase), draw: drawBase, loss: (1-rawWin)*(1-drawBase) };
}

function computeExpectationMetrics(teamName: string): ExpectationMetrics {
  const team = ALL_TEAMS.find(t => t.name === teamName);
  if (!team) return { matchesPlayed:0,actualPoints:0,expectedPoints:0,pointsOverExpectation:0,actualGoals:0,expectedGoals:0,goalsOverExpectation:0,actualGoalsAgainst:0,expectedGoalsAgainst:0,goalsPreventedVsExpectation:0,actualGoalDifference:0,expectedGoalDifference:0,goalDifferenceOverExpectation:0 };
  const matches = teamMatches(teamName);
  let actPts=0,expPts=0,actG=0,expG=0,actGA=0,expGA=0;
  for (const m of matches) {
    const opp = ALL_TEAMS.find(t => t.name === (m.teamIsHome?m.awayTeam:m.homeTeam));
    if (!opp) continue;
    const myG=m.teamIsHome?m.homeGoals:m.awayGoals, oppG=m.teamIsHome?m.awayGoals:m.homeGoals;
    const {win,draw}=expectedProbabilities(team.powerScore,opp.powerScore);
    actPts+=myG>oppG?3:myG===oppG?1:0; expPts+=3*win+1*draw;
    actG+=myG; expG+=m.teamIsHome?m.homeXg:m.awayXg;
    actGA+=oppG; expGA+=m.teamIsHome?m.awayXg:m.homeXg;
  }
  return { matchesPlayed:matches.length, actualPoints:actPts, expectedPoints:parseFloat(expPts.toFixed(2)), pointsOverExpectation:parseFloat((actPts-expPts).toFixed(2)), actualGoals:actG, expectedGoals:parseFloat(expG.toFixed(2)), goalsOverExpectation:parseFloat((actG-expG).toFixed(2)), actualGoalsAgainst:actGA, expectedGoalsAgainst:parseFloat(expGA.toFixed(2)), goalsPreventedVsExpectation:parseFloat((expGA-actGA).toFixed(2)), actualGoalDifference:actG-actGA, expectedGoalDifference:parseFloat((expG-expGA).toFixed(2)), goalDifferenceOverExpectation:parseFloat(((actG-actGA)-(expG-expGA)).toFixed(2)) };
}

function computeSOS(teamName: string, excludeOpponent?: string) {
  const allMatches = teamMatches(teamName);
  // Exclude the direct match vs the opponent being compared
  const matches = excludeOpponent
    ? allMatches.filter(m => (m.teamIsHome ? m.awayTeam : m.homeTeam) !== excludeOpponent)
    : allMatches;
  if (!matches.length) return { sosScore:50, avgOpponentPretournament:50, bestOpponent:"N/A", weakestOpponent:"N/A", opponentAvgAttack:50, opponentAvgDefense:50 };
  const opponents = matches.map(m => m.teamIsHome?m.awayTeam:m.homeTeam);
  const preRatings = opponents.map(o => ALL_TEAMS.find(t=>t.name===o)?.powerScore??50);
  const avgPre = preRatings.reduce((a,b)=>a+b,0)/preRatings.length;
  const liveRatings = opponents.map(opp => {
    const om = teamMatches(opp).filter(m=>(m.teamIsHome?m.awayTeam:m.homeTeam)!==teamName);
    if (!om.length) return ALL_TEAMS.find(t=>t.name===opp)?.powerScore??50;
    let pts=0; for(const m of om){const myG=m.teamIsHome?m.homeGoals:m.awayGoals,oppG=m.teamIsHome?m.awayGoals:m.homeGoals;pts+=myG>oppG?3:myG===oppG?1:0;}
    return (pts/om.length/3)*100;
  });
  const avgLive = liveRatings.reduce((a,b)=>a+b,0)/liveRatings.length;
  const sosScore = Math.min(100, Math.max(0, 0.7*avgPre + 0.3*avgLive));
  const bestIdx = preRatings.indexOf(Math.max(...preRatings));
  const worstIdx = preRatings.indexOf(Math.min(...preRatings));
  return { sosScore:parseFloat(sosScore.toFixed(1)), avgOpponentPretournament:parseFloat(avgPre.toFixed(1)), bestOpponent:opponents[bestIdx]??"N/A", weakestOpponent:opponents[worstIdx]??"N/A", opponentAvgAttack:parseFloat((opponents.map(o=>ALL_TEAMS.find(t=>t.name===o)?.attack??50).reduce((a,b)=>a+b,0)/opponents.length).toFixed(1)), opponentAvgDefense:parseFloat((opponents.map(o=>ALL_TEAMS.find(t=>t.name===o)?.defense??50).reduce((a,b)=>a+b,0)/opponents.length).toFixed(1)) };
}

function computeMatchupModel(teamA: WCTeam, teamB: WCTeam, sA: PerMatchStats, sB: PerMatchStats, sosA: { sosScore: number }, sosB: { sosScore: number }) {
  const preFactor = (teamA.powerScore - teamB.powerScore) / 100;
  const liveA = sA.gamesPlayed>0?(sA.xgDiff+sA.points)/2:0;
  const liveB = sB.gamesPlayed>0?(sB.xgDiff+sB.points)/2:0;
  const liveFactor = (liveA-liveB)/5;
  const sosFactor = (sosA.sosScore-sosB.sosScore)/100;
  const compositeEdge = 0.40*preFactor + 0.35*liveFactor + 0.25*sosFactor;

  // Map composite edge to a rating-difference capped at ±25 so even the
  // largest realistic gaps (e.g. Brazil vs Haiti) stay within ~75/10/15%.
  // This prevents extreme teams from ever showing 100%/0%.
  const ratingDiff = Math.max(-25, Math.min(25, compositeEdge * 60));
  const {win:winA,draw,loss:lossA} = expectedProbabilities(50+ratingDiff, 50);

  // Hard floor/ceiling: no team ever shows below 8% or above 82% win prob.
  const winACapped  = Math.min(0.82, Math.max(0.08, winA));
  const lossACapped = Math.min(0.82, Math.max(0.08, lossA));
  // Re-normalise draw so all three sum to 1
  const drawCapped  = Math.max(0.04, 1 - winACapped - lossACapped);
  const total = winACapped + drawCapped + lossACapped;

  const avgGoals = 2.7;
  const projA = parseFloat(((winACapped/total + drawCapped/total*0.5)*avgGoals).toFixed(2));
  const projB = parseFloat(((lossACapped/total + drawCapped/total*0.5)*avgGoals).toFixed(2));
  const edgeMag = Math.abs(winACapped - lossACapped);
  const edgeLabel = edgeMag<0.08?"Toss-up":edgeMag<0.18?(winACapped>lossACapped?`Slight edge: ${teamA.name}`:`Slight edge: ${teamB.name}`):edgeMag<0.32?(winACapped>lossACapped?`Moderate edge: ${teamA.name}`:`Moderate edge: ${teamB.name}`):(winACapped>lossACapped?`Strong edge: ${teamA.name}`:`Strong edge: ${teamB.name}`);
  return {
    winA:  parseFloat(((winACapped/total)*100).toFixed(1)),
    draw:  parseFloat(((drawCapped/total)*100).toFixed(1)),
    lossA: parseFloat(((lossACapped/total)*100).toFixed(1)),
    projA, projB, edgeLabel, edgeMag,
    confidence: Math.min(85, Math.round(45 + edgeMag*120)),
    compositeEdge,
  };
}

// ─── UI primitives ─────────────────────────────────────────────────────────────

function Flag({ code, size=28 }: { code: string; size?: number }) {
  return <img src={`https://flagcdn.com/${size*2}x${Math.round(size*2*0.75)}/${code.toLowerCase()}.png`} alt={code} width={size} height={Math.round(size*0.75)} className="inline-block rounded-[2px] object-cover" onError={e=>{(e.target as HTMLImageElement).style.display="none"}} />;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="mb-3"><h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">{title}</h3>{subtitle&&<p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}</div>;
}

function Card({ children, className="" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

function StatBar({ value, max=100, color=NAV }: { value: number; max?: number; color?: string }) {
  return <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{width:`${(value/max)*100}%`,backgroundColor:color}} /></div>;
}

function Delta({ val }: { val: number }) {
  return <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${val>0?"text-emerald-600":val<0?"text-red-500":"text-slate-400"}`}>{val>0?"▲":val<0?"▼":"–"} {Math.abs(val).toFixed(2)}</span>;
}

function CompBar({ valA, valB, label, higherIsBetter=true, tip, fmt, codeA, codeB }: { valA:number; valB:number; label:string; higherIsBetter?:boolean; tip?:string; fmt?:(v:number)=>string; codeA?:string; codeB?:string }) {
  const f = fmt??(v=>v.toFixed(2));
  const total = valA+valB;
  const pctA = total>0?(valA/total)*100:50;
  const advA = higherIsBetter?valA>valB:valA<valB;
  const advB = higherIsBetter?valB>valA:valB<valA;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 border-b border-slate-100 last:border-0">
      <div className={`flex items-center justify-end gap-1.5 ${advA?"text-emerald-600 font-extrabold":advB?"text-slate-400 font-semibold":"text-slate-700 font-bold"}`}>
        {advA && <span className="text-emerald-500 text-xs">✓</span>}
        {codeA && advA && <Flag code={codeA} size={14}/>}
        <span className={`tabular-nums ${advA?"text-base":"text-sm"}`}>{f(valA)}</span>
      </div>
      <div className="flex flex-col items-center min-w-[72px]">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 cursor-help whitespace-nowrap" title={tip}>{label}</span>
        <div className="mt-1 h-2 w-20 rounded-full bg-slate-100 overflow-hidden flex">
          <div className="h-full rounded-l-full transition-all" style={{width:`${pctA}%`,backgroundColor:NAV}} />
          <div className="h-full rounded-r-full transition-all" style={{width:`${100-pctA}%`,backgroundColor:ACC}} />
        </div>
      </div>
      <div className={`flex items-center gap-1.5 ${advB?"text-emerald-600 font-extrabold":advA?"text-slate-400 font-semibold":"text-slate-700 font-bold"}`}>
        <span className={`tabular-nums ${advB?"text-base":"text-sm"}`}>{f(valB)}</span>
        {codeB && advB && <Flag code={codeB} size={14}/>}
        {advB && <span className="text-emerald-500 text-xs">✓</span>}
      </div>
    </div>
  );
}

// ─── Team picker ───────────────────────────────────────────────────────────────

function TeamPicker({ value, exclude, onChange, label }: { value: string; exclude: string; onChange: (n:string)=>void; label: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const team = ALL_TEAMS.find(t=>t.name===value);
  const filtered = ALL_TEAMS.filter(t=>t.name!==exclude&&t.name.toLowerCase().includes(q.toLowerCase())).slice(0,12);
  return (
    <div className="relative">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</div>
      <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:border-slate-300 transition">
        {team?<><Flag code={team.code} size={16}/><span>{team.name}</span><span className="ml-auto text-[10px] text-slate-400">Grp {team.group}</span></>:<span className="text-slate-400">Select team…</span>}
        <span className="ml-auto text-xs text-slate-300">▾</span>
      </button>
      {open&&(
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100"><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" className="w-full rounded-lg bg-slate-50 px-3 py-1.5 text-sm outline-none"/></div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(t=>(
              <button key={t.name} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50" onClick={()=>{onChange(t.name);setOpen(false);setQ("");}}>
                <Flag code={t.code} size={14}/><span className="font-medium">{t.name}</span><span className="ml-auto text-[10px] text-slate-400">Grp {t.group} · {t.powerScore}</span>
              </button>
            ))}
            {!filtered.length&&<div className="p-3 text-xs text-slate-400 text-center">No teams found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main exported component ───────────────────────────────────────────────────

export default function WorldCupAnalyzerInline({
  teamAName,
  teamBName,
  onSwap,
  onChangeA,
  onChangeB,
}: {
  teamAName: string;
  teamBName: string;
  onSwap: () => void;
  onChangeA: (n: string) => void;
  onChangeB: (n: string) => void;
}) {
  const teamA = ALL_TEAMS.find(t => t.name === teamAName) ?? ALL_TEAMS[0];
  const teamB = ALL_TEAMS.find(t => t.name === teamBName) ?? ALL_TEAMS[8];

  const sA = computePerMatchStats(teamA.name);
  const sB = computePerMatchStats(teamB.name);
  // Pass each team as the excludeOpponent so they don't count each other in SOS
  const sosA = computeSOS(teamA.name, teamB.name);
  const sosB = computeSOS(teamB.name, teamA.name);
  const model = computeMatchupModel(teamA, teamB, sA, sB, sosA, sosB);
  const eA = computeExpectationMetrics(teamA.name);
  const eB = computeExpectationMetrics(teamB.name);

  // ── Market value: Polymarket primary, ESPN fallback ──────────────────────────
  const [marketValue, setMarketValue] = useState<MatchupMarketValue | null>(null);

  useEffect(() => {
    setMarketValue(null);
    let cancelled = false;

    const espnNames: Record<string, string> = {
      "USA": "United States", "Côte d'Ivoire": "Ivory Coast", "Cote d'Ivoire": "Ivory Coast",
      "Cabo Verde": "Cape Verde", "IR Iran": "Iran", "Korea Rep.": "South Korea",
      "Türkiye": "Turkey", "Congo DR": "DR Congo", "Bosnia & Herz": "Bosnia and Herzegovina",
    };
    const espnA = espnNames[teamA.name] ?? teamA.name;
    const espnB = espnNames[teamB.name] ?? teamB.name;

    const today = new Date();
    const dates = [0, 1, 2, 3].map(i => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d.toISOString().slice(0, 10).replace(/-/g, "");
    });

    async function tryPolymarket(): Promise<boolean> {
      try {
        const dateStr = today.toISOString().slice(0, 10);
        const resp = await fetch(
          `https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&event_date=${dateStr}`,
          { headers: { Accept: "application/json" } }
        );
        if (!resp.ok) return false;
        const events: unknown[] = await resp.json();
        if (!Array.isArray(events)) return false;

        for (const ev of events) {
          if (typeof ev !== "object" || ev === null) continue;
          const event = ev as Record<string, unknown>;
          const markets = Array.isArray(event.markets) ? event.markets as Record<string, unknown>[] : [];

          for (const mkt of markets) {
            const rawOutcomes = mkt.outcomes;
            const rawPrices = mkt.outcomePrices;
            if (!rawOutcomes || !rawPrices) continue;

            const outcomes: string[] = typeof rawOutcomes === "string"
              ? JSON.parse(rawOutcomes) : Array.isArray(rawOutcomes) ? rawOutcomes : [];
            const prices: string[] = typeof rawPrices === "string"
              ? JSON.parse(rawPrices) : Array.isArray(rawPrices) ? rawPrices : [];

            if (outcomes.length !== 3 || prices.length !== 3) continue;

            let team1Idx = -1, drawIdx = -1, team2Idx = -1;
            for (let i = 0; i < outcomes.length; i++) {
              const o = outcomes[i].toLowerCase();
              if (o === "draw" || o === "tie") { drawIdx = i; continue; }
              if (teamsMatch(outcomes[i], teamA.name) || teamsMatch(outcomes[i], espnA)) { team1Idx = i; continue; }
              if (teamsMatch(outcomes[i], teamB.name) || teamsMatch(outcomes[i], espnB)) { team2Idx = i; }
            }
            if (drawIdx >= 0 && team1Idx < 0 && team2Idx < 0) {
              const nonDraw = [0, 1, 2].filter(i => i !== drawIdx);
              team1Idx = nonDraw[0]; team2Idx = nonDraw[1];
            }
            if (team1Idx < 0 || drawIdx < 0 || team2Idx < 0) continue;

            const p1 = parseFloat(prices[team1Idx]);
            const pD = parseFloat(prices[drawIdx]);
            const p2 = parseFloat(prices[team2Idx]);
            if (!Number.isFinite(p1) || !Number.isFinite(pD) || !Number.isFinite(p2)) continue;

            const updatedAt = typeof mkt.updatedAt === "string" ? mkt.updatedAt : new Date().toISOString();
            if (!isMarketFresh(updatedAt, 6)) continue;

            const mv = buildMatchupValue(
              { team1: p1, draw: pD, team2: p2, source: "polymarket", marketId: String(mkt.id ?? ""), updatedAt },
              model.winA, model.draw, model.lossA,
            );
            if (!mv) continue;
            if (!cancelled) setMarketValue(mv);
            return true;
          }
        }
      } catch { /* fall through */ }
      return false;
    }

    async function tryEspn(): Promise<boolean> {
      try {
        const results = await Promise.all(
          dates.map(date =>
            fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`)
              .then(r => r.ok ? r.json() : { events: [] })
              .catch(() => ({ events: [] }))
          )
        );
        const toImplied = (ml: number) => ml < 0 ? (-ml) / (-ml + 100) : 100 / (ml + 100);

        for (const data of results) {
          for (const ev of (data.events ?? [])) {
            const c = ev.competitions?.[0];
            if (!c) continue;
            const home = c.competitors?.find((x: { homeAway: string }) => x.homeAway === "home");
            const away = c.competitors?.find((x: { homeAway: string }) => x.homeAway === "away");
            if (!home || !away) continue;
            const hName: string = home.team?.displayName ?? "";
            const aName: string = away.team?.displayName ?? "";
            const matchesTeams =
              (teamsMatch(hName, espnA) && teamsMatch(aName, espnB)) ||
              (teamsMatch(hName, espnB) && teamsMatch(aName, espnA));
            if (!matchesTeams) continue;

            const odds = c.odds?.[0];
            if (!odds) continue;
            const homeML = parseFloat(odds.homeTeamOdds?.moneyLine ?? "0");
            const awayML = parseFloat(odds.awayTeamOdds?.moneyLine ?? "0");
            const drawML = parseFloat(odds.drawOdds?.moneyLine ?? "0") || 350;
            if (!homeML || !awayML) continue;

            const isAHome = teamsMatch(hName, espnA);
            const mv = buildMatchupValue(
              {
                team1: isAHome ? toImplied(homeML) : toImplied(awayML),
                draw: toImplied(drawML),
                team2: isAHome ? toImplied(awayML) : toImplied(homeML),
                source: "espn",
                updatedAt: new Date().toISOString(),
              },
              model.winA, model.draw, model.lossA,
            );
            if (!mv) continue;
            if (!cancelled) setMarketValue(mv);
            return true;
          }
        }
      } catch { /* unavailable */ }
      return false;
    }

    (async () => {
      const found = await tryPolymarket();
      if (!found && !cancelled) await tryEspn();
    })();

    return () => { cancelled = true; };
  }, [teamA.name, teamB.name, model.winA, model.draw, model.lossA]);


  // Common opponents (excluding each other)
  const oppsA = new Set(teamMatches(teamA.name).filter(m=>(m.teamIsHome?m.awayTeam:m.homeTeam)!==teamB.name).map(m=>m.teamIsHome?m.awayTeam:m.homeTeam));
  const oppsB = new Set(teamMatches(teamB.name).filter(m=>(m.teamIsHome?m.awayTeam:m.homeTeam)!==teamA.name).map(m=>m.teamIsHome?m.awayTeam:m.homeTeam));
  const common = [...oppsA].filter(o=>oppsB.has(o));

  // Group H2H
  const h2h = GROUP_MATCHES.find(m=>(m.homeTeam===teamA.name&&m.awayTeam===teamB.name)||(m.homeTeam===teamB.name&&m.awayTeam===teamA.name))??null;

  const styleTag = (s: PerMatchStats) => s.possession>58&&s.xgFor>2?"High-Possession Attacker":s.possession>58?"Possession-Dominant":s.xgFor>2?"Counter-Attack Finisher":s.xgAgainst<0.8?"Defensive Compact":s.xgDiff>1?"Balanced Dominant":"Transition-Oriented";

  // Matchday label helper
  const mdLabel = (md:number) => md===1?"MD1":md===2?"MD2":"MD3";

  return (
    <div className="space-y-4">
      {/* Team pickers */}
      <Card>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <TeamPicker value={teamAName} exclude={teamBName} onChange={onChangeA} label="Team A" />
          <button onClick={onSwap} className="mb-0.5 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-400 hover:bg-slate-100 transition" title="Swap teams">⇄</button>
          <TeamPicker value={teamBName} exclude={teamAName} onChange={onChangeB} label="Team B" />
        </div>
      </Card>

      {/* Header */}
      <Card className="!p-6">
        <div className="flex items-start gap-4">
          {[{team:teamA,side:"left"},{team:teamB,side:"right"}].map(({team,side},i)=>(
            <div key={i} className={`flex flex-col flex-1 ${side==="right"?"items-end text-right":""}`}>
              <Flag code={team.code} size={36}/>
              <div className="mt-2 text-xl font-black text-[#031635]">{team.name}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Group {team.group}</div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                <div>{i===0?eA.matchesPlayed:eB.matchesPlayed} GP · <strong>{i===0?eA.actualPoints:eB.actualPoints}</strong> pts</div>
                <div>GF <strong>{i===0?eA.actualGoals:eB.actualGoals}</strong> · GA <strong>{i===0?eA.actualGoalsAgainst:eB.actualGoalsAgainst}</strong></div>
                <div>Pre-rating: <strong className="text-[#031635]">{team.powerScore}/100</strong></div>
                <div>FIFA #{team.fifaRank}</div>
              </div>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2 pt-2"><div className="text-xl font-black text-slate-200">vs</div><button onClick={onSwap} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition">⇄ Swap</button></div>
        </div>
      </Card>

      {/* Edge */}
      <Card>
        <SectionHeader title="Overall Edge" subtitle={`${model.edgeLabel}`} />
        <div className="mb-4 rounded-xl bg-[#031635] px-4 py-3 text-white">
          <div className="text-lg font-black">{model.edgeLabel}</div>
          {model.draw>30&&<div className="text-xs text-slate-300 mt-0.5">High draw probability</div>}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[{label:teamA.name,val:model.winA,color:NAV},{label:"Draw",val:model.draw,color:"#94a3b8"},{label:teamB.name,val:model.lossA,color:ACC}].map(({label,val,color})=>(
            <div key={label} className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 truncate">{label}</div>
              <div className="text-xl font-black" style={{color}}>{val}%</div>
            </div>
          ))}
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex mb-3">
          <div className="h-full" style={{width:`${model.winA}%`,backgroundColor:NAV}}/>
          <div className="h-full bg-slate-300" style={{width:`${model.draw}%`}}/>
          <div className="h-full" style={{width:`${model.lossA}%`,backgroundColor:ACC}}/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">Projected Score</div>
            <div className="text-base font-black text-[#031635]">{model.projA} – {model.projB}</div>
            <div className="text-[10px] text-slate-400">{teamA.name} – {teamB.name}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">Confidence</div>
            <div className="text-base font-black text-[#031635]">{model.confidence}%</div>
            <StatBar value={model.confidence}/>
          </div>
        </div>

        {/* Market Value Analysis — Polymarket primary, ESPN fallback */}
        {marketValue ? (
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wide text-violet-600">
                Market Value
              </span>
              <span className="text-[9px] text-slate-400 font-medium">
                {marketValue.source === "polymarket" ? "Polymarket" : "ESPN Odds"}
              </span>
            </div>
            {/* Header row */}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1 px-1">
              <span></span>
              <span className="text-center truncate">{teamA.name}</span>
              <span className="text-center">Draw</span>
              <span className="text-center truncate">{teamB.name}</span>
            </div>
            {/* Model row */}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-0.5 items-center mb-0.5 px-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">Model</span>
              <span className="text-center text-[11px] font-black text-[#031635]">{model.winA}%</span>
              <span className="text-center text-[11px] font-black text-slate-500">{model.draw}%</span>
              <span className="text-center text-[11px] font-black" style={{color:ACC}}>{model.lossA}%</span>
            </div>
            {/* Market row */}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-0.5 items-center mb-1 px-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">Market</span>
              <span className="text-center text-[11px] font-semibold text-slate-600">{marketValue.team1.marketProbability}%</span>
              <span className="text-center text-[11px] font-semibold text-slate-500">{marketValue.draw.marketProbability}%</span>
              <span className="text-center text-[11px] font-semibold text-slate-600">{marketValue.team2.marketProbability}%</span>
            </div>
            {/* Divider */}
            <div className="h-px bg-violet-100 mx-1 mb-1" />
            {/* Value row */}
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-0.5 items-center px-1">
              <span className="text-[9px] font-black uppercase tracking-wide text-violet-500 whitespace-nowrap">Value</span>
              {([
                { v: marketValue.team1, best: bestValueOutcome(marketValue) === "team1" },
                { v: marketValue.draw,  best: bestValueOutcome(marketValue) === "draw" },
                { v: marketValue.team2, best: bestValueOutcome(marketValue) === "team2" },
              ] as const).map(({ v, best }, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className={`text-[11px] font-black ${
                    v.valueEdge > 0 ? "text-emerald-600" : v.valueEdge < 0 ? "text-red-500" : "text-slate-400"
                  }`}>
                    {formatEdge(v.valueEdge)}
                  </span>
                  {best && v.valueEdge >= 2 && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[8px] font-black text-emerald-700 leading-none whitespace-nowrap">
                      Best
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-400">
            Polymarket prices are not available for this matchup yet. Check back closer to kickoff.
          </div>
        )}

        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-slate-600">
          ⚠ "Slight/Moderate/Strong edge" reflects model probability, not certainty. Soccer results are inherently unpredictable.
        </div>
      </Card>

      {/* Pre-tournament ratings */}
      <Card>
        <SectionHeader title="Pre-Tournament Ratings" />
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2"><span>{teamA.name}</span><span>{teamB.name}</span></div>
        <CompBar valA={teamA.powerScore} valB={teamB.powerScore} label="Overall" tip="Composite pre-tournament rating (0–100)." fmt={v=>v.toFixed(0)}/>
        <CompBar valA={teamA.attack} valB={teamB.attack} label="ATK" tip="Attacking rating from qualifying campaign." fmt={v=>v.toFixed(0)}/>
        <CompBar valA={teamA.defense} valB={teamB.defense} label="DEF" tip="Defensive rating from qualifying campaign." fmt={v=>v.toFixed(0)}/>
        <CompBar valA={teamA.form} valB={teamB.form} label="Form" tip="Form over last 10 matches before tournament." fmt={v=>v.toFixed(0)}/>
        <div className="mt-3 text-[10px] text-slate-400">GK rating: N/A (no separate goalkeeper data source)</div>
      </Card>

      {/* Group stage performance */}
      {(sA.gamesPlayed>0||sB.gamesPlayed>0)&&(
        <Card>
          <SectionHeader title="Group-Stage Performance" subtitle="Per-match averages · ↓ lower is better for defensive metrics"/>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-1.5"><Flag code={teamA.code} size={18}/><span className="text-xs font-bold text-slate-700">{teamA.name} <span className="text-slate-400 font-normal">({sA.gamesPlayed}GP)</span></span></div>
            <div className="flex items-center gap-1.5"><span className="text-xs font-bold text-slate-700 text-right">{teamB.name} <span className="text-slate-400 font-normal">({sB.gamesPlayed}GP)</span></span><Flag code={teamB.code} size={18}/></div>
          </div>
          <CompBar valA={sA.points} valB={sB.points} label="Pts/Gm" tip="Points per match (3=W, 1=D, 0=L)." codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.goalsFor} valB={sB.goalsFor} label="GF/Gm" tip="Goals scored per match." codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.goalsAgainst} valB={sB.goalsAgainst} higherIsBetter={false} label="GA/Gm ↓" tip="Goals conceded per match. Lower is better." codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.xgFor} valB={sB.xgFor} label="xGF/Gm" tip="Expected goals for per match. [MODELED]" codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.xgAgainst} valB={sB.xgAgainst} higherIsBetter={false} label="xGA/Gm ↓" tip="Expected goals against per match. [MODELED]" codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.xgDiff} valB={sB.xgDiff} label="xGD/Gm" tip="xG differential per match." codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.shotsFor} valB={sB.shotsFor} label="Shots/Gm" tip="Shots attempted per match." codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.possession} valB={sB.possession} label="Poss%" tip="Average possession percentage." fmt={v=>v.toFixed(1)+"%"} codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.savePercent} valB={sB.savePercent} label="Save%" tip="Goalkeeper save percentage." fmt={v=>v.toFixed(1)+"%"} codeA={teamA.code} codeB={teamB.code}/>
          <CompBar valA={sA.cleanSheetRate} valB={sB.cleanSheetRate} label="CS%" tip="Clean sheet rate." fmt={v=>v.toFixed(0)+"%"} codeA={teamA.code} codeB={teamB.code}/>
        </Card>
      )}

      {/* SOS */}
      <Card>
        <SectionHeader title="Strength of Schedule" subtitle="70% pre-tournament opponent rating · 30% live form · leave-one-out"/>
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2"><span>{teamA.name}</span><span>{teamB.name}</span></div>
        <CompBar valA={sosA.sosScore} valB={sosB.sosScore} label="SOS Score" tip="Blended opponent quality score (0–100)." fmt={v=>v.toFixed(1)}/>
        <CompBar valA={sosA.opponentAvgAttack} valB={sosB.opponentAvgAttack} label="Opp ATK" tip="Avg attacking rating of opponents faced." fmt={v=>v.toFixed(1)}/>
        <CompBar valA={sosA.opponentAvgDefense} valB={sosB.opponentAvgDefense} label="Opp DEF" tip="Avg defensive rating of opponents faced." fmt={v=>v.toFixed(1)}/>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          {[{team:teamA,sos:sosA},{team:teamB,sos:sosB}].map(({team,sos},i)=>(
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-slate-600">
              <Flag code={team.code} size={12}/> <strong>{team.name}</strong>
              <div className="mt-1">Best opp: <strong>{sos.bestOpponent}</strong></div>
              <div>Weakest: <strong>{sos.weakestOpponent}</strong></div>
              <div>SOS: <strong style={{color:i===0?NAV:ACC}}>{sos.sosScore}</strong></div>
            </div>
          ))}
        </div>
      </Card>

      {/* Expectation */}
      <Card>
        <SectionHeader title="Performance vs Expectation" subtitle="▲ outperformed · ▼ underperformed vs pre-tournament rating model"/>
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2"><span>{teamA.name}</span><span>{teamB.name}</span></div>
        {[
          {label:"Pts over xPts",vA:eA.pointsOverExpectation,vB:eB.pointsOverExpectation,tip:"Actual points minus model-expected points."},
          {label:"Goals over xG",vA:eA.goalsOverExpectation,vB:eB.goalsOverExpectation,tip:"Actual goals minus expected goals (xG)."},
          {label:"Goals prevented",vA:eA.goalsPreventedVsExpectation,vB:eB.goalsPreventedVsExpectation,tip:"Positive = conceded fewer than opponent xG predicted."},
          {label:"GD over xGD",vA:eA.goalDifferenceOverExpectation,vB:eB.goalDifferenceOverExpectation,tip:"Goal differential vs expected goal differential."},
        ].map(({label,vA,vB,tip})=>(
          <div key={label} className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
            <Delta val={vA}/>
            <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 cursor-help" title={tip}>{label}</div>
            <div className="text-right"><Delta val={vB}/></div>
          </div>
        ))}
      </Card>

      {/* Style matchup */}
      <Card>
        <SectionHeader title="Style Matchup"/>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {[{team:teamA,stats:sA,color:NAV},{team:teamB,stats:sB,color:ACC}].map(({team,stats,color},i)=>(
            <div key={i} className="rounded-xl border p-3" style={{borderColor:color}}>
              <Flag code={team.code} size={14}/> <strong className="text-xs">{team.name}</strong>
              <div className="text-[11px] font-bold mt-1" style={{color}}>{styleTag(stats)}</div>
              <div className="mt-1 text-[11px] text-slate-500 space-y-0.5">
                <div>Poss: {stats.possession.toFixed(1)}%</div>
                <div>xGF: {stats.xgFor.toFixed(2)} · xGA: {stats.xgAgainst.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 text-xs">
          {[
            {label:`${teamA.name} ATK vs ${teamB.name} DEF`,diff:teamA.attack-teamB.defense},
            {label:`${teamB.name} ATK vs ${teamA.name} DEF`,diff:teamB.attack-teamA.defense},
          ].map(({label,diff})=>(
            <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="font-bold text-slate-600">{label}</div>
              <div className="text-slate-500">{diff>15?"Strong mismatch favoring attacker":diff>8?"Moderate attacker advantage":diff>2?"Slight attacker advantage":diff<-8?"Defense has the edge":"Evenly matched"}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Common opponents */}
      {common.length>0&&(
        <Card>
          <SectionHeader title="Common Opponents" subtitle="Head-to-head performance vs shared opponents — key equalizer metric when SOS is identical"/>
          <div className="space-y-3">
            {common.map(opp=>{
              const mA = teamMatches(teamA.name).find(m=>(m.teamIsHome?m.awayTeam:m.homeTeam)===opp);
              const mB = teamMatches(teamB.name).find(m=>(m.teamIsHome?m.awayTeam:m.homeTeam)===opp);
              if(!mA||!mB) return null;
              const oppT = ALL_TEAMS.find(t=>t.name===opp);

              const stat = (m: typeof mA & {teamIsHome:boolean}) => ({
                gf:  m.teamIsHome?m.homeGoals:m.awayGoals,
                ga:  m.teamIsHome?m.awayGoals:m.homeGoals,
                xgf: m.teamIsHome?m.homeXg:m.awayXg,
                xga: m.teamIsHome?m.awayXg:m.homeXg,
                pos: m.teamIsHome?m.homePossession:m.awayPossession,
              });
              const sA2 = stat(mA); const sB2 = stat(mB);
              const gdA = sA2.gf-sA2.ga; const gdB = sB2.gf-sB2.ga;

              const metric = (labelA:string, vA:number, vB:number, labelB:string, higherBetter=true, fmt=(v:number)=>v.toFixed(2)) => {
                const advA = higherBetter?vA>vB:vA<vB;
                const advB = higherBetter?vB>vA:vA>vB;
                return (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[11px]">
                    <span className={`text-right font-bold tabular-nums ${advA?"text-emerald-600":advB?"text-slate-400":"text-slate-600"}`}>{fmt(vA)}{advA?" ✓":""}</span>
                    <span className="text-center text-[10px] text-slate-400 whitespace-nowrap px-1">{labelA}</span>
                    <span className={`font-bold tabular-nums ${advB?"text-emerald-600":advA?"text-slate-400":"text-slate-600"}`}>{fmt(vB)}{advB?" ✓":""}</span>
                  </div>
                );
              };

              return (
                <div key={opp} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    {oppT&&<Flag code={oppT.code} size={14}/>}
                    <span className="text-xs font-black text-slate-700">vs {opp}</span>
                    <span className="ml-auto text-[10px] text-slate-400">Pre-rating: {oppT?.powerScore}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1"><Flag code={teamA.code} size={12}/>{teamA.name}</span>
                    <span className="flex items-center gap-1">{teamB.name}<Flag code={teamB.code} size={12}/></span>
                  </div>
                  <div className="space-y-0.5">
                    {metric("Score", gdA, gdB, "", true, v=>`${v>=0?"+":""}${v} GD`)}
                    {metric("xGF",   sA2.xgf, sB2.xgf, "", true)}
                    {metric("xGA",   sA2.xga, sB2.xga, "", false)}
                    {metric("Poss%", sA2.pos, sB2.pos, "", true, v=>v.toFixed(0)+"%")}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {common.length===0&&(
        <Card><SectionHeader title="Common Opponents"/><p className="text-xs text-slate-400 italic">Different groups — no shared group-stage opponents.</p></Card>
      )}

      {/* Tournament Results */}
      <Card>
        <SectionHeader title="Tournament Results" subtitle="Group-stage results — excludes direct matchup between these two teams"/>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0">
          {/* Headers */}
          <div className="flex items-center gap-1.5 mb-2">
            <Flag code={teamA.code} size={16}/>
            <span className="text-xs font-black text-slate-700">{teamA.name}</span>
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <Flag code={teamB.code} size={16}/>
            <span className="text-xs font-black text-slate-700">{teamB.name}</span>
          </div>
          {/* Results — both columns together so rows align by matchday */}
          {[teamA, teamB].map((team, col) => {
            const matches = teamMatches(team.name).filter(m => {
              const opp = m.teamIsHome?m.awayTeam:m.homeTeam;
              const other = team.name===teamA.name?teamB.name:teamA.name;
              return opp !== other;
            }).sort((a,b)=>a.matchday-b.matchday);
            return (
              <div key={team.name} className="space-y-1.5">
                {matches.length===0 ? (
                  <p className="text-[11px] text-slate-400 italic">No results yet</p>
                ) : matches.map((m, i) => {
                  const opp = m.teamIsHome?m.awayTeam:m.homeTeam;
                  const oppT = ALL_TEAMS.find(t=>t.name===opp);
                  const myG = m.teamIsHome?m.homeGoals:m.awayGoals;
                  const oppG = m.teamIsHome?m.awayGoals:m.homeGoals;
                  const outcome = myG>oppG?"W":myG===oppG?"D":"L";
                  const oc = outcome==="W"?"text-emerald-600 bg-emerald-50":"outcome"==="D"?"text-amber-600 bg-amber-50":"text-red-600 bg-red-50";
                  const outcomeColor = outcome==="W"?"text-emerald-600":outcome==="D"?"text-amber-500":"text-red-600";
                  return (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px]">
                      <span className="text-[9px] font-bold text-slate-400 shrink-0">{mdLabel(m.matchday)}</span>
                      <span className={`font-black shrink-0 ${outcomeColor}`}>{outcome}</span>
                      <span className="text-slate-500 truncate flex items-center gap-0.5 min-w-0">
                        {oppT&&<Flag code={oppT.code} size={10}/>}
                        <span className="truncate">{opp}</span>
                      </span>
                      <span className="font-black text-slate-800 tabular-nums shrink-0 ml-auto">{myG}–{oppG}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {h2h&&(
          <div className="mt-4 rounded-xl border border-slate-200 bg-[#031635]/5 p-3">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">Head-to-Head · Group {h2h.group} · {mdLabel(h2h.matchday)}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5"><Flag code={teamA.code} size={16}/><span className="text-sm font-black text-[#031635]">{h2h.homeTeam===teamA.name?h2h.homeGoals:h2h.awayGoals}</span></div>
              <span className="text-[11px] text-slate-400 font-semibold">–</span>
              <div className="flex items-center gap-1.5"><span className="text-sm font-black text-[#031635]">{h2h.homeTeam===teamB.name?h2h.homeGoals:h2h.awayGoals}</span><Flag code={teamB.code} size={16}/></div>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>xG: {h2h.homeTeam===teamA.name?h2h.homeXg:h2h.awayXg}</span>
              <span>xG: {h2h.homeTeam===teamB.name?h2h.homeXg:h2h.awayXg}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Model summary */}
      <Card className="border-2 border-[#031635]">
        <SectionHeader title="Model Summary"/>
        <div className="rounded-xl bg-[#031635] px-4 py-3 text-white mb-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Most Likely Outcome</div>
          <div className="text-xl font-black">{model.winA>45?`${teamA.name} win`:model.lossA>45?`${teamB.name} win`:model.draw>32?"Draw likely":"Tight contest"}</div>
          <div className="mt-1 text-sm text-slate-300">Projected: {teamA.name} {model.projA} – {model.projB} {teamB.name}</div>
        </div>
        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex gap-2"><span className="text-emerald-500 font-bold">▲</span><span>Over-performance: <strong>{teamA.name}</strong> {eA.pointsOverExpectation>=0?"+":""}{eA.pointsOverExpectation} pts · <strong>{teamB.name}</strong> {eB.pointsOverExpectation>=0?"+":""}{eB.pointsOverExpectation} pts</span></div>
          <div className="flex gap-2"><span className="text-amber-500 font-bold">⚠</span><span>Confidence: <strong>{model.confidence}%</strong>. {model.confidence<60?"High uncertainty — treat as toss-up.":"Moderate confidence in directional outcome."}</span></div>
        </div>
      </Card>

      {/* Methodology */}
      <Card className="border-amber-200 bg-amber-50">
        <SectionHeader title="Methodology"/>
        <div className="space-y-2 text-[11px] text-slate-700 leading-relaxed">
          <div><strong>Ratings:</strong> powerScore/attack/defense/form from site's existing team data.</div>
          <div><strong>Match data [MODELED]:</strong> Goals, xG, shots, possession are modeled estimates consistent with bracket outcomes. Not live tracked data.</div>
          <div><strong>Model:</strong> Draw-adjusted logistic · P(win)=1/(1+10^(-diff/20)) · Draw pool=30%×exp(-|diff|/30) · Composite=40% pre-rating + 35% live xGD/pts + 25% SOS.</div>
          <div><strong>SOS:</strong> 70% avg opponent pre-rating + 30% avg opponent live pts/match · leave-one-out applied.</div>
          <div><strong>Unavailable:</strong> GK ratings, set-piece breakdown, pass completion, full H2H history.</div>
        </div>
      </Card>
    </div>
  );
}
