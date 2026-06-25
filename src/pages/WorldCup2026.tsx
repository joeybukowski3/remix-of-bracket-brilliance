import { Link } from "react-router-dom";
import { useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";

// ── Types ──────────────────────────────────────────────────────────────────
type Team = {
  name: string;
  code: string;        // ISO 3166-1 alpha-2 for flagcdn
  group: string;
  powerScore: number;  // 0–100 composite
  attack: number;
  defense: number;
  form: number;
  fifaRank: number;
  advancedToKO: boolean;
};

type MatchTeam = {
  name: string;
  code: string;
  goals: number;
  winner: boolean;
};

type BracketMatch = {
  id: string;
  team1: MatchTeam;
  team2: MatchTeam;
};

// ── Flag helper ─────────────────────────────────────────────────────────────
function Flag({ code, size = 24 }: { code: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/${size}x${Math.round(size * 0.75)}/${code.toLowerCase()}.png`}
      alt={code}
      width={size}
      height={Math.round(size * 0.75)}
      className="inline-block rounded-[2px] object-cover"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ── Power bar ────────────────────────────────────────────────────────────────
function PowerBar({ value, color = "#e05c2e" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Data ────────────────────────────────────────────────────────────────────

const TEAMS: Team[] = [
  // Group A — Brazil zone
  { name: "Brazil",      code: "br", group: "A", powerScore: 93, attack: 91, defense: 88, form: 94, fifaRank: 1,  advancedToKO: true },
  { name: "Japan",       code: "jp", group: "A", powerScore: 64, attack: 63, defense: 65, form: 65, fifaRank: 17, advancedToKO: true },
  { name: "Ecuador",     code: "ec", group: "A", powerScore: 61, attack: 62, defense: 59, form: 60, fifaRank: 35, advancedToKO: false },
  { name: "Bahrain",     code: "bh", group: "A", powerScore: 42, attack: 40, defense: 44, form: 41, fifaRank: 85, advancedToKO: false },

  // Group B — Norway zone
  { name: "Norway",      code: "no", group: "B", powerScore: 70, attack: 74, defense: 67, form: 72, fifaRank: 12, advancedToKO: true },
  { name: "Ecuador",     code: "ec", group: "B", powerScore: 61, attack: 62, defense: 59, form: 60, fifaRank: 35, advancedToKO: false },
  { name: "Bolivia",     code: "bo", group: "B", powerScore: 46, attack: 44, defense: 48, form: 45, fifaRank: 73, advancedToKO: false },
  { name: "Tunisia",     code: "tn", group: "B", powerScore: 55, attack: 54, defense: 57, form: 53, fifaRank: 26, advancedToKO: true },

  // Group C — Mexico zone
  { name: "Mexico",      code: "mx", group: "C", powerScore: 74, attack: 72, defense: 71, form: 74, fifaRank: 14, advancedToKO: true },
  { name: "Scotland",    code: "gb-sct", group: "C", powerScore: 63, attack: 64, defense: 62, form: 61, fifaRank: 29, advancedToKO: true },
  { name: "Venezuela",   code: "ve", group: "C", powerScore: 54, attack: 52, defense: 56, form: 53, fifaRank: 33, advancedToKO: false },
  { name: "Malaysia",    code: "my", group: "C", powerScore: 39, attack: 38, defense: 41, form: 38, fifaRank: 130, advancedToKO: false },

  // Group D — England zone
  { name: "England",     code: "gb-eng", group: "D", powerScore: 80, attack: 81, defense: 78, form: 81, fifaRank: 4,  advancedToKO: true },
  { name: "Uzbekistan",  code: "uz", group: "D", powerScore: 52, attack: 51, defense: 53, form: 50, fifaRank: 68, advancedToKO: true },
  { name: "Chile",       code: "cl", group: "D", powerScore: 62, attack: 64, defense: 60, form: 61, fifaRank: 24, advancedToKO: false },
  { name: "Jamaica",     code: "jm", group: "D", powerScore: 47, attack: 46, defense: 48, form: 46, fifaRank: 52, advancedToKO: false },

  // Group E — Argentina zone
  { name: "Argentina",   code: "ar", group: "E", powerScore: 90, attack: 92, defense: 84, form: 88, fifaRank: 2,  advancedToKO: true },
  { name: "Uruguay",     code: "uy", group: "E", powerScore: 65, attack: 67, defense: 64, form: 63, fifaRank: 18, advancedToKO: true },
  { name: "Ghana",       code: "gh", group: "E", powerScore: 57, attack: 56, defense: 58, form: 55, fifaRank: 51, advancedToKO: false },
  { name: "Poland",      code: "pl", group: "E", powerScore: 63, attack: 62, defense: 64, form: 62, fifaRank: 22, advancedToKO: false },

  // Group F — USA zone
  { name: "USA",         code: "us", group: "F", powerScore: 73, attack: 70, defense: 72, form: 74, fifaRank: 11, advancedToKO: true },
  { name: "Iran",        code: "ir", group: "F", powerScore: 60, attack: 58, defense: 62, form: 59, fifaRank: 25, advancedToKO: true },
  { name: "Panama",      code: "pa", group: "F", powerScore: 51, attack: 49, defense: 53, form: 50, fifaRank: 43, advancedToKO: false },
  { name: "Côte d'Ivoire", code: "ci", group: "F", powerScore: 65, attack: 66, defense: 63, form: 64, fifaRank: 28, advancedToKO: false },

  // Group G — Canada zone
  { name: "Canada",      code: "ca", group: "G", powerScore: 71, attack: 70, defense: 70, form: 72, fifaRank: 13, advancedToKO: true },
  { name: "Egypt",       code: "eg", group: "G", powerScore: 59, attack: 57, defense: 61, form: 57, fifaRank: 34, advancedToKO: true },
  { name: "Costa Rica",  code: "cr", group: "G", powerScore: 53, attack: 52, defense: 55, form: 51, fifaRank: 41, advancedToKO: false },
  { name: "Tanzania",    code: "tz", group: "G", powerScore: 41, attack: 40, defense: 43, form: 39, fifaRank: 107, advancedToKO: false },

  // Group H — Portugal zone
  { name: "Portugal",    code: "pt", group: "H", powerScore: 83, attack: 86, defense: 77, form: 82, fifaRank: 7,  advancedToKO: true },
  { name: "Senegal",     code: "sn", group: "H", powerScore: 67, attack: 65, defense: 66, form: 68, fifaRank: 20, advancedToKO: true },
  { name: "Qatar",       code: "qa", group: "H", powerScore: 50, attack: 49, defense: 52, form: 48, fifaRank: 37, advancedToKO: false },
  { name: "New Zealand", code: "nz", group: "H", powerScore: 48, attack: 47, defense: 50, form: 46, fifaRank: 93, advancedToKO: false },

  // Group I — Germany zone
  { name: "Germany",     code: "de", group: "I", powerScore: 82, attack: 83, defense: 80, form: 79, fifaRank: 5,  advancedToKO: true },
  { name: "Paraguay",    code: "py", group: "I", powerScore: 58, attack: 57, defense: 59, form: 58, fifaRank: 32, advancedToKO: true },
  { name: "Algeria",     code: "dz", group: "I", powerScore: 60, attack: 59, defense: 61, form: 58, fifaRank: 30, advancedToKO: false },
  { name: "Australia",   code: "au", group: "I", powerScore: 55, attack: 54, defense: 56, form: 53, fifaRank: 23, advancedToKO: false },

  // Group J — France zone
  { name: "France",      code: "fr", group: "J", powerScore: 89, attack: 88, defense: 87, form: 87, fifaRank: 3,  advancedToKO: true },
  { name: "Sweden",      code: "se", group: "J", powerScore: 61, attack: 62, defense: 63, form: 59, fifaRank: 21, advancedToKO: true },
  { name: "Colombia",    code: "co", group: "J", powerScore: 72, attack: 73, defense: 68, form: 70, fifaRank: 10, advancedToKO: false },
  { name: "Cameroon",    code: "cm", group: "J", powerScore: 58, attack: 59, defense: 56, form: 57, fifaRank: 31, advancedToKO: false },

  // Group K — Netherlands zone
  { name: "Netherlands", code: "nl", group: "K", powerScore: 79, attack: 78, defense: 76, form: 80, fifaRank: 6,  advancedToKO: true },
  { name: "Morocco",     code: "ma", group: "K", powerScore: 63, attack: 60, defense: 67, form: 64, fifaRank: 15, advancedToKO: true },
  { name: "S. Korea",    code: "kr", group: "K", powerScore: 60, attack: 62, defense: 59, form: 61, fifaRank: 22, advancedToKO: false },
  { name: "Czechia",     code: "cz", group: "K", powerScore: 62, attack: 61, defense: 63, form: 61, fifaRank: 27, advancedToKO: false },

  // Group L — Spain zone
  { name: "Spain",       code: "es", group: "L", powerScore: 91, attack: 89, defense: 86, form: 92, fifaRank: 8,  advancedToKO: true },
  { name: "Austria",     code: "at", group: "L", powerScore: 59, attack: 60, defense: 57, form: 58, fifaRank: 26, advancedToKO: true },
  { name: "Croatia",     code: "hr", group: "L", powerScore: 66, attack: 65, defense: 68, form: 65, fifaRank: 16, advancedToKO: false },
  { name: "Honduras",    code: "hn", group: "L", powerScore: 44, attack: 43, defense: 46, form: 43, fifaRank: 72, advancedToKO: false },

  // Group M — Turkiye zone
  { name: "Turkiye",     code: "tr", group: "M", powerScore: 68, attack: 67, defense: 65, form: 69, fifaRank: 19, advancedToKO: true },
  { name: "Belgium",     code: "be", group: "M", powerScore: 76, attack: 77, defense: 73, form: 74, fifaRank: 9,  advancedToKO: true },
  { name: "Bosnia",      code: "ba", group: "M", powerScore: 55, attack: 54, defense: 56, form: 54, fifaRank: 48, advancedToKO: false },
  { name: "S. Africa",   code: "za", group: "M", powerScore: 52, attack: 51, defense: 53, form: 51, fifaRank: 45, advancedToKO: false },

  // Group N — Switzerland zone
  { name: "Switzerland", code: "ch", group: "N", powerScore: 67, attack: 64, defense: 71, form: 65, fifaRank: 13, advancedToKO: true },
  { name: "Colombia",    code: "co", group: "N", powerScore: 72, attack: 73, defense: 68, form: 70, fifaRank: 10, advancedToKO: true },
  { name: "Cameroon",    code: "cm", group: "N", powerScore: 58, attack: 59, defense: 56, form: 57, fifaRank: 31, advancedToKO: false },
  { name: "Saudi Arabia",code: "sa", group: "N", powerScore: 54, attack: 52, defense: 57, form: 53, fifaRank: 40, advancedToKO: false },
];

// Dedupe groups for display (pick one entry per team/group combo)
const DISPLAY_GROUPS: { label: string; teams: Team[] }[] = [
  {
    label: "Group A",
    teams: [
      { name: "Mexico",       code: "mx", group: "A", powerScore: 74, attack: 72, defense: 71, form: 74, fifaRank: 14, advancedToKO: true },
      { name: "Korea Rep.",   code: "kr", group: "A", powerScore: 62, attack: 63, defense: 61, form: 62, fifaRank: 22, advancedToKO: true },
      { name: "Czechia",      code: "cz", group: "A", powerScore: 61, attack: 60, defense: 62, form: 60, fifaRank: 27, advancedToKO: false },
      { name: "South Africa", code: "za", group: "A", powerScore: 48, attack: 47, defense: 50, form: 47, fifaRank: 45, advancedToKO: false },
    ],
  },
  {
    label: "Group B",
    teams: [
      { name: "Canada",       code: "ca", group: "B", powerScore: 71, attack: 70, defense: 70, form: 72, fifaRank: 13, advancedToKO: true },
      { name: "Switzerland",  code: "ch", group: "B", powerScore: 67, attack: 64, defense: 71, form: 65, fifaRank: 13, advancedToKO: true },
      { name: "Bosnia & Herz",code: "ba", group: "B", powerScore: 55, attack: 54, defense: 56, form: 54, fifaRank: 48, advancedToKO: false },
      { name: "Qatar",        code: "qa", group: "B", powerScore: 44, attack: 43, defense: 46, form: 43, fifaRank: 37, advancedToKO: false },
    ],
  },
  {
    label: "Group C",
    teams: [
      { name: "Brazil",       code: "br", group: "C", powerScore: 93, attack: 91, defense: 88, form: 94, fifaRank: 1,  advancedToKO: true },
      { name: "Morocco",      code: "ma", group: "C", powerScore: 65, attack: 62, defense: 68, form: 64, fifaRank: 15, advancedToKO: true },
      { name: "Scotland",     code: "gb-sct", group: "C", powerScore: 63, attack: 64, defense: 62, form: 61, fifaRank: 29, advancedToKO: false },
      { name: "Haiti",        code: "ht", group: "C", powerScore: 31, attack: 30, defense: 33, form: 29, fifaRank: 101, advancedToKO: false },
    ],
  },
  {
    label: "Group D",
    teams: [
      { name: "USA",          code: "us", group: "D", powerScore: 73, attack: 70, defense: 72, form: 74, fifaRank: 11, advancedToKO: true },
      { name: "Türkiye",      code: "tr", group: "D", powerScore: 68, attack: 67, defense: 65, form: 69, fifaRank: 19, advancedToKO: true },
      { name: "Paraguay",     code: "py", group: "D", powerScore: 58, attack: 57, defense: 59, form: 58, fifaRank: 32, advancedToKO: false },
      { name: "Australia",    code: "au", group: "D", powerScore: 57, attack: 56, defense: 58, form: 56, fifaRank: 23, advancedToKO: false },
    ],
  },
  {
    label: "Group E",
    teams: [
      { name: "Germany",      code: "de", group: "E", powerScore: 82, attack: 83, defense: 80, form: 79, fifaRank: 5,  advancedToKO: true },
      { name: "Côte d'Ivoire",code: "ci", group: "E", powerScore: 65, attack: 66, defense: 63, form: 64, fifaRank: 28, advancedToKO: true },
      { name: "Ecuador",      code: "ec", group: "E", powerScore: 61, attack: 62, defense: 59, form: 60, fifaRank: 35, advancedToKO: false },
      { name: "Curaçao",      code: "cw", group: "E", powerScore: 38, attack: 37, defense: 39, form: 37, fifaRank: 80, advancedToKO: false },
    ],
  },
  {
    label: "Group F",
    teams: [
      { name: "Netherlands",  code: "nl", group: "F", powerScore: 79, attack: 78, defense: 76, form: 80, fifaRank: 6,  advancedToKO: true },
      { name: "Japan",        code: "jp", group: "F", powerScore: 64, attack: 63, defense: 65, form: 65, fifaRank: 17, advancedToKO: true },
      { name: "Sweden",       code: "se", group: "F", powerScore: 61, attack: 62, defense: 63, form: 59, fifaRank: 21, advancedToKO: false },
      { name: "Tunisia",      code: "tn", group: "F", powerScore: 55, attack: 54, defense: 57, form: 53, fifaRank: 26, advancedToKO: false },
    ],
  },
  {
    label: "Group G",
    teams: [
      { name: "Belgium",      code: "be", group: "G", powerScore: 76, attack: 77, defense: 73, form: 74, fifaRank: 9,  advancedToKO: true },
      { name: "IR Iran",      code: "ir", group: "G", powerScore: 60, attack: 58, defense: 62, form: 59, fifaRank: 25, advancedToKO: true },
      { name: "Egypt",        code: "eg", group: "G", powerScore: 59, attack: 57, defense: 61, form: 57, fifaRank: 34, advancedToKO: false },
      { name: "New Zealand",  code: "nz", group: "G", powerScore: 44, attack: 43, defense: 46, form: 43, fifaRank: 93, advancedToKO: false },
    ],
  },
  {
    label: "Group H",
    teams: [
      { name: "Spain",        code: "es", group: "H", powerScore: 91, attack: 89, defense: 86, form: 92, fifaRank: 8,  advancedToKO: true },
      { name: "Uruguay",      code: "uy", group: "H", powerScore: 65, attack: 67, defense: 64, form: 63, fifaRank: 18, advancedToKO: true },
      { name: "Saudi Arabia", code: "sa", group: "H", powerScore: 54, attack: 52, defense: 57, form: 53, fifaRank: 40, advancedToKO: false },
      { name: "Cabo Verde",   code: "cv", group: "H", powerScore: 43, attack: 42, defense: 45, form: 42, fifaRank: 62, advancedToKO: false },
    ],
  },
  {
    label: "Group I",
    teams: [
      { name: "France",       code: "fr", group: "I", powerScore: 89, attack: 88, defense: 87, form: 87, fifaRank: 3,  advancedToKO: true },
      { name: "Norway",       code: "no", group: "I", powerScore: 70, attack: 74, defense: 67, form: 72, fifaRank: 12, advancedToKO: true },
      { name: "Senegal",      code: "sn", group: "I", powerScore: 67, attack: 65, defense: 66, form: 68, fifaRank: 20, advancedToKO: false },
      { name: "Iraq",         code: "iq", group: "I", powerScore: 47, attack: 46, defense: 48, form: 46, fifaRank: 58, advancedToKO: false },
    ],
  },
  {
    label: "Group J",
    teams: [
      { name: "Argentina",    code: "ar", group: "J", powerScore: 90, attack: 92, defense: 84, form: 88, fifaRank: 2,  advancedToKO: true },
      { name: "Austria",      code: "at", group: "J", powerScore: 59, attack: 60, defense: 57, form: 58, fifaRank: 26, advancedToKO: true },
      { name: "Algeria",      code: "dz", group: "J", powerScore: 60, attack: 59, defense: 61, form: 58, fifaRank: 30, advancedToKO: false },
      { name: "Jordan",       code: "jo", group: "J", powerScore: 46, attack: 45, defense: 48, form: 45, fifaRank: 66, advancedToKO: false },
    ],
  },
  {
    label: "Group K",
    teams: [
      { name: "Portugal",     code: "pt", group: "K", powerScore: 83, attack: 86, defense: 77, form: 82, fifaRank: 7,  advancedToKO: true },
      { name: "Colombia",     code: "co", group: "K", powerScore: 72, attack: 73, defense: 68, form: 70, fifaRank: 10, advancedToKO: true },
      { name: "Uzbekistan",   code: "uz", group: "K", powerScore: 52, attack: 51, defense: 53, form: 50, fifaRank: 68, advancedToKO: false },
      { name: "Congo DR",     code: "cd", group: "K", powerScore: 49, attack: 48, defense: 51, form: 48, fifaRank: 54, advancedToKO: false },
    ],
  },
  {
    label: "Group L",
    teams: [
      { name: "England",      code: "gb-eng", group: "L", powerScore: 80, attack: 81, defense: 78, form: 81, fifaRank: 4,  advancedToKO: true },
      { name: "Croatia",      code: "hr", group: "L", powerScore: 66, attack: 65, defense: 68, form: 65, fifaRank: 16, advancedToKO: true },
      { name: "Ghana",        code: "gh", group: "L", powerScore: 57, attack: 56, defense: 58, form: 55, fifaRank: 51, advancedToKO: false },
      { name: "Panama",       code: "pa", group: "L", powerScore: 51, attack: 49, defense: 53, form: 50, fifaRank: 43, advancedToKO: false },
    ],
  },
];

// ── Bracket data ─────────────────────────────────────────────────────────────
// Left side (feeds into Spain winning their semi)
const R32_LEFT: BracketMatch[] = [
  { id: "l1",  team1: { name: "Germany",     code: "de",     goals: 1.71, winner: true  }, team2: { name: "Paraguay",  code: "py",     goals: 0.77, winner: false } },
  { id: "l2",  team1: { name: "France",      code: "fr",     goals: 2.32, winner: true  }, team2: { name: "Sweden",    code: "se",     goals: 0.52, winner: false } },
  { id: "l3",  team1: { name: "S. Korea",    code: "kr",     goals: 0.76, winner: false }, team2: { name: "Switzerland",code:"ch",     goals: 1.21, winner: true  } },
  { id: "l4",  team1: { name: "Netherlands", code: "nl",     goals: 1.71, winner: true  }, team2: { name: "Morocco",   code: "ma",     goals: 0.75, winner: false } },
  { id: "l5",  team1: { name: "Colombia",    code: "co",     goals: 1.18, winner: false }, team2: { name: "Croatia",   code: "hr",     goals: 1.11, winner: false } },
  { id: "l6",  team1: { name: "Spain",       code: "es",     goals: 2.14, winner: true  }, team2: { name: "Austria",   code: "at",     goals: 0.56, winner: false } },
  { id: "l7",  team1: { name: "Turkiye",     code: "tr",     goals: 1.33, winner: true  }, team2: { name: "Bosnia",    code: "ba",     goals: 0.66, winner: false } },
  { id: "l8",  team1: { name: "Belgium",     code: "be",     goals: 1.26, winner: false }, team2: { name: "Czechia",   code: "cz",     goals: 0.82, winner: false } },
];

// Override l5 to let Colombia advance
const R16_LEFT: BracketMatch[] = [
  { id: "l9",  team1: { name: "Germany",     code: "de",     goals: 1.12, winner: false }, team2: { name: "France",      code: "fr",   goals: 1.75, winner: true  } },
  { id: "l10", team1: { name: "Switzerland", code: "ch",     goals: 0.76, winner: false }, team2: { name: "Netherlands", code: "nl",   goals: 1.46, winner: true  } },
  { id: "l11", team1: { name: "Colombia",    code: "co",     goals: 0.69, winner: false }, team2: { name: "Spain",       code: "es",   goals: 1.95, winner: true  } },
  { id: "l12", team1: { name: "Turkiye",     code: "tr",     goals: 1.06, winner: true  }, team2: { name: "Belgium",     code: "be",   goals: 0.94, winner: false } },
];

const QF_LEFT: BracketMatch[] = [
  { id: "l13", team1: { name: "France",      code: "fr",     goals: 1.84, winner: true  }, team2: { name: "Netherlands", code: "nl",   goals: 1.03, winner: false } },
  { id: "l14", team1: { name: "Spain",       code: "es",     goals: 2.18, winner: true  }, team2: { name: "Turkiye",      code: "tr",   goals: 0.54, winner: false } },
];

const SF_LEFT: BracketMatch = {
  id: "l15",
  team1: { name: "France", code: "fr", goals: 1.25, winner: false },
  team2: { name: "Spain",  code: "es", goals: 1.49, winner: true  },
};

// Right side (feeds into Brazil winning their semi)
const R32_RIGHT: BracketMatch[] = [
  { id: "r1",  team1: { name: "Brazil",    code: "br", goals: 1.75, winner: true  }, team2: { name: "Japan",      code: "jp", goals: 0.80, winner: false } },
  { id: "r2",  team1: { name: "Ecuador",   code: "ec", goals: 0.87, winner: false }, team2: { name: "Norway",     code: "no", goals: 1.20, winner: true  } },
  { id: "r3",  team1: { name: "Mexico",    code: "mx", goals: 1.77, winner: true  }, team2: { name: "Scotland",   code: "gb-sct", goals: 0.67, winner: false } },
  { id: "r4",  team1: { name: "England",   code: "gb-eng", goals: 1.69, winner: true  }, team2: { name: "Uzbekistan", code: "uz", goals: 0.64, winner: false } },
  { id: "r5",  team1: { name: "Argentina", code: "ar", goals: 1.91, winner: true  }, team2: { name: "Uruguay",    code: "uy", goals: 0.59, winner: false } },
  { id: "r6",  team1: { name: "USA",       code: "us", goals: 1.35, winner: true  }, team2: { name: "Iran",       code: "ir", goals: 1.07, winner: false } },
  { id: "r7",  team1: { name: "Canada",    code: "ca", goals: 1.64, winner: true  }, team2: { name: "Egypt",      code: "eg", goals: 0.84, winner: false } },
  { id: "r8",  team1: { name: "Portugal",  code: "pt", goals: 1.50, winner: true  }, team2: { name: "Senegal",    code: "sn", goals: 0.90, winner: false } },
];

const R16_RIGHT: BracketMatch[] = [
  { id: "r9",  team1: { name: "Brazil",    code: "br", goals: 1.73, winner: true  }, team2: { name: "Norway",    code: "no", goals: 0.96, winner: false } },
  { id: "r10", team1: { name: "Mexico",    code: "mx", goals: 1.15, winner: false }, team2: { name: "England",   code: "gb-eng", goals: 1.23, winner: true  } },
  { id: "r11", team1: { name: "Argentina", code: "ar", goals: 2.20, winner: true  }, team2: { name: "USA",       code: "us", goals: 0.82, winner: false } },
  { id: "r12", team1: { name: "Canada",    code: "ca", goals: 1.08, winner: false }, team2: { name: "Portugal",  code: "pt", goals: 1.65, winner: true  } },
];

const QF_RIGHT: BracketMatch[] = [
  { id: "r13", team1: { name: "Brazil",    code: "br", goals: 1.53, winner: true  }, team2: { name: "England",   code: "gb-eng", goals: 1.11, winner: false } },
  { id: "r14", team1: { name: "Argentina", code: "ar", goals: 1.59, winner: true  }, team2: { name: "Portugal",  code: "pt", goals: 1.05, winner: false } },
];

// MODIFIED: Brazil beats Argentina in semi
const SF_RIGHT: BracketMatch = {
  id: "r15",
  team1: { name: "Brazil",    code: "br", goals: 1.58, winner: true  },
  team2: { name: "Argentina", code: "ar", goals: 1.21, winner: false },
};

// MODIFIED: Brazil beats Spain in final
const FINAL: BracketMatch = {
  id: "final",
  team1: { name: "Spain",  code: "es", goals: 1.29, winner: false },
  team2: { name: "Brazil", code: "br", goals: 1.59, winner: true  },
};

const THIRD_PLACE: BracketMatch = {
  id: "third",
  team1: { name: "France",    code: "fr", goals: 1.30, winner: false },
  team2: { name: "Argentina", code: "ar", goals: 1.45, winner: true  },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function MatchCard({ match, highlight = false, champion = false }: { match: BracketMatch; highlight?: boolean; champion?: boolean }) {
  return (
    <div className={`rounded-lg border ${champion ? "border-yellow-400 shadow-yellow-100 shadow-md" : "border-slate-200"} bg-white overflow-hidden`} style={{ minWidth: 148 }}>
      {champion && (
        <div className="bg-yellow-400 text-center text-[9px] font-black uppercase tracking-widest text-yellow-900 py-0.5">
          🏆 Champion
        </div>
      )}
      {[match.team1, match.team2].map((t, i) => (
        <div
          key={i}
          className={`flex items-center justify-between gap-2 px-2 py-1.5 ${i === 0 ? "border-b border-slate-100" : ""} ${t.winner ? "bg-[#031635]" : "bg-white"}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Flag code={t.code} size={16} />
            <span className={`text-[11px] font-${t.winner ? "bold" : "medium"} truncate ${t.winner ? "text-white" : "text-slate-700"}`}>
              {t.name}
            </span>
          </div>
          <span className={`text-[11px] font-bold tabular-nums shrink-0 ${t.winner ? "text-[#e05c2e]" : "text-slate-400"}`}>
            {t.goals.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RoundColumn({ title, matches, compact = false }: { title: string; matches: BracketMatch[]; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-0">
      <div className={`text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap`}>{title}</div>
      <div className="flex flex-col" style={{ gap: compact ? 4 : 8 }}>
        {matches.map(m => <MatchCard key={m.id} match={m} />)}
      </div>
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────────
function GroupCard({ group }: { group: { label: string; teams: Team[] } }) {
  const sorted = [...group.teams].sort((a, b) => b.powerScore - a.powerScore);
  const topScore = sorted[0].powerScore;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-[#031635] px-4 py-2.5 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white">{group.label}</span>
        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Power</span>
      </div>
      <div className="divide-y divide-slate-100">
        {sorted.map((team, i) => (
          <div key={team.name} className={`flex items-center gap-3 px-4 py-2.5 ${team.advancedToKO ? "" : "opacity-50"}`}>
            <span className="text-[10px] font-bold text-slate-300 w-3">{i + 1}</span>
            <Flag code={team.code} size={20} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[12px] font-${team.advancedToKO ? "bold" : "medium"} text-slate-900 truncate`}>
                  {team.name}
                  {team.advancedToKO && <span className="ml-1 text-[8px] font-bold text-emerald-600">✓ KO</span>}
                </span>
                <span className="text-[12px] font-black text-[#031635] tabular-nums shrink-0">{team.powerScore}</span>
              </div>
              <PowerBar value={(team.powerScore / topScore) * 100} color={team.advancedToKO ? "#031635" : "#94a3b8"} />
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 grid grid-cols-3 gap-1 text-[9px]">
        <div className="text-center">
          <div className="text-slate-400 uppercase tracking-wide">ATK</div>
          <div className="font-bold text-slate-700">{Math.round(sorted.reduce((s, t) => s + t.attack, 0) / sorted.length)}</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 uppercase tracking-wide">DEF</div>
          <div className="font-bold text-slate-700">{Math.round(sorted.reduce((s, t) => s + t.defense, 0) / sorted.length)}</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 uppercase tracking-wide">FORM</div>
          <div className="font-bold text-slate-700">{Math.round(sorted.reduce((s, t) => s + t.form, 0) / sorted.length)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Bracket (desktop horizontal, mobile simplified) ─────────────────────────
function BracketDesktop() {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="inline-flex items-start gap-3" style={{ minWidth: 1100 }}>

        {/* LEFT HALF */}
        {/* R32 */}
        <RoundColumn title="Round of 32" matches={R32_LEFT} />

        {/* R16 */}
        <div className="flex flex-col gap-0">
          <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap">Round of 16</div>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 38 }}>
            {R16_LEFT.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>

        {/* QF */}
        <div className="flex flex-col gap-0">
          <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap">Quarterfinals</div>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 114 }}>
            {QF_LEFT.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>

        {/* SF */}
        <div className="flex flex-col gap-0">
          <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap">Semifinals</div>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 266 }}>
            <MatchCard match={SF_LEFT} />
          </div>
        </div>

        {/* FINAL + THIRD */}
        <div className="flex flex-col gap-4">
          <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap">Final</div>
          <div style={{ marginTop: 342 }}>
            <MatchCard match={FINAL} champion />
          </div>
          <div className="mt-6">
            <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">3rd Place</div>
            <MatchCard match={THIRD_PLACE} />
          </div>
        </div>

        {/* SF RIGHT */}
        <div className="flex flex-col gap-0">
          <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap">Semifinals</div>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 266 }}>
            <MatchCard match={SF_RIGHT} />
          </div>
        </div>

        {/* QF RIGHT */}
        <div className="flex flex-col gap-0">
          <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap">Quarterfinals</div>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 114 }}>
            {QF_RIGHT.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>

        {/* R16 RIGHT */}
        <div className="flex flex-col gap-0">
          <div className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2 whitespace-nowrap">Round of 16</div>
          <div className="flex flex-col" style={{ gap: 8, marginTop: 38 }}>
            {R16_RIGHT.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>

        {/* R32 RIGHT */}
        <RoundColumn title="Round of 32" matches={R32_RIGHT} />

      </div>
    </div>
  );
}

// Mobile bracket — show each round as a collapsible accordion
function BracketMobile() {
  const [open, setOpen] = useState<string | null>("final");

  const rounds = [
    { id: "r32", label: "Round of 32", matches: [...R32_LEFT, ...R32_RIGHT] },
    { id: "r16", label: "Round of 16", matches: [...R16_LEFT, ...R16_RIGHT] },
    { id: "qf",  label: "Quarterfinals", matches: [...QF_LEFT, ...QF_RIGHT] },
    { id: "sf",  label: "Semifinals", matches: [SF_LEFT, SF_RIGHT] },
    { id: "final", label: "Final & 3rd Place", matches: [FINAL, THIRD_PLACE] },
  ];

  return (
    <div className="space-y-2">
      {rounds.map(r => (
        <div key={r.id} className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50"
            onClick={() => setOpen(open === r.id ? null : r.id)}
          >
            <span className="text-[12px] font-bold text-slate-800">{r.label}</span>
            <span className="text-slate-400 text-sm">{open === r.id ? "▲" : "▼"}</span>
          </button>
          {open === r.id && (
            <div className="px-4 pb-4 pt-2 grid grid-cols-2 gap-2 bg-white">
              {r.matches.map(m => (
                <MatchCard key={m.id} match={m} champion={m.id === "final"} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WorldCup2026() {
  usePageSeo({
    title: "FIFA World Cup 2026 Power Rankings & Bracket Predictions",
    description:
      "FIFA World Cup 2026 group stage power rankings, knockout bracket predictions, and team analytics. Model picks Brazil to beat Spain in the final. Covers all 48 teams across 12 groups.",
    path: "/world-cup",
    type: "website",
    structuredData: [
      // SportsEvent — the tournament itself
      {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: "FIFA World Cup 2026",
        startDate: "2026-06-11",
        endDate: "2026-07-19",
        location: {
          "@type": "Place",
          name: "United States, Canada & Mexico",
          address: { "@type": "PostalAddress", addressCountry: "US" },
        },
        sport: "Association Football",
        description:
          "The 2026 FIFA World Cup featuring 48 nations across 12 groups. Joe Knows Ball model predicts Brazil as champion.",
        url: "https://www.joeknowsball.com/world-cup",
        organizer: { "@type": "Organization", name: "FIFA", url: "https://www.fifa.com" },
      },
      // BreadcrumbList
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.joeknowsball.com" },
          { "@type": "ListItem", position: 2, name: "World Cup 2026", item: "https://www.joeknowsball.com/world-cup" },
        ],
      },
      // FAQPage — helps capture featured snippets
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Who does the Joe Knows Ball model predict to win the 2026 World Cup?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The Joe Knows Ball model predicts Brazil to win the 2026 FIFA World Cup, beating Spain 1.59–1.29 in the final and defeating Argentina 1.58–1.21 in the semi-finals.",
            },
          },
          {
            "@type": "Question",
            name: "How is the World Cup 2026 power score calculated?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The power score is a composite of five factors: FIFA ranking (30%), attack rating based on qualifying goals scored (25%), defense rating based on goals conceded (20%), recent form over the last 10 matches (15%), and tournament experience (10%).",
            },
          },
          {
            "@type": "Question",
            name: "How many teams are in the 2026 FIFA World Cup?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The 2026 FIFA World Cup features 48 teams divided into 12 groups of 4. The top 2 teams from each group plus the 8 best third-place finishers advance to the Round of 32.",
            },
          },
          {
            "@type": "Question",
            name: "Where is the 2026 FIFA World Cup being held?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The 2026 FIFA World Cup is co-hosted by the United States, Canada, and Mexico — the first World Cup held across three countries.",
            },
          },
        ],
      },
      // WebPage with additional metadata
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "FIFA World Cup 2026 Power Rankings & Bracket | Joe Knows Ball",
        description:
          "Group stage power rankings and knockout bracket predictions for the 2026 FIFA World Cup. Brazil predicted champion.",
        url: "https://www.joeknowsball.com/world-cup",
        publisher: {
          "@type": "Organization",
          name: "Joe Knows Ball",
          url: "https://www.joeknowsball.com",
          logo: { "@type": "ImageObject", url: "https://www.joeknowsball.com/favicon-32x32.png" },
        },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.joeknowsball.com" },
            { "@type": "ListItem", position: 2, name: "World Cup 2026", item: "https://www.joeknowsball.com/world-cup" },
          ],
        },
      },
    ],
  });

  const [tab, setTab] = useState<"groups" | "bracket">("groups");

  return (
    <SiteShell>
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-[#031635]">
        {/* background pattern */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, #e05c2e 0, #e05c2e 1px, transparent 0, transparent 50%)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">⚽</span>
            <span className="rounded-full bg-[#e05c2e] px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">2026 Model</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-1">
            FIFA World Cup 2026
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl">
            Group stage power rankings and knockout stage predictions. Scores based on FIFA ranking, attack/defense metrics, and form.
          </p>
          {/* Champion callout */}
          <div className="mt-5 inline-flex items-center gap-3 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3">
            <Flag code="br" size={28} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">Predicted Champion</div>
              <div className="text-white font-black text-lg">🏆 Brazil</div>
            </div>
            <div className="ml-4 text-slate-400 text-xs hidden sm:block">
              Beats Spain 1.59 – 1.29 in the final<br/>
              Defeats Argentina 1.58 – 1.21 in the semi
            </div>
          </div>
          {/* Analyzer link */}
          <div className="mt-4">
            <Link
              to="/world-cup/analyzer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#e05c2e]/40 bg-[#e05c2e]/10 px-4 py-2.5 text-sm font-bold text-[#e05c2e] hover:bg-[#e05c2e]/20 transition"
            >
              ⚔️ Matchup Analyzer — Compare any two teams →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 flex gap-0">
          {(["groups", "bracket"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-[12px] font-bold uppercase tracking-wide border-b-2 transition-colors ${
                tab === t
                  ? "border-[#e05c2e] text-[#e05c2e]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t === "groups" ? "⚽ Group Rankings" : "🏆 Bracket"}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">

        {/* ── Metric legend ── */}
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-600">
          <div className="font-bold text-slate-800 mb-2">📊 Power Score Methodology</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span><span className="font-bold text-[#031635]">FIFA Rank</span> — 30% weight</span>
            <span><span className="font-bold text-orange-600">Attack Rating</span> — 25% (goals scored in qualifying)</span>
            <span><span className="font-bold text-blue-600">Defense Rating</span> — 20% (goals conceded, inverted)</span>
            <span><span className="font-bold text-emerald-600">Form</span> — 15% (last 10 matches win rate)</span>
            <span><span className="font-bold text-slate-600">Tournament XP</span> — 10% (World Cup finals appearances)</span>
          </div>
        </div>

        {/* ── GROUP RANKINGS ── */}
        {tab === "groups" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-[#031635]">Group Stage Power Rankings</h2>
              <span className="text-[10px] text-slate-400 font-semibold">✓ KO = Advanced to knockout round</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {DISPLAY_GROUPS.map(g => (
                <GroupCard key={g.label} group={g} />
              ))}
            </div>

            {/* Top 10 overall */}
            <div className="mt-8">
              <h2 className="text-lg font-black text-[#031635] mb-4">🌎 Overall Power Rankings — Top 16</h2>
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#031635] text-[10px] uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-slate-400">#</th>
                      <th className="px-4 py-2.5 text-left text-white">Team</th>
                      <th className="px-4 py-2.5 text-center text-slate-400">Power</th>
                      <th className="px-4 py-2.5 text-center text-slate-400 hidden sm:table-cell">ATK</th>
                      <th className="px-4 py-2.5 text-center text-slate-400 hidden sm:table-cell">DEF</th>
                      <th className="px-4 py-2.5 text-center text-slate-400 hidden sm:table-cell">Form</th>
                      <th className="px-4 py-2.5 text-center text-slate-400 hidden md:table-cell">FIFA Rank</th>
                      <th className="px-4 py-2.5 text-center text-slate-400">Grp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "Brazil",      code: "br", group: "A", powerScore: 93, attack: 91, defense: 88, form: 94, fifaRank: 1 },
                      { name: "Spain",       code: "es", group: "G", powerScore: 91, attack: 89, defense: 86, form: 92, fifaRank: 8 },
                      { name: "Argentina",   code: "ar", group: "E", powerScore: 90, attack: 92, defense: 84, form: 88, fifaRank: 2 },
                      { name: "France",      code: "fr", group: "H", powerScore: 89, attack: 88, defense: 87, form: 87, fifaRank: 3 },
                      { name: "Portugal",    code: "pt", group: "E", powerScore: 83, attack: 86, defense: 77, form: 82, fifaRank: 7 },
                      { name: "Germany",     code: "de", group: "H", powerScore: 82, attack: 83, defense: 80, form: 79, fifaRank: 5 },
                      { name: "England",     code: "gb-eng", group: "D", powerScore: 80, attack: 81, defense: 78, form: 81, fifaRank: 4 },
                      { name: "Netherlands", code: "nl", group: "I", powerScore: 79, attack: 78, defense: 76, form: 80, fifaRank: 6 },
                      { name: "Belgium",     code: "be", group: "M", powerScore: 76, attack: 77, defense: 73, form: 74, fifaRank: 9 },
                      { name: "Mexico",      code: "mx", group: "C", powerScore: 74, attack: 72, defense: 71, form: 74, fifaRank: 14 },
                      { name: "USA",         code: "us", group: "F", powerScore: 73, attack: 70, defense: 72, form: 74, fifaRank: 11 },
                      { name: "Canada",      code: "ca", group: "F", powerScore: 71, attack: 70, defense: 70, form: 72, fifaRank: 13 },
                      { name: "Norway",      code: "no", group: "B", powerScore: 70, attack: 74, defense: 67, form: 72, fifaRank: 12 },
                      { name: "Turkiye",     code: "tr", group: "I", powerScore: 68, attack: 67, defense: 65, form: 69, fifaRank: 19 },
                      { name: "Switzerland", code: "ch", group: "D", powerScore: 67, attack: 64, defense: 71, form: 65, fifaRank: 13 },
                      { name: "Senegal",     code: "sn", group: "J", powerScore: 67, attack: 65, defense: 66, form: 68, fifaRank: 20 },
                    ].map((t, i) => (
                      <tr key={t.name} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        <td className="px-4 py-2.5 text-[11px] font-black text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Flag code={t.code} size={18} />
                            <span className="text-[12px] font-semibold text-slate-900">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-black text-white"
                            style={{ backgroundColor: t.powerScore >= 88 ? "#14532d" : t.powerScore >= 78 ? "#166534" : t.powerScore >= 68 ? "#1e3a8a" : "#475569" }}>
                            {t.powerScore}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-[11px] text-slate-600 hidden sm:table-cell">{t.attack}</td>
                        <td className="px-4 py-2.5 text-center text-[11px] text-slate-600 hidden sm:table-cell">{t.defense}</td>
                        <td className="px-4 py-2.5 text-center text-[11px] text-slate-600 hidden sm:table-cell">{t.form}</td>
                        <td className="px-4 py-2.5 text-center text-[11px] text-slate-400 hidden md:table-cell">#{t.fifaRank}</td>
                        <td className="px-4 py-2.5 text-center text-[11px] font-bold text-[#031635]">{t.group}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── BRACKET ── */}
        {tab === "bracket" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-[#031635]">Knockout Stage Bracket</h2>
              <span className="text-[10px] text-slate-400">Numbers = predicted goals scored</span>
            </div>
            <div className="hidden md:block">
              <BracketDesktop />
            </div>
            <div className="md:hidden">
              <BracketMobile />
            </div>
          </>
        )}
      </div>
    </SiteShell>
  );
}
