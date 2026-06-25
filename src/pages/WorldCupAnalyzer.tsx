/**
 * WorldCupAnalyzer.tsx
 *
 * JoeKnowsBall World Cup 2026 Matchup Analyzer.
 * Builds on the same DISPLAY_GROUPS team data used in WorldCup2026.tsx.
 *
 * Data sources used:
 *   - powerScore / attack / defense / form / fifaRank: from WorldCup2026.tsx (pre-tournament composite)
 *   - GROUP_STAGE_MATCHES: added below — group-stage results with goals + xG per team
 *   - Strength-of-schedule: 70/30 blend of pre-tournament opponent rating + live opponent rating
 *   - Expected points: draw-adjusted logistic model documented in METHODOLOGY section
 *
 * What is unavailable (displayed as N/A):
 *   - Live goalkeeper ratings (no separate GK data source)
 *   - Set-piece goals/chances breakdown (not in source data)
 *   - Head-to-head historical records (no H2H data source)
 *   - Possession / pass completion (not in source data)
 */

import { useMemo, useState, useEffect } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { Link } from "react-router-dom";

// ─── Design tokens (JKB World Cup palette) ────────────────────────────────────
// Navy #031635 — primary brand
// Orange #e05c2e — accent
// Emerald for positive edges
// Slate for neutral
const NAV = "#031635";
const ACC = "#e05c2e";

// ─── Types ────────────────────────────────────────────────────────────────────

type Team = {
  name: string;
  code: string;
  group: string;
  powerScore: number; // 0–100 pre-tournament composite
  attack: number;     // 0–100
  defense: number;    // 0–100
  form: number;       // 0–100
  fifaRank: number;
};

type GroupMatch = {
  group: string;
  homeTeam: string; // matches Team.name
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homePossession: number; // 0–100
  awayPossession: number;
  // derived
  result: "home" | "away" | "draw";
};

type TeamExpectationMetrics = {
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

// ─── Pre-tournament team data (sourced from WorldCup2026.tsx DISPLAY_GROUPS) ──
// Deduplicated to one canonical entry per team.
// The raw data on WorldCup2026.tsx has some minor inconsistencies (duplicate entries
// for the same country) — we use the DISPLAY_GROUPS as the authoritative source.

const ALL_TEAMS: Team[] = [
  // Group A
  { name: "Mexico",        code: "mx",     group: "A", powerScore: 74, attack: 72, defense: 71, form: 74, fifaRank: 14 },
  { name: "Korea Rep.",    code: "kr",     group: "A", powerScore: 62, attack: 63, defense: 61, form: 62, fifaRank: 22 },
  { name: "Czechia",       code: "cz",     group: "A", powerScore: 61, attack: 60, defense: 62, form: 60, fifaRank: 27 },
  { name: "South Africa",  code: "za",     group: "A", powerScore: 48, attack: 47, defense: 50, form: 47, fifaRank: 45 },
  // Group B
  { name: "Canada",        code: "ca",     group: "B", powerScore: 71, attack: 70, defense: 70, form: 72, fifaRank: 13 },
  { name: "Switzerland",   code: "ch",     group: "B", powerScore: 67, attack: 64, defense: 71, form: 65, fifaRank: 13 },
  { name: "Bosnia & Herz", code: "ba",     group: "B", powerScore: 55, attack: 54, defense: 56, form: 54, fifaRank: 48 },
  { name: "Qatar",         code: "qa",     group: "B", powerScore: 44, attack: 43, defense: 46, form: 43, fifaRank: 37 },
  // Group C
  { name: "Brazil",        code: "br",     group: "C", powerScore: 93, attack: 91, defense: 88, form: 94, fifaRank: 1 },
  { name: "Morocco",       code: "ma",     group: "C", powerScore: 65, attack: 62, defense: 68, form: 64, fifaRank: 15 },
  { name: "Scotland",      code: "gb-sct", group: "C", powerScore: 63, attack: 64, defense: 62, form: 61, fifaRank: 29 },
  { name: "Haiti",         code: "ht",     group: "C", powerScore: 31, attack: 30, defense: 33, form: 29, fifaRank: 101 },
  // Group D
  { name: "USA",           code: "us",     group: "D", powerScore: 73, attack: 70, defense: 72, form: 74, fifaRank: 11 },
  { name: "Türkiye",       code: "tr",     group: "D", powerScore: 68, attack: 67, defense: 65, form: 69, fifaRank: 19 },
  { name: "Paraguay",      code: "py",     group: "D", powerScore: 58, attack: 57, defense: 59, form: 58, fifaRank: 32 },
  { name: "Australia",     code: "au",     group: "D", powerScore: 57, attack: 56, defense: 58, form: 56, fifaRank: 23 },
  // Group E
  { name: "Germany",       code: "de",     group: "E", powerScore: 82, attack: 83, defense: 80, form: 79, fifaRank: 5 },
  { name: "Côte d'Ivoire", code: "ci",     group: "E", powerScore: 65, attack: 66, defense: 63, form: 64, fifaRank: 28 },
  { name: "Ecuador",       code: "ec",     group: "E", powerScore: 61, attack: 62, defense: 59, form: 60, fifaRank: 35 },
  { name: "Curaçao",       code: "cw",     group: "E", powerScore: 38, attack: 37, defense: 39, form: 37, fifaRank: 80 },
  // Group F
  { name: "Netherlands",   code: "nl",     group: "F", powerScore: 79, attack: 78, defense: 76, form: 80, fifaRank: 6 },
  { name: "Japan",         code: "jp",     group: "F", powerScore: 64, attack: 63, defense: 65, form: 65, fifaRank: 17 },
  { name: "Sweden",        code: "se",     group: "F", powerScore: 61, attack: 62, defense: 63, form: 59, fifaRank: 21 },
  { name: "Tunisia",       code: "tn",     group: "F", powerScore: 55, attack: 54, defense: 57, form: 53, fifaRank: 26 },
  // Group G
  { name: "Belgium",       code: "be",     group: "G", powerScore: 76, attack: 77, defense: 73, form: 74, fifaRank: 9 },
  { name: "IR Iran",       code: "ir",     group: "G", powerScore: 60, attack: 58, defense: 62, form: 59, fifaRank: 25 },
  { name: "Egypt",         code: "eg",     group: "G", powerScore: 59, attack: 57, defense: 61, form: 57, fifaRank: 34 },
  { name: "New Zealand",   code: "nz",     group: "G", powerScore: 44, attack: 43, defense: 46, form: 43, fifaRank: 93 },
  // Group H
  { name: "Spain",         code: "es",     group: "H", powerScore: 91, attack: 89, defense: 86, form: 92, fifaRank: 8 },
  { name: "Uruguay",       code: "uy",     group: "H", powerScore: 65, attack: 67, defense: 64, form: 63, fifaRank: 18 },
  { name: "Saudi Arabia",  code: "sa",     group: "H", powerScore: 54, attack: 52, defense: 57, form: 53, fifaRank: 40 },
  { name: "Cabo Verde",    code: "cv",     group: "H", powerScore: 43, attack: 42, defense: 45, form: 42, fifaRank: 62 },
  // Group I
  { name: "France",        code: "fr",     group: "I", powerScore: 89, attack: 88, defense: 87, form: 87, fifaRank: 3 },
  { name: "Norway",        code: "no",     group: "I", powerScore: 70, attack: 74, defense: 67, form: 72, fifaRank: 12 },
  { name: "Senegal",       code: "sn",     group: "I", powerScore: 67, attack: 65, defense: 66, form: 68, fifaRank: 20 },
  { name: "Iraq",          code: "iq",     group: "I", powerScore: 47, attack: 46, defense: 48, form: 46, fifaRank: 58 },
  // Group J
  { name: "Argentina",     code: "ar",     group: "J", powerScore: 90, attack: 92, defense: 84, form: 88, fifaRank: 2 },
  { name: "Austria",       code: "at",     group: "J", powerScore: 59, attack: 60, defense: 57, form: 58, fifaRank: 26 },
  { name: "Algeria",       code: "dz",     group: "J", powerScore: 60, attack: 59, defense: 61, form: 58, fifaRank: 30 },
  { name: "Jordan",        code: "jo",     group: "J", powerScore: 46, attack: 45, defense: 48, form: 45, fifaRank: 66 },
  // Group K
  { name: "Portugal",      code: "pt",     group: "K", powerScore: 83, attack: 86, defense: 77, form: 82, fifaRank: 7 },
  { name: "Colombia",      code: "co",     group: "K", powerScore: 72, attack: 73, defense: 68, form: 70, fifaRank: 10 },
  { name: "Uzbekistan",    code: "uz",     group: "K", powerScore: 52, attack: 51, defense: 53, form: 50, fifaRank: 68 },
  { name: "Congo DR",      code: "cd",     group: "K", powerScore: 49, attack: 48, defense: 51, form: 48, fifaRank: 54 },
  // Group L
  { name: "England",       code: "gb-eng", group: "L", powerScore: 80, attack: 81, defense: 78, form: 81, fifaRank: 4 },
  { name: "Croatia",       code: "hr",     group: "L", powerScore: 66, attack: 65, defense: 68, form: 65, fifaRank: 16 },
  { name: "Ghana",         code: "gh",     group: "L", powerScore: 57, attack: 56, defense: 58, form: 55, fifaRank: 51 },
  { name: "Panama",        code: "pa",     group: "L", powerScore: 51, attack: 49, defense: 53, form: 50, fifaRank: 43 },
];

// ─── Group-stage match results ─────────────────────────────────────────────────
// Source: simulated group-stage results consistent with bracket outcomes in WorldCup2026.tsx.
// xG values are estimated from shots/possession context.
// Marked [MODELED] for methodology disclosure.

const GROUP_MATCHES: GroupMatch[] = [
  // GROUP A — Mexico, Korea Rep., Czechia, South Africa
  { group:"A", homeTeam:"Mexico",      awayTeam:"South Africa", homeGoals:2, awayGoals:0, homeXg:2.1, awayXg:0.6, homeShots:15, awayShots:7,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:58, awayPossession:42, result:"home" },
  { group:"A", homeTeam:"Korea Rep.",  awayTeam:"Czechia",      homeGoals:1, awayGoals:1, homeXg:1.2, awayXg:1.3, homeShots:11, awayShots:12, homeShotsOnTarget:4, awayShotsOnTarget:4, homePossession:47, awayPossession:53, result:"draw" },
  { group:"A", homeTeam:"Mexico",      awayTeam:"Czechia",      homeGoals:2, awayGoals:1, homeXg:1.9, awayXg:1.1, homeShots:14, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:55, awayPossession:45, result:"home" },
  { group:"A", homeTeam:"Korea Rep.",  awayTeam:"South Africa", homeGoals:2, awayGoals:0, homeXg:1.8, awayXg:0.5, homeShots:13, awayShots:6,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:56, awayPossession:44, result:"home" },
  { group:"A", homeTeam:"Mexico",      awayTeam:"Korea Rep.",   homeGoals:1, awayGoals:2, homeXg:1.3, awayXg:1.7, homeShots:10, awayShots:13, homeShotsOnTarget:3, awayShotsOnTarget:5, homePossession:48, awayPossession:52, result:"away" },
  { group:"A", homeTeam:"Czechia",     awayTeam:"South Africa", homeGoals:2, awayGoals:0, homeXg:1.7, awayXg:0.5, homeShots:12, awayShots:5,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:60, awayPossession:40, result:"home" },

  // GROUP B — Canada, Switzerland, Bosnia & Herz, Qatar
  { group:"B", homeTeam:"Canada",       awayTeam:"Qatar",        homeGoals:3, awayGoals:0, homeXg:2.9, awayXg:0.4, homeShots:16, awayShots:5,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:63, awayPossession:37, result:"home" },
  { group:"B", homeTeam:"Switzerland",  awayTeam:"Bosnia & Herz",homeGoals:2, awayGoals:1, homeXg:2.2, awayXg:1.1, homeShots:14, awayShots:9,  homeShotsOnTarget:6, awayShotsOnTarget:3, homePossession:58, awayPossession:42, result:"home" },
  { group:"B", homeTeam:"Canada",       awayTeam:"Bosnia & Herz",homeGoals:2, awayGoals:1, homeXg:1.8, awayXg:1.2, homeShots:13, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:54, awayPossession:46, result:"home" },
  { group:"B", homeTeam:"Switzerland",  awayTeam:"Qatar",        homeGoals:3, awayGoals:1, homeXg:2.8, awayXg:0.7, homeShots:15, awayShots:6,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:62, awayPossession:38, result:"home" },
  { group:"B", homeTeam:"Canada",       awayTeam:"Switzerland",  homeGoals:1, awayGoals:1, homeXg:1.4, awayXg:1.5, homeShots:11, awayShots:12, homeShotsOnTarget:4, awayShotsOnTarget:4, homePossession:50, awayPossession:50, result:"draw" },
  { group:"B", homeTeam:"Bosnia & Herz",awayTeam:"Qatar",        homeGoals:2, awayGoals:0, homeXg:1.9, awayXg:0.5, homeShots:12, awayShots:5,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:56, awayPossession:44, result:"home" },

  // GROUP C — Brazil, Morocco, Scotland, Haiti
  { group:"C", homeTeam:"Brazil",   awayTeam:"Haiti",    homeGoals:4, awayGoals:0, homeXg:3.8, awayXg:0.3, homeShots:20, awayShots:4,  homeShotsOnTarget:9,  awayShotsOnTarget:1, homePossession:71, awayPossession:29, result:"home" },
  { group:"C", homeTeam:"Morocco",  awayTeam:"Scotland", homeGoals:1, awayGoals:0, homeXg:1.3, awayXg:0.9, homeShots:11, awayShots:10, homeShotsOnTarget:4, awayShotsOnTarget:3, homePossession:48, awayPossession:52, result:"home" },
  { group:"C", homeTeam:"Brazil",   awayTeam:"Scotland", homeGoals:3, awayGoals:0, homeXg:2.7, awayXg:0.5, homeShots:17, awayShots:6,  homeShotsOnTarget:7, awayShotsOnTarget:2, homePossession:66, awayPossession:34, result:"home" },
  { group:"C", homeTeam:"Morocco",  awayTeam:"Haiti",    homeGoals:2, awayGoals:0, homeXg:2.0, awayXg:0.4, homeShots:13, awayShots:4,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:59, awayPossession:41, result:"home" },
  { group:"C", homeTeam:"Brazil",   awayTeam:"Morocco",  homeGoals:2, awayGoals:1, homeXg:2.1, awayXg:1.0, homeShots:15, awayShots:9,  homeShotsOnTarget:6, awayShotsOnTarget:3, homePossession:63, awayPossession:37, result:"home" },
  { group:"C", homeTeam:"Scotland", awayTeam:"Haiti",    homeGoals:2, awayGoals:0, homeXg:1.8, awayXg:0.4, homeShots:12, awayShots:4,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:60, awayPossession:40, result:"home" },

  // GROUP D — USA, Türkiye, Paraguay, Australia
  { group:"D", homeTeam:"USA",      awayTeam:"Australia",homeGoals:2, awayGoals:0, homeXg:2.0, awayXg:0.7, homeShots:14, awayShots:8,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:57, awayPossession:43, result:"home" },
  { group:"D", homeTeam:"Türkiye",  awayTeam:"Paraguay", homeGoals:1, awayGoals:1, homeXg:1.4, awayXg:1.2, homeShots:11, awayShots:10, homeShotsOnTarget:4, awayShotsOnTarget:3, homePossession:52, awayPossession:48, result:"draw" },
  { group:"D", homeTeam:"USA",      awayTeam:"Paraguay", homeGoals:2, awayGoals:1, homeXg:1.9, awayXg:1.1, homeShots:13, awayShots:9,  homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:56, awayPossession:44, result:"home" },
  { group:"D", homeTeam:"Türkiye",  awayTeam:"Australia",homeGoals:2, awayGoals:0, homeXg:1.8, awayXg:0.6, homeShots:12, awayShots:7,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:55, awayPossession:45, result:"home" },
  { group:"D", homeTeam:"USA",      awayTeam:"Türkiye",  homeGoals:1, awayGoals:2, homeXg:1.5, awayXg:1.8, homeShots:11, awayShots:13, homeShotsOnTarget:4, awayShotsOnTarget:5, homePossession:49, awayPossession:51, result:"away" },
  { group:"D", homeTeam:"Paraguay", awayTeam:"Australia",homeGoals:1, awayGoals:1, homeXg:1.1, awayXg:1.0, homeShots:9,  awayShots:9,  homeShotsOnTarget:3, awayShotsOnTarget:3, homePossession:50, awayPossession:50, result:"draw" },

  // GROUP E — Germany, Côte d'Ivoire, Ecuador, Curaçao
  { group:"E", homeTeam:"Germany",       awayTeam:"Curaçao",       homeGoals:4, awayGoals:0, homeXg:3.6, awayXg:0.3, homeShots:19, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:70, awayPossession:30, result:"home" },
  { group:"E", homeTeam:"Côte d'Ivoire", awayTeam:"Ecuador",       homeGoals:2, awayGoals:1, homeXg:2.0, awayXg:1.1, homeShots:13, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:54, awayPossession:46, result:"home" },
  { group:"E", homeTeam:"Germany",       awayTeam:"Ecuador",       homeGoals:3, awayGoals:1, homeXg:2.8, awayXg:0.9, homeShots:16, awayShots:8,  homeShotsOnTarget:7, awayShotsOnTarget:2, homePossession:62, awayPossession:38, result:"home" },
  { group:"E", homeTeam:"Côte d'Ivoire", awayTeam:"Curaçao",       homeGoals:3, awayGoals:0, homeXg:2.5, awayXg:0.4, homeShots:14, awayShots:4,  homeShotsOnTarget:6, awayShotsOnTarget:1, homePossession:61, awayPossession:39, result:"home" },
  { group:"E", homeTeam:"Germany",       awayTeam:"Côte d'Ivoire", homeGoals:2, awayGoals:1, homeXg:1.8, awayXg:1.2, homeShots:13, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:59, awayPossession:41, result:"home" },
  { group:"E", homeTeam:"Ecuador",       awayTeam:"Curaçao",       homeGoals:2, awayGoals:0, homeXg:1.9, awayXg:0.4, homeShots:12, awayShots:4,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:58, awayPossession:42, result:"home" },

  // GROUP F — Netherlands, Japan, Sweden, Tunisia
  { group:"F", homeTeam:"Netherlands",awayTeam:"Tunisia",    homeGoals:3, awayGoals:0, homeXg:2.8, awayXg:0.5, homeShots:16, awayShots:5,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:64, awayPossession:36, result:"home" },
  { group:"F", homeTeam:"Japan",      awayTeam:"Sweden",     homeGoals:2, awayGoals:1, homeXg:1.9, awayXg:1.3, homeShots:13, awayShots:11, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:50, awayPossession:50, result:"home" },
  { group:"F", homeTeam:"Netherlands",awayTeam:"Sweden",     homeGoals:2, awayGoals:0, homeXg:2.1, awayXg:0.7, homeShots:14, awayShots:7,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:60, awayPossession:40, result:"home" },
  { group:"F", homeTeam:"Japan",      awayTeam:"Tunisia",    homeGoals:2, awayGoals:0, homeXg:1.8, awayXg:0.5, homeShots:12, awayShots:5,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:54, awayPossession:46, result:"home" },
  { group:"F", homeTeam:"Netherlands",awayTeam:"Japan",      homeGoals:1, awayGoals:1, homeXg:1.5, awayXg:1.4, homeShots:12, awayShots:11, homeShotsOnTarget:4, awayShotsOnTarget:4, homePossession:58, awayPossession:42, result:"draw" },
  { group:"F", homeTeam:"Sweden",     awayTeam:"Tunisia",    homeGoals:1, awayGoals:0, homeXg:1.2, awayXg:0.6, homeShots:10, awayShots:6,  homeShotsOnTarget:4, awayShotsOnTarget:2, homePossession:56, awayPossession:44, result:"home" },

  // GROUP G — Belgium, IR Iran, Egypt, New Zealand
  { group:"G", homeTeam:"Belgium",     awayTeam:"New Zealand",homeGoals:4, awayGoals:0, homeXg:3.5, awayXg:0.4, homeShots:18, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:67, awayPossession:33, result:"home" },
  { group:"G", homeTeam:"IR Iran",     awayTeam:"Egypt",      homeGoals:1, awayGoals:0, homeXg:1.2, awayXg:0.9, homeShots:10, awayShots:9,  homeShotsOnTarget:4, awayShotsOnTarget:3, homePossession:49, awayPossession:51, result:"home" },
  { group:"G", homeTeam:"Belgium",     awayTeam:"Egypt",      homeGoals:2, awayGoals:0, homeXg:2.2, awayXg:0.6, homeShots:14, awayShots:6,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:61, awayPossession:39, result:"home" },
  { group:"G", homeTeam:"IR Iran",     awayTeam:"New Zealand",homeGoals:2, awayGoals:0, homeXg:2.0, awayXg:0.5, homeShots:13, awayShots:5,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:55, awayPossession:45, result:"home" },
  { group:"G", homeTeam:"Belgium",     awayTeam:"IR Iran",    homeGoals:2, awayGoals:1, homeXg:1.9, awayXg:1.0, homeShots:13, awayShots:9,  homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:58, awayPossession:42, result:"home" },
  { group:"G", homeTeam:"Egypt",       awayTeam:"New Zealand",homeGoals:2, awayGoals:1, homeXg:1.7, awayXg:0.9, homeShots:12, awayShots:8,  homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:54, awayPossession:46, result:"home" },

  // GROUP H — Spain, Uruguay, Saudi Arabia, Cabo Verde
  { group:"H", homeTeam:"Spain",        awayTeam:"Cabo Verde",  homeGoals:4, awayGoals:0, homeXg:3.9, awayXg:0.3, homeShots:20, awayShots:4,  homeShotsOnTarget:9,  awayShotsOnTarget:1, homePossession:72, awayPossession:28, result:"home" },
  { group:"H", homeTeam:"Uruguay",      awayTeam:"Saudi Arabia",homeGoals:2, awayGoals:0, homeXg:2.1, awayXg:0.6, homeShots:14, awayShots:6,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:57, awayPossession:43, result:"home" },
  { group:"H", homeTeam:"Spain",        awayTeam:"Saudi Arabia",homeGoals:3, awayGoals:0, homeXg:2.8, awayXg:0.5, homeShots:17, awayShots:5,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:69, awayPossession:31, result:"home" },
  { group:"H", homeTeam:"Uruguay",      awayTeam:"Cabo Verde",  homeGoals:3, awayGoals:1, homeXg:2.5, awayXg:0.7, homeShots:15, awayShots:7,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:60, awayPossession:40, result:"home" },
  { group:"H", homeTeam:"Spain",        awayTeam:"Uruguay",     homeGoals:2, awayGoals:1, homeXg:2.0, awayXg:1.2, homeShots:14, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:64, awayPossession:36, result:"home" },
  { group:"H", homeTeam:"Saudi Arabia", awayTeam:"Cabo Verde",  homeGoals:1, awayGoals:1, homeXg:1.2, awayXg:0.9, homeShots:9,  awayShots:8,  homeShotsOnTarget:3, awayShotsOnTarget:3, homePossession:51, awayPossession:49, result:"draw" },

  // GROUP I — France, Norway, Senegal, Iraq
  { group:"I", homeTeam:"France",  awayTeam:"Iraq",    homeGoals:4, awayGoals:0, homeXg:3.7, awayXg:0.4, homeShots:19, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:70, awayPossession:30, result:"home" },
  { group:"I", homeTeam:"Norway",  awayTeam:"Senegal", homeGoals:2, awayGoals:1, homeXg:2.1, awayXg:1.2, homeShots:14, awayShots:10, homeShotsOnTarget:6, awayShotsOnTarget:4, homePossession:54, awayPossession:46, result:"home" },
  { group:"I", homeTeam:"France",  awayTeam:"Senegal", homeGoals:2, awayGoals:0, homeXg:2.2, awayXg:0.6, homeShots:15, awayShots:6,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:66, awayPossession:34, result:"home" },
  { group:"I", homeTeam:"Norway",  awayTeam:"Iraq",    homeGoals:3, awayGoals:0, homeXg:2.6, awayXg:0.4, homeShots:15, awayShots:4,  homeShotsOnTarget:6, awayShotsOnTarget:1, homePossession:61, awayPossession:39, result:"home" },
  { group:"I", homeTeam:"France",  awayTeam:"Norway",  homeGoals:2, awayGoals:1, homeXg:2.0, awayXg:1.3, homeShots:14, awayShots:11, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:60, awayPossession:40, result:"home" },
  { group:"I", homeTeam:"Senegal", awayTeam:"Iraq",    homeGoals:2, awayGoals:0, homeXg:1.8, awayXg:0.5, homeShots:12, awayShots:5,  homeShotsOnTarget:5, awayShotsOnTarget:1, homePossession:57, awayPossession:43, result:"home" },

  // GROUP J — Argentina, Austria, Algeria, Jordan
  { group:"J", homeTeam:"Argentina",awayTeam:"Jordan",  homeGoals:4, awayGoals:0, homeXg:3.5, awayXg:0.4, homeShots:18, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:68, awayPossession:32, result:"home" },
  { group:"J", homeTeam:"Austria",  awayTeam:"Algeria", homeGoals:1, awayGoals:1, homeXg:1.3, awayXg:1.3, homeShots:10, awayShots:11, homeShotsOnTarget:3, awayShotsOnTarget:4, homePossession:49, awayPossession:51, result:"draw" },
  { group:"J", homeTeam:"Argentina",awayTeam:"Algeria", homeGoals:3, awayGoals:0, homeXg:2.7, awayXg:0.5, homeShots:16, awayShots:5,  homeShotsOnTarget:6, awayShotsOnTarget:1, homePossession:65, awayPossession:35, result:"home" },
  { group:"J", homeTeam:"Austria",  awayTeam:"Jordan",  homeGoals:3, awayGoals:0, homeXg:2.4, awayXg:0.4, homeShots:14, awayShots:4,  homeShotsOnTarget:6, awayShotsOnTarget:1, homePossession:62, awayPossession:38, result:"home" },
  { group:"J", homeTeam:"Argentina",awayTeam:"Austria", homeGoals:2, awayGoals:1, homeXg:2.0, awayXg:1.1, homeShots:14, awayShots:9,  homeShotsOnTarget:5, awayShotsOnTarget:3, homePossession:61, awayPossession:39, result:"home" },
  { group:"J", homeTeam:"Algeria",  awayTeam:"Jordan",  homeGoals:1, awayGoals:0, homeXg:1.3, awayXg:0.6, homeShots:10, awayShots:6,  homeShotsOnTarget:4, awayShotsOnTarget:2, homePossession:55, awayPossession:45, result:"home" },

  // GROUP K — Portugal, Colombia, Uzbekistan, Congo DR
  { group:"K", homeTeam:"Portugal",  awayTeam:"Congo DR",   homeGoals:4, awayGoals:0, homeXg:3.6, awayXg:0.4, homeShots:18, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:68, awayPossession:32, result:"home" },
  { group:"K", homeTeam:"Colombia",  awayTeam:"Uzbekistan", homeGoals:2, awayGoals:0, homeXg:2.0, awayXg:0.6, homeShots:13, awayShots:6,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:58, awayPossession:42, result:"home" },
  { group:"K", homeTeam:"Portugal",  awayTeam:"Uzbekistan", homeGoals:3, awayGoals:0, homeXg:2.9, awayXg:0.5, homeShots:16, awayShots:5,  homeShotsOnTarget:7, awayShotsOnTarget:1, homePossession:65, awayPossession:35, result:"home" },
  { group:"K", homeTeam:"Colombia",  awayTeam:"Congo DR",   homeGoals:3, awayGoals:1, homeXg:2.5, awayXg:0.8, homeShots:15, awayShots:7,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:60, awayPossession:40, result:"home" },
  { group:"K", homeTeam:"Portugal",  awayTeam:"Colombia",   homeGoals:2, awayGoals:1, homeXg:2.1, awayXg:1.2, homeShots:14, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:62, awayPossession:38, result:"home" },
  { group:"K", homeTeam:"Uzbekistan",awayTeam:"Congo DR",   homeGoals:1, awayGoals:1, homeXg:1.2, awayXg:1.0, homeShots:9,  awayShots:9,  homeShotsOnTarget:3, awayShotsOnTarget:3, homePossession:51, awayPossession:49, result:"draw" },

  // GROUP L — England, Croatia, Ghana, Panama
  { group:"L", homeTeam:"England", awayTeam:"Panama", homeGoals:4, awayGoals:0, homeXg:3.5, awayXg:0.4, homeShots:18, awayShots:4,  homeShotsOnTarget:8, awayShotsOnTarget:1, homePossession:66, awayPossession:34, result:"home" },
  { group:"L", homeTeam:"Croatia", awayTeam:"Ghana",  homeGoals:2, awayGoals:1, homeXg:1.9, awayXg:1.2, homeShots:13, awayShots:10, homeShotsOnTarget:5, awayShotsOnTarget:4, homePossession:55, awayPossession:45, result:"home" },
  { group:"L", homeTeam:"England", awayTeam:"Ghana",  homeGoals:2, awayGoals:0, homeXg:2.1, awayXg:0.6, homeShots:14, awayShots:6,  homeShotsOnTarget:5, awayShotsOnTarget:2, homePossession:62, awayPossession:38, result:"home" },
  { group:"L", homeTeam:"Croatia", awayTeam:"Panama", homeGoals:3, awayGoals:1, homeXg:2.6, awayXg:0.7, homeShots:15, awayShots:7,  homeShotsOnTarget:6, awayShotsOnTarget:2, homePossession:59, awayPossession:41, result:"home" },
  { group:"L", homeTeam:"England", awayTeam:"Croatia",homeGoals:1, awayGoals:1, homeXg:1.4, awayXg:1.3, homeShots:11, awayShots:11, homeShotsOnTarget:4, awayShotsOnTarget:4, homePossession:55, awayPossession:45, result:"draw" },
  { group:"L", homeTeam:"Ghana",   awayTeam:"Panama", homeGoals:1, awayGoals:0, homeXg:1.2, awayXg:0.7, homeShots:9,  awayShots:7,  homeShotsOnTarget:3, awayShotsOnTarget:2, homePossession:52, awayPossession:48, result:"home" },
];

// ─── Model helpers ─────────────────────────────────────────────────────────────

/** Normalize a 0–100 pre-tournament power score to a display score */
function normalizePreTournamentRating(team: Team): number {
  return team.powerScore; // already 0–100 by construction
}

/**
 * Draw-adjusted logistic model.
 * ratingDiff → expected win/draw/loss probabilities.
 * Base model: P(win) = 1 / (1 + 10^(-diff/20))
 * Draw pool: in international soccer ~25% of matches end in draws.
 * We allocate draw probability proportional to closeness, then redistribute.
 */
function expectedProbabilities(teamRating: number, oppRating: number): { win: number; draw: number; loss: number } {
  const diff = teamRating - oppRating;
  const rawWin = 1 / (1 + Math.pow(10, -diff / 20));
  // Draw probability: max at 0 diff (~30%), decreasing as diff increases
  const drawBase = 0.30 * Math.exp(-Math.abs(diff) / 30);
  const win  = rawWin  * (1 - drawBase);
  const loss = (1 - rawWin) * (1 - drawBase);
  return { win, draw: drawBase, loss };
}

/** Expected points from rating-based probabilities */
function expectedPoints(teamRating: number, oppRating: number): number {
  const { win, draw } = expectedProbabilities(teamRating, oppRating);
  return 3 * win + 1 * draw;
}

/** Get all group-stage matches for a given team name */
function teamMatches(teamName: string): (GroupMatch & { teamIsHome: boolean })[] {
  return GROUP_MATCHES
    .filter(m => m.homeTeam === teamName || m.awayTeam === teamName)
    .map(m => ({ ...m, teamIsHome: m.homeTeam === teamName }));
}

/** Per-match aggregated stats for a team */
function computePerMatchStats(teamName: string): PerMatchStats {
  const matches = teamMatches(teamName);
  if (matches.length === 0) {
    return { gamesPlayed:0, points:0, goalsFor:0, goalsAgainst:0, goalDiff:0, xgFor:0, xgAgainst:0, xgDiff:0, shotsFor:0, shotsAgainst:0, shotsOnTargetFor:0, shotsOnTargetAgainst:0, possession:50, savePercent:0, cleanSheetRate:0 };
  }
  let pts=0, gf=0, ga=0, xgf=0, xga=0, sf=0, sa=0, sotf=0, sota=0, poss=0, cleanSheets=0;
  for (const m of matches) {
    const myG  = m.teamIsHome ? m.homeGoals  : m.awayGoals;
    const oppG = m.teamIsHome ? m.awayGoals  : m.homeGoals;
    const myXg = m.teamIsHome ? m.homeXg     : m.awayXg;
    const oppXg= m.teamIsHome ? m.awayXg     : m.homeXg;
    const myS  = m.teamIsHome ? m.homeShots  : m.awayShots;
    const oppS = m.teamIsHome ? m.awayShots  : m.homeShots;
    const mySOT= m.teamIsHome ? m.homeShotsOnTarget : m.awayShotsOnTarget;
    const oppSOT=m.teamIsHome ? m.awayShotsOnTarget : m.homeShotsOnTarget;
    const myPos= m.teamIsHome ? m.homePossession  : m.awayPossession;
    gf += myG; ga += oppG; xgf += myXg; xga += oppXg;
    sf += myS; sa += oppS; sotf += mySOT; sota += oppSOT; poss += myPos;
    if (oppG === 0) cleanSheets++;
    pts += myG > oppG ? 3 : myG === oppG ? 1 : 0;
  }
  const n = matches.length;
  const savePercent = sota > 0 ? ((sota - ga) / sota) * 100 : 100;
  return {
    gamesPlayed: n,
    points: pts / n,
    goalsFor: gf / n,
    goalsAgainst: ga / n,
    goalDiff: (gf - ga) / n,
    xgFor: xgf / n,
    xgAgainst: xga / n,
    xgDiff: (xgf - xga) / n,
    shotsFor: sf / n,
    shotsAgainst: sa / n,
    shotsOnTargetFor: sotf / n,
    shotsOnTargetAgainst: sota / n,
    possession: poss / n,
    savePercent,
    cleanSheetRate: (cleanSheets / n) * 100,
  };
}

/** Compute expectation metrics vs pre-tournament ratings */
function computeExpectationMetrics(teamName: string): TeamExpectationMetrics {
  const team = ALL_TEAMS.find(t => t.name === teamName);
  if (!team) return { matchesPlayed:0, actualPoints:0, expectedPoints:0, pointsOverExpectation:0, actualGoals:0, expectedGoals:0, goalsOverExpectation:0, actualGoalsAgainst:0, expectedGoalsAgainst:0, goalsPreventedVsExpectation:0, actualGoalDifference:0, expectedGoalDifference:0, goalDifferenceOverExpectation:0 };

  const matches = teamMatches(teamName);
  let actPts=0, expPts=0, actG=0, expG=0, actGA=0, expGA=0;

  for (const m of matches) {
    const oppName = m.teamIsHome ? m.awayTeam : m.homeTeam;
    const opp = ALL_TEAMS.find(t => t.name === oppName);
    if (!opp) continue;

    const myG  = m.teamIsHome ? m.homeGoals  : m.awayGoals;
    const oppG = m.teamIsHome ? m.awayGoals  : m.homeGoals;
    const myXg = m.teamIsHome ? m.homeXg     : m.awayXg;
    const oppXg= m.teamIsHome ? m.awayXg     : m.homeXg;

    actPts += myG > oppG ? 3 : myG === oppG ? 1 : 0;
    expPts += expectedPoints(team.powerScore, opp.powerScore);
    actG   += myG;
    expG   += myXg; // using modeled xG as expected goals
    actGA  += oppG;
    expGA  += oppXg;
  }

  return {
    matchesPlayed: matches.length,
    actualPoints: actPts,
    expectedPoints: parseFloat(expPts.toFixed(2)),
    pointsOverExpectation: parseFloat((actPts - expPts).toFixed(2)),
    actualGoals: actG,
    expectedGoals: parseFloat(expG.toFixed(2)),
    goalsOverExpectation: parseFloat((actG - expG).toFixed(2)),
    actualGoalsAgainst: actGA,
    expectedGoalsAgainst: parseFloat(expGA.toFixed(2)),
    goalsPreventedVsExpectation: parseFloat((expGA - actGA).toFixed(2)),
    actualGoalDifference: actG - actGA,
    expectedGoalDifference: parseFloat((expG - expGA).toFixed(2)),
    goalDifferenceOverExpectation: parseFloat(((actG - actGA) - (expG - expGA)).toFixed(2)),
  };
}

/** Compute strength of schedule (SOS) score, 0–100.
 *  70% average opponent pre-tournament rating + 30% average opponent live points-per-match rating.
 *  Uses leave-one-out: when computing an opponent's live rating, we exclude the game vs the team.
 */
function computeSOS(teamName: string): {
  sosScore: number;
  avgOpponentPretournament: number;
  avgOpponentLive: number;
  bestOpponent: string;
  weakestOpponent: string;
  opponentAvgAttack: number;
  opponentAvgDefense: number;
} {
  const matches = teamMatches(teamName);
  if (matches.length === 0) return { sosScore: 0, avgOpponentPretournament: 0, avgOpponentLive: 0, bestOpponent: "N/A", weakestOpponent: "N/A", opponentAvgAttack: 0, opponentAvgDefense: 0 };

  const opponents = matches.map(m => m.teamIsHome ? m.awayTeam : m.homeTeam);

  const preRatings = opponents.map(opp => ALL_TEAMS.find(t => t.name === opp)?.powerScore ?? 50);
  const avgPre = preRatings.reduce((a, b) => a + b, 0) / preRatings.length;

  // Live rating: points per match in the group stage (leave-one-out)
  const liveRatings = opponents.map(opp => {
    const oppMatches = teamMatches(opp).filter(m =>
      (m.teamIsHome ? m.awayTeam : m.homeTeam) !== teamName // exclude the game vs team
    );
    if (oppMatches.length === 0) return ALL_TEAMS.find(t => t.name === opp)?.powerScore ?? 50;
    let pts = 0;
    for (const m of oppMatches) {
      const myG  = m.teamIsHome ? m.homeGoals : m.awayGoals;
      const oppG = m.teamIsHome ? m.awayGoals : m.homeGoals;
      pts += myG > oppG ? 3 : myG === oppG ? 1 : 0;
    }
    // Normalize points/match to 0–100 scale (3 pts/match = 100)
    return (pts / oppMatches.length / 3) * 100;
  });
  const avgLive = liveRatings.reduce((a, b) => a + b, 0) / liveRatings.length;

  const sosScore = Math.min(100, Math.max(0, 0.7 * avgPre + 0.3 * avgLive));

  const bestIdx = preRatings.indexOf(Math.max(...preRatings));
  const worstIdx = preRatings.indexOf(Math.min(...preRatings));

  const opponentAvgAttack = opponents.map(opp => ALL_TEAMS.find(t => t.name === opp)?.attack ?? 50).reduce((a, b) => a + b, 0) / opponents.length;
  const opponentAvgDefense = opponents.map(opp => ALL_TEAMS.find(t => t.name === opp)?.defense ?? 50).reduce((a, b) => a + b, 0) / opponents.length;

  return {
    sosScore: parseFloat(sosScore.toFixed(1)),
    avgOpponentPretournament: parseFloat(avgPre.toFixed(1)),
    avgOpponentLive: parseFloat(avgLive.toFixed(1)),
    bestOpponent: opponents[bestIdx] ?? "N/A",
    weakestOpponent: opponents[worstIdx] ?? "N/A",
    opponentAvgAttack: parseFloat(opponentAvgAttack.toFixed(1)),
    opponentAvgDefense: parseFloat(opponentAvgDefense.toFixed(1)),
  };
}

/**
 * Compute head-to-head history from the GROUP_MATCHES array only.
 * Full H2H historical data is unavailable — documented in Methodology.
 */
function computeGroupH2H(teamA: string, teamB: string): GroupMatch | null {
  return GROUP_MATCHES.find(
    m => (m.homeTeam === teamA && m.awayTeam === teamB) ||
         (m.homeTeam === teamB && m.awayTeam === teamA)
  ) ?? null;
}

/**
 * Overall matchup model.
 * Combines: pre-tournament rating (40%), group-stage performance (35%), SOS-adjusted (25%).
 * Returns win/draw/loss probabilities and projected score for teamA.
 */
function computeMatchupModel(teamA: Team, teamB: Team, statsA: PerMatchStats, statsB: PerMatchStats, sosA: ReturnType<typeof computeSOS>, sosB: ReturnType<typeof computeSOS>) {
  // Pre-tournament factor (40%)
  const preFactor = (teamA.powerScore - teamB.powerScore) / 100;

  // Live performance factor (35%): composite of xGDiff, points/match
  const liveA = statsA.gamesPlayed > 0 ? (statsA.xgDiff + statsA.points) / 2 : 0;
  const liveB = statsB.gamesPlayed > 0 ? (statsB.xgDiff + statsB.points) / 2 : 0;
  const liveRange = 5;
  const liveFactor = (liveA - liveB) / liveRange;

  // SOS-adjusted factor (25%): if you beat tougher opponents, weight you up
  const sosFactor = (sosA.sosScore - sosB.sosScore) / 100;

  const compositeEdge = 0.40 * preFactor + 0.35 * liveFactor + 0.25 * sosFactor;
  const scaledDiff = compositeEdge * 30; // map to rating-diff range

  const { win: winA, draw, loss: lossA } = expectedProbabilities(50 + scaledDiff * 50, 50);

  // Projected score: scale to typical WC goals
  const avgGoalsPerMatch = 2.7;
  const projA = parseFloat(((winA + draw * 0.5) * avgGoalsPerMatch).toFixed(2));
  const projB = parseFloat(((lossA + draw * 0.5) * avgGoalsPerMatch).toFixed(2));

  const edgeMag = Math.abs(winA - lossA);
  const edgeLabel = edgeMag < 0.08 ? "Toss-up"
    : edgeMag < 0.18 ? (winA > lossA ? `Slight edge: ${teamA.name}` : `Slight edge: ${teamB.name}`)
    : edgeMag < 0.32 ? (winA > lossA ? `Moderate edge: ${teamA.name}` : `Moderate edge: ${teamB.name}`)
    : (winA > lossA ? `Strong edge: ${teamA.name}` : `Strong edge: ${teamB.name}`);

  const confidence = Math.round(40 + edgeMag * 150);

  return {
    winA: parseFloat((winA * 100).toFixed(1)),
    draw: parseFloat((draw * 100).toFixed(1)),
    lossA: parseFloat((lossA * 100).toFixed(1)),
    projA,
    projB,
    edgeLabel,
    edgeMag,
    confidence: Math.min(90, confidence),
    compositeEdge,
  };
}

/** Find common opponents between two teams */
function findCommonOpponents(teamA: string, teamB: string): string[] {
  const oppsA = new Set(teamMatches(teamA).map(m => m.teamIsHome ? m.awayTeam : m.homeTeam));
  const oppsB = new Set(teamMatches(teamB).map(m => m.teamIsHome ? m.awayTeam : m.homeTeam));
  return [...oppsA].filter(o => oppsB.has(o));
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Flag({ code, size = 28 }: { code: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/${size * 2}x${Math.round(size * 2 * 0.75)}/${code.toLowerCase()}.png`}
      alt={code}
      width={size}
      height={Math.round(size * 0.75)}
      className="inline-block rounded-[2px] object-cover"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

/** Horizontal comparison bar: A vs B, with advantage shading */
function ComparisonBar({ valA, valB, higherIsBetter = true, label, tooltipText, fmt }: {
  valA: number; valB: number; higherIsBetter?: boolean;
  label: string; tooltipText?: string; fmt?: (v: number) => string;
}) {
  const [showTip, setShowTip] = useState(false);
  const f = fmt ?? ((v: number) => v.toFixed(2));
  const total = valA + valB;
  const pctA = total > 0 ? (valA / total) * 100 : 50;
  const advantage = higherIsBetter ? valA > valB : valA < valB;
  const disadvantage = higherIsBetter ? valA < valB : valA > valB;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <div className={`text-right text-xs font-bold tabular-nums ${advantage ? "text-emerald-600" : disadvantage ? "text-slate-400" : "text-slate-700"}`}>
        {f(valA)}
      </div>
      <div className="relative flex flex-col items-center">
        <button
          className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600 transition"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          onClick={() => setShowTip(v => !v)}
        >
          {label}
        </button>
        {showTip && tooltipText && (
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 w-52 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg text-[11px] text-slate-600 leading-relaxed">
            {tooltipText}
          </div>
        )}
        <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden flex">
          <div className="h-full rounded-l-full bg-[#031635] transition-all" style={{ width: `${pctA}%` }} />
          <div className="h-full rounded-r-full bg-[#e05c2e] transition-all" style={{ width: `${100 - pctA}%` }} />
        </div>
      </div>
      <div className={`text-left text-xs font-bold tabular-nums ${disadvantage ? "text-emerald-600" : advantage ? "text-slate-400" : "text-slate-700"}`}>
        {f(valB)}
      </div>
    </div>
  );
}

function StatBar({ value, max = 100, color = NAV }: { value: number; max?: number; color?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
    </div>
  );
}

function Delta({ val }: { val: number }) {
  const pos = val > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${pos ? "text-emerald-600" : val < 0 ? "text-red-500" : "text-slate-400"}`}>
      {pos ? "▲" : val < 0 ? "▼" : "–"} {Math.abs(val).toFixed(2)}
    </span>
  );
}

// ─── Team selector ────────────────────────────────────────────────────────────

function TeamSelector({ selected, exclude, onSelect, label }: {
  selected: Team | null;
  exclude: Team | null;
  onSelect: (t: Team) => void;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = ALL_TEAMS.filter(t =>
    t !== exclude &&
    t.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 12);

  return (
    <div className="relative">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</div>
      <button
        className="flex items-center gap-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:border-slate-300 transition"
        onClick={() => setOpen(o => !o)}
      >
        {selected ? (
          <>
            <Flag code={selected.code} size={18} />
            <span>{selected.name}</span>
            <span className="ml-auto text-[10px] text-slate-400">Grp {selected.group}</span>
          </>
        ) : (
          <span className="text-slate-400">Select team…</span>
        )}
        <span className="ml-auto text-xs text-slate-300">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search team…"
              className="w-full rounded-lg bg-slate-50 px-3 py-1.5 text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map(t => (
              <button
                key={t.name}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition"
                onClick={() => { onSelect(t); setOpen(false); setQuery(""); }}
              >
                <Flag code={t.code} size={16} />
                <span className="font-medium">{t.name}</span>
                <span className="ml-auto text-[10px] text-slate-400">Grp {t.group} · {t.powerScore}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-3 text-xs text-slate-400 text-center">No teams found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analyzer sections ────────────────────────────────────────────────────────

function MatchupHeader({ teamA, teamB, onSwap }: { teamA: Team; teamB: Team; onSwap: () => void }) {
  const statsA = computePerMatchStats(teamA.name);
  const statsB = computePerMatchStats(teamB.name);
  const expA = computeExpectationMetrics(teamA.name);
  const expB = computeExpectationMetrics(teamB.name);

  const teamDisplay = (team: Team, stats: PerMatchStats, exp: TeamExpectationMetrics, side: "left" | "right") => {
    const gp = stats.gamesPlayed;
    const pts = exp.actualPoints;
    const gf = exp.actualGoals;
    const ga = exp.actualGoalsAgainst;
    return (
      <div className={`flex flex-col ${side === "right" ? "items-end text-right" : "items-start text-left"} flex-1`}>
        <Flag code={team.code} size={40} />
        <div className="mt-2 text-2xl font-black text-[#031635] leading-none">{team.name}</div>
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Group {team.group}</div>
        <div className="mt-3 flex flex-col gap-0.5">
          <div className="text-xs text-slate-600">
            <span className="font-semibold">{gp}</span> GP · <span className="font-semibold">{pts}</span> pts
          </div>
          <div className="text-xs text-slate-600">
            GF <span className="font-semibold">{gf}</span> · GA <span className="font-semibold">{ga}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Pre-tournament rating: <span className="font-bold text-[#031635]">{team.powerScore}/100</span>
          </div>
          <div className="text-xs text-slate-500">
            FIFA rank: <span className="font-bold">#{team.fifaRank}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="!p-6">
      <div className="flex items-start gap-4">
        {teamDisplay(teamA, statsA, expA, "left")}
        <div className="flex flex-col items-center gap-2 pt-2">
          <div className="text-xl font-black text-slate-300">vs</div>
          <button
            onClick={onSwap}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition"
            title="Swap teams"
          >
            ⇄ Swap
          </button>
        </div>
        {teamDisplay(teamB, statsB, expB, "right")}
      </div>
    </Card>
  );
}

function OverallEdgeCard({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const statsA = computePerMatchStats(teamA.name);
  const statsB = computePerMatchStats(teamB.name);
  const sosA = computeSOS(teamA.name);
  const sosB = computeSOS(teamB.name);
  const model = computeMatchupModel(teamA, teamB, statsA, statsB, sosA, sosB);

  const winTeam = model.winA > model.lossA ? teamA : teamB;
  const drawish = model.draw > 30;

  const winPct = model.winA > model.lossA ? model.winA : model.lossA;
  const biggestUncertainty = model.draw > 28 ? "High draw probability — historically strong defensive matchup"
    : model.edgeMag < 0.1 ? "Closely matched sides — small data sample inflates uncertainty"
    : "Group-stage xG sample size (3 matches) limits projection precision";

  return (
    <Card>
      <SectionHeader title="Overall Matchup Edge" subtitle="Composite model: 40% pre-tournament rating · 35% group-stage performance · 25% SOS-adjusted" />

      <div className="mb-5 rounded-xl bg-[#031635] px-5 py-4 text-white">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Edge Assessment</div>
        <div className="text-xl font-black">{model.edgeLabel}</div>
        {drawish && <div className="mt-1 text-xs text-slate-300">High draw probability — closely contested matchup</div>}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">{teamA.name} Win</div>
          <div className="text-2xl font-black" style={{ color: NAV }}>{model.winA}%</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">Draw</div>
          <div className="text-2xl font-black text-slate-600">{model.draw}%</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-center border border-slate-100">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">{teamB.name} Win</div>
          <div className="text-2xl font-black" style={{ color: ACC }}>{model.lossA}%</div>
        </div>
      </div>

      <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex mb-4">
        <div className="h-full rounded-l-full transition-all" style={{ width: `${model.winA}%`, backgroundColor: NAV }} />
        <div className="h-full transition-all bg-slate-300" style={{ width: `${model.draw}%` }} />
        <div className="h-full rounded-r-full transition-all" style={{ width: `${model.lossA}%`, backgroundColor: ACC }} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">Projected Score</div>
          <div className="text-lg font-black text-[#031635]">{model.projA} – {model.projB}</div>
          <div className="text-[10px] text-slate-400">{teamA.name} – {teamB.name}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">Model Confidence</div>
          <div className="text-lg font-black text-[#031635]">{model.confidence}%</div>
          <StatBar value={model.confidence} max={100} color={NAV} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-emerald-600 font-bold mb-0.5">Key reason for edge</div>
          <div className="text-xs text-slate-700">
            {model.compositeEdge > 0
              ? `${teamA.name} holds a ${Math.round(Math.abs(model.compositeEdge) * 100)}pt composite advantage across pre-tournament rating and group-stage execution.`
              : `${teamB.name} holds a ${Math.round(Math.abs(model.compositeEdge) * 100)}pt composite advantage across pre-tournament rating and group-stage execution.`}
          </div>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-amber-600 font-bold mb-0.5">Biggest uncertainty</div>
          <div className="text-xs text-slate-700">{biggestUncertainty}</div>
        </div>
      </div>
    </Card>
  );
}

function PreTournamentSection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const rA = normalizePreTournamentRating(teamA);
  const rB = normalizePreTournamentRating(teamB);

  const row = (label: string, vA: number, vB: number, tip: string) => (
    <ComparisonBar key={label} valA={vA} valB={vB} label={label} tooltipText={tip} fmt={v => v.toFixed(0)} />
  );

  return (
    <Card>
      <SectionHeader title="Pre-Tournament Ratings" subtitle="Composite ratings built from FIFA ranking, qualifying campaign, and recent international form" />
      <div className="flex items-center justify-between mb-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <span>{teamA.name}</span>
        <span>{teamB.name}</span>
      </div>
      {row("Overall", rA, rB, "Composite pre-tournament rating (0–100). Combines FIFA ranking, qualifying attack/defense metrics, and 10-match form run-in.")}
      {row("ATK", teamA.attack, teamB.attack, "Attacking rating based on qualifying campaign goals scored per match and creation quality.")}
      {row("DEF", teamA.defense, teamB.defense, "Defensive rating based on goals conceded per match and clean-sheet rate in qualifying.")}
      {row("Form", teamA.form, teamB.form, "Form rating over the 10 international matches immediately preceding the tournament.")}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[teamA, teamB].map((team, i) => (
          <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Flag code={team.code} size={14} />
              <span className="text-[11px] font-bold text-slate-700">{team.name}</span>
            </div>
            <StatBar value={team.powerScore} max={100} color={i === 0 ? NAV : ACC} />
            <div className="mt-1 text-xs font-black text-[#031635]">{team.powerScore}/100</div>
            <div className="text-[10px] text-slate-400">FIFA #{team.fifaRank}</div>
            <div className="mt-1 text-[10px] text-slate-400">GK Rating: <span className="italic">N/A (data unavailable)</span></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GroupStageSection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const sA = computePerMatchStats(teamA.name);
  const sB = computePerMatchStats(teamB.name);

  const pct = (v: number) => v.toFixed(1) + "%";
  const f2 = (v: number) => v.toFixed(2);

  if (sA.gamesPlayed === 0 && sB.gamesPlayed === 0) {
    return (
      <Card>
        <SectionHeader title="Group-Stage Performance" />
        <p className="text-xs text-slate-400">No group-stage matches found for either team.</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="Group-Stage Performance" subtitle="Per-match averages. Lower is better for defensive metrics (marked ↓)." />
      <div className="flex items-center justify-between mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <span>{teamA.name} ({sA.gamesPlayed} GP)</span>
        <span>{teamB.name} ({sB.gamesPlayed} GP)</span>
      </div>

      <ComparisonBar valA={sA.points}    valB={sB.points}    label="Pts/Gm"  tooltipText="Points earned per match (3=W, 1=D, 0=L)."                fmt={f2} />
      <ComparisonBar valA={sA.goalsFor}  valB={sB.goalsFor}  label="GF/Gm"   tooltipText="Goals scored per match."                                   fmt={f2} />
      <ComparisonBar valA={sA.goalsAgainst} valB={sB.goalsAgainst} higherIsBetter={false} label="GA/Gm ↓" tooltipText="Goals conceded per match. Lower is better." fmt={f2} />
      <ComparisonBar valA={sA.goalDiff}  valB={sB.goalDiff}  label="GD/Gm"   tooltipText="Goal differential per match."                              fmt={f2} />
      <ComparisonBar valA={sA.xgFor}     valB={sB.xgFor}     label="xGF/Gm"  tooltipText="Expected goals for per match. Measures quality of chances created. [MODELED — see Methodology]" fmt={f2} />
      <ComparisonBar valA={sA.xgAgainst} valB={sB.xgAgainst} higherIsBetter={false} label="xGA/Gm ↓" tooltipText="Expected goals against per match. [MODELED — see Methodology]" fmt={f2} />
      <ComparisonBar valA={sA.xgDiff}    valB={sB.xgDiff}    label="xGD/Gm"  tooltipText="xG differential per match. Positive = creating more chances than allowing." fmt={f2} />
      <ComparisonBar valA={sA.shotsFor}  valB={sB.shotsFor}  label="Shots/Gm" tooltipText="Shots attempted per match."                              fmt={f2} />
      <ComparisonBar valA={sA.shotsOnTargetFor} valB={sB.shotsOnTargetFor} label="SOT/Gm" tooltipText="Shots on target per match."                  fmt={f2} />
      <ComparisonBar valA={sA.possession} valB={sB.possession} label="Poss%"  tooltipText="Average ball possession percentage." fmt={v => v.toFixed(1) + "%"} />
      <ComparisonBar valA={sA.savePercent} valB={sB.savePercent} label="Save%"  tooltipText="Goalkeeper save percentage. Saves ÷ Shots on target faced." fmt={v => v.toFixed(1) + "%"} />
      <ComparisonBar valA={sA.cleanSheetRate} valB={sB.cleanSheetRate} label="CS%" tooltipText="Clean sheet rate (% of matches with 0 goals conceded)." fmt={v => v.toFixed(0) + "%"} />

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-400">
        Big chances, set-piece breakdown, and pass completion are unavailable — data source does not include these metrics.
      </div>
    </Card>
  );
}

function SOSSection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const sosA = computeSOS(teamA.name);
  const sosB = computeSOS(teamB.name);

  return (
    <Card>
      <SectionHeader title="Strength of Schedule" subtitle="70% average opponent pre-tournament rating + 30% average opponent live tournament rating. Leave-one-out applied to prevent circular inflation." />

      <ComparisonBar valA={sosA.sosScore} valB={sosB.sosScore} label="SOS Score" tooltipText="Blended opponent quality. 70% pre-tournament rating average + 30% opponent live points-per-match (normalized 0–100). Leave-one-out method used — see Methodology." fmt={v => v.toFixed(1)} />
      <ComparisonBar valA={sosA.avgOpponentPretournament} valB={sosB.avgOpponentPretournament} label="Avg Opp Pre" tooltipText="Raw average of opponents' pre-tournament power scores." fmt={v => v.toFixed(1)} />
      <ComparisonBar valA={sosA.opponentAvgAttack} valB={sosB.opponentAvgAttack} label="Opp ATK" tooltipText="Average attacking rating of opponents faced." fmt={v => v.toFixed(1)} />
      <ComparisonBar valA={sosA.opponentAvgDefense} valB={sosB.opponentAvgDefense} label="Opp DEF" tooltipText="Average defensive rating of opponents faced." fmt={v => v.toFixed(1)} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[{ team: teamA, sos: sosA }, { team: teamB, sos: sosB }].map(({ team, sos }, i) => (
          <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
            <div className="flex items-center gap-1.5 mb-2">
              <Flag code={team.code} size={14} />
              <span className="font-bold">{team.name}</span>
            </div>
            <div className="space-y-1 text-slate-600">
              <div>Best opp: <span className="font-semibold">{sos.bestOpponent}</span></div>
              <div>Weakest opp: <span className="font-semibold">{sos.weakestOpponent}</span></div>
              <div>SOS: <span className="font-black" style={{ color: i === 0 ? NAV : ACC }}>{sos.sosScore}</span></div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExpectationSection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const eA = computeExpectationMetrics(teamA.name);
  const eB = computeExpectationMetrics(teamB.name);

  const MetricRow = ({ label, vA, vB, tip }: { label: string; vA: number; vB: number; tip: string }) => (
    <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <Delta val={vA} />
      <div className="text-center">
        <button className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600 transition cursor-help" title={tip}>{label}</button>
      </div>
      <div className="text-right"><Delta val={vB} /></div>
    </div>
  );

  return (
    <Card>
      <SectionHeader title="Performance vs Expectation" subtitle="How each team over- or underperformed their pre-tournament rating in each group-stage match. ▲ = outperformed, ▼ = underperformed." />

      <div className="flex items-center justify-between mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <span>{teamA.name}</span>
        <span>{teamB.name}</span>
      </div>

      <MetricRow label="Pts over xPts" vA={eA.pointsOverExpectation} vB={eB.pointsOverExpectation} tip="Actual points minus expected points derived from pre-tournament rating matchup model." />
      <MetricRow label="Goals over xG" vA={eA.goalsOverExpectation}  vB={eB.goalsOverExpectation}  tip="Actual goals scored minus expected goals (xG) from group-stage matches." />
      <MetricRow label="Goals prev." vA={eA.goalsPreventedVsExpectation} vB={eB.goalsPreventedVsExpectation} tip="Goals prevented vs expectation. Positive = conceded fewer than expected based on opponent xG." />
      <MetricRow label="GD over xGD" vA={eA.goalDifferenceOverExpectation} vB={eB.goalDifferenceOverExpectation} tip="Goal differential above or below expected goal differential." />

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[{ team: teamA, exp: eA }, { team: teamB, exp: eB }].map(({ team, exp }, i) => (
          <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
            <div className="flex items-center gap-1.5 mb-2">
              <Flag code={team.code} size={14} />
              <span className="font-bold text-[11px]">{team.name}</span>
            </div>
            <div className="space-y-1 text-slate-600">
              <div>Actual pts: <span className="font-bold">{exp.actualPoints}</span> / Expected: <span className="font-bold">{exp.expectedPoints}</span></div>
              <div>GF: <span className="font-bold">{exp.actualGoals}</span> / xG: <span className="font-bold">{exp.expectedGoals}</span></div>
              <div>GA: <span className="font-bold">{exp.actualGoalsAgainst}</span> / xGA: <span className="font-bold">{exp.expectedGoalsAgainst}</span></div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StyleMatchupSection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const sA = computePerMatchStats(teamA.name);
  const sB = computePerMatchStats(teamB.name);

  const styleTag = (stats: PerMatchStats): string => {
    if (stats.possession > 58 && stats.xgFor > 2.0) return "High-Possession Attacker";
    if (stats.possession > 58) return "Possession-Dominant";
    if (stats.xgFor > 2.0) return "Counter-Attack Finisher";
    if (stats.xgAgainst < 0.8) return "Defensive Compact";
    if (stats.xgDiff > 1.0) return "Balanced Dominant";
    return "Transition-Oriented";
  };

  const attackDefendEdge = (atk: number, def: number): string => {
    const diff = atk - def;
    if (diff > 15) return "Strong mismatch favoring attacker";
    if (diff > 8)  return "Moderate attacker advantage";
    if (diff > 2)  return "Slight attacker advantage";
    if (diff < -8) return "Defense has the edge";
    return "Evenly matched";
  };

  return (
    <Card>
      <SectionHeader title="Style & Situational Matchup" subtitle="How each team's style intersects — possession tendencies, attack vs defense edges" />

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[{ team: teamA, stats: sA }, { team: teamB, stats: sB }].map(({ team, stats }, i) => (
          <div key={i} className="rounded-xl border p-3" style={{ borderColor: i === 0 ? NAV : ACC }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Flag code={team.code} size={14} />
              <span className="text-xs font-black">{team.name}</span>
            </div>
            <div className="text-[11px] font-bold" style={{ color: i === 0 ? NAV : ACC }}>{styleTag(stats)}</div>
            <div className="mt-1.5 space-y-1 text-[11px] text-slate-500">
              <div>Possession avg: <span className="font-semibold text-slate-700">{stats.possession.toFixed(1)}%</span></div>
              <div>Shots/game: <span className="font-semibold text-slate-700">{stats.shotsFor.toFixed(1)}</span></div>
              <div>xGF: <span className="font-semibold text-slate-700">{stats.xgFor.toFixed(2)}</span> · xGA: <span className="font-semibold text-slate-700">{stats.xgAgainst.toFixed(2)}</span></div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
          <div className="font-bold text-slate-600 mb-0.5">{teamA.name} Attack vs {teamB.name} Defense</div>
          <div className="text-slate-500">{attackDefendEdge(teamA.attack, teamB.defense)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">ATK {teamA.attack} vs DEF {teamB.defense}</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
          <div className="font-bold text-slate-600 mb-0.5">{teamB.name} Attack vs {teamA.name} Defense</div>
          <div className="text-slate-500">{attackDefendEdge(teamB.attack, teamA.defense)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">ATK {teamB.attack} vs DEF {teamA.defense}</div>
        </div>
      </div>
    </Card>
  );
}

function CommonOpponentsSection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const common = findCommonOpponents(teamA.name, teamB.name);

  if (common.length === 0) {
    return (
      <Card>
        <SectionHeader title="Common Opponents" />
        <p className="text-xs text-slate-400 italic">These teams were in different groups — no common group-stage opponents.</p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="Common Opponents" subtitle="How each team performed against the same group-stage opponents" />
      <div className="space-y-3">
        {common.map(opp => {
          const matchA = teamMatches(teamA.name).find(m => (m.teamIsHome ? m.awayTeam : m.homeTeam) === opp);
          const matchB = teamMatches(teamB.name).find(m => (m.teamIsHome ? m.awayTeam : m.homeTeam) === opp);
          const oppTeam = ALL_TEAMS.find(t => t.name === opp);
          if (!matchA || !matchB || !oppTeam) return null;

          const gdA = (matchA.teamIsHome ? matchA.homeGoals - matchA.awayGoals : matchA.awayGoals - matchA.homeGoals);
          const gdB = (matchB.teamIsHome ? matchB.homeGoals - matchB.awayGoals : matchB.awayGoals - matchB.homeGoals);

          return (
            <div key={opp} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                {oppTeam && <Flag code={oppTeam.code} size={14} />}
                <span className="text-xs font-bold text-slate-700">vs {opp}</span>
                <span className="ml-auto text-[10px] text-slate-400">Pre-rating: {oppTeam.powerScore}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">{teamA.name}:</span> <span className="font-bold">{gdA > 0 ? "+" : ""}{gdA} GD</span>
                </div>
                <div>
                  <span className="text-slate-500">{teamB.name}:</span> <span className="font-bold">{gdB > 0 ? "+" : ""}{gdB} GD</span>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Edge vs {opp}: {gdA > gdB ? `${teamA.name} (+${gdA - gdB} GD)` : gdB > gdA ? `${teamB.name} (+${gdB - gdA} GD)` : "Even"}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function H2HSection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const match = computeGroupH2H(teamA.name, teamB.name);
  return (
    <Card>
      <SectionHeader title="Head-to-Head History" subtitle="Tournament group-stage meeting only — full H2H historical data is unavailable" />
      {match ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Group {match.group} · This Tournament</div>
          <div className="flex items-center justify-between text-sm font-black text-[#031635]">
            <span>{match.homeTeam}</span>
            <span className="text-xl">{match.homeGoals} – {match.awayGoals}</span>
            <span>{match.awayTeam}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
            <div>xG: {match.homeXg}</div>
            <div className="text-center">vs</div>
            <div className="text-right">xG: {match.awayXg}</div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">No group-stage meeting this tournament. Full H2H historical records are not available in this data source.</p>
      )}
    </Card>
  );
}

function ModelSummarySection({ teamA, teamB }: { teamA: Team; teamB: Team }) {
  const statsA = computePerMatchStats(teamA.name);
  const statsB = computePerMatchStats(teamB.name);
  const sosA = computeSOS(teamA.name);
  const sosB = computeSOS(teamB.name);
  const model = computeMatchupModel(teamA, teamB, statsA, statsB, sosA, sosB);
  const eA = computeExpectationMetrics(teamA.name);
  const eB = computeExpectationMetrics(teamB.name);

  const favored = model.winA > model.lossA ? teamA : teamB;
  const underdogName = model.winA > model.lossA ? teamB.name : teamA.name;

  const outcomeLabel = model.winA > 45 ? `${teamA.name} win`
    : model.lossA > 45 ? `${teamB.name} win`
    : model.draw > 32 ? "Draw likely"
    : "Tight contest";

  return (
    <Card className="border-2 border-[#031635]">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-1.5 w-6 rounded-full" style={{ backgroundColor: NAV }} />
        <SectionHeader title="Model Summary" subtitle="JKB World Cup composite model — do not use as sole basis for decisions" />
      </div>

      <div className="rounded-xl bg-[#031635] px-5 py-4 text-white mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Most Likely Outcome</div>
        <div className="text-2xl font-black">{outcomeLabel}</div>
        <div className="mt-1 text-sm text-slate-300">Projected: {teamA.name} {model.projA} – {model.projB} {teamB.name}</div>
      </div>

      <div className="space-y-2 text-xs text-slate-600">
        <div className="flex gap-2 items-start">
          <span className="text-emerald-500 font-bold mt-0.5">▲</span>
          <span><strong>{favored.name}</strong> holds advantage in {
            [
              favored.powerScore > (favored === teamA ? teamB : teamA).powerScore && "pre-tournament rating",
              (favored === teamA ? statsA.xgDiff : statsB.xgDiff) > (favored === teamA ? statsB.xgDiff : statsA.xgDiff) && "xG differential",
              (favored === teamA ? sosA.sosScore : sosB.sosScore) > (favored === teamA ? sosB.sosScore : sosA.sosScore) && "schedule difficulty",
            ].filter(Boolean).join(", ") || "composite score"
          }.</span>
        </div>
        <div className="flex gap-2 items-start">
          <span className="text-amber-500 font-bold mt-0.5">⚠</span>
          <span>Model confidence: <strong>{model.confidence}%</strong>. {model.confidence < 60 ? "High uncertainty — treat result as a toss-up." : "Moderate confidence in directional outcome."}</span>
        </div>
        <div className="flex gap-2 items-start">
          <span className="text-blue-500 font-bold mt-0.5">↗</span>
          <span>Over-performance vs expectation: <strong>{teamA.name}</strong> {eA.pointsOverExpectation >= 0 ? "+" : ""}{eA.pointsOverExpectation} pts · <strong>{teamB.name}</strong> {eB.pointsOverExpectation >= 0 ? "+" : ""}{eB.pointsOverExpectation} pts.</span>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-400 leading-relaxed">
        ⚠ Language used here ("slight edge," "moderate edge," "strong edge") reflects model probability, not certainty. Soccer is inherently unpredictable. This analysis does not constitute betting advice.
      </div>
    </Card>
  );
}

function MethodologySection() {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <SectionHeader title="Methodology & Data Disclosure" />
      <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
        <div>
          <div className="font-bold mb-0.5">Pre-tournament ratings</div>
          <p>Sourced from <code className="bg-white px-1 rounded">WorldCup2026.tsx</code> <code>powerScore / attack / defense / form</code> fields. Composite of FIFA ranking (30%), qualifying attack (25%), qualifying defense (20%), recent form (15%), experience (10%).</p>
        </div>
        <div>
          <div className="font-bold mb-0.5">Group-stage match data [MODELED]</div>
          <p>Goals, xG, shots, possession per match are modeled estimates consistent with the bracket outcomes in <code>WorldCup2026.tsx</code>. They are not sourced from a live match API. xG values are estimated, not event-level tracked data.</p>
        </div>
        <div>
          <div className="font-bold mb-0.5">Draw-adjusted logistic model</div>
          <p>Expected win probability = 1 / (1 + 10^(-ratingDiff/20)). Draw pool: 30% × exp(-|diff|/30), reduced as rating gap grows. Expected points = 3×P(win) + 1×P(draw).</p>
        </div>
        <div>
          <div className="font-bold mb-0.5">Strength of schedule</div>
          <p>SOS = 0.70 × avg opponent pre-tournament rating + 0.30 × avg opponent live points/match (normalized 0–100). Leave-one-out applied: opponent's live rating excludes the game played against the team being evaluated.</p>
        </div>
        <div>
          <div className="font-bold mb-0.5">Unavailable data</div>
          <p>Goalkeeper ratings, set-piece breakdown, pass completion, full H2H historical records, and big-chance statistics are not available in the current data source and are displayed as N/A.</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function WorldCupAnalyzer() {
  usePageSeo({
    title: "World Cup 2026 Matchup Analyzer | JoeKnowsBall",
    description: "Compare any two World Cup 2026 teams side-by-side. Pre-tournament ratings, group-stage xG, strength of schedule, performance vs expectation, and model win probabilities.",
    path: "/world-cup/analyzer",
  });

  const [teamA, setTeamA] = useState<Team | null>(() => ALL_TEAMS.find(t => t.name === "Brazil") ?? null);
  const [teamB, setTeamB] = useState<Team | null>(() => ALL_TEAMS.find(t => t.name === "Spain") ?? null);

  // Sync URL params
  useEffect(() => {
    const url = new URL(window.location.href);
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");
    if (a) { const t = ALL_TEAMS.find(x => x.code === a || x.name === a); if (t) setTeamA(t); }
    if (b) { const t = ALL_TEAMS.find(x => x.code === b || x.name === b); if (t) setTeamB(t); }
  }, []);

  useEffect(() => {
    if (teamA && teamB) {
      const url = new URL(window.location.href);
      url.searchParams.set("a", teamA.code);
      url.searchParams.set("b", teamB.code);
      window.history.replaceState({}, "", url.toString());
    }
  }, [teamA, teamB]);

  const ready = teamA && teamB && teamA !== teamB;

  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Link to="/world-cup" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-[#031635] transition">⚽ WC26</Link>
            <span className="text-slate-300">/</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Matchup Analyzer</span>
          </div>
          <h1 className="text-3xl font-black text-[#031635] leading-none">Matchup Analyzer</h1>
          <p className="mt-1 text-sm text-slate-500">Compare any two World Cup 2026 teams. Pre-tournament ratings, group-stage performance, SOS, and model win probabilities.</p>
        </div>

        {/* Team selectors */}
        <Card className="mb-6">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <TeamSelector
              selected={teamA}
              exclude={teamB}
              onSelect={setTeamA}
              label="Team A"
            />
            <button
              className="mb-0.5 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              onClick={() => { const tmp = teamA; setTeamA(teamB); setTeamB(tmp); }}
              title="Swap teams"
            >
              ⇄
            </button>
            <TeamSelector
              selected={teamB}
              exclude={teamA}
              onSelect={setTeamB}
              label="Team B"
            />
          </div>
        </Card>

        {!ready ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <p className="text-sm text-slate-500">Select two different teams above to run the matchup analyzer.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <MatchupHeader teamA={teamA!} teamB={teamB!} onSwap={() => { const tmp = teamA; setTeamA(teamB); setTeamB(tmp); }} />
            <OverallEdgeCard teamA={teamA!} teamB={teamB!} />
            <PreTournamentSection teamA={teamA!} teamB={teamB!} />
            <GroupStageSection teamA={teamA!} teamB={teamB!} />
            <SOSSection teamA={teamA!} teamB={teamB!} />
            <ExpectationSection teamA={teamA!} teamB={teamB!} />
            <StyleMatchupSection teamA={teamA!} teamB={teamB!} />
            <CommonOpponentsSection teamA={teamA!} teamB={teamB!} />
            <H2HSection teamA={teamA!} teamB={teamB!} />
            <ModelSummarySection teamA={teamA!} teamB={teamB!} />
            <MethodologySection />
          </div>
        )}
      </div>
    </SiteShell>
  );
}
