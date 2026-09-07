/**
 * One-shot approved edit of the curated nfl-power-v0.4-beta artifact:
 * the Week-1 post-preseason forward-looking refresh approved 2026-09-07.
 *
 * Source: 2026 VSiN NFL Betting Guide 2.0 (post-preseason), pp. 29-45.
 * Only personnelAdjustment / returningInjuryAdjustment are touched; the
 * derived projectionAdjustment2026, rating2026 and rank are then reconciled
 * exactly as the artifact contract defines them. Serialization matches
 * scripts/import-nfl-power-v04-projection.mjs (2-space, trailing newline).
 */
import { readFileSync, writeFileSync } from "node:fs";

const PATH = "public/data/nfl/2026/projected-power-ratings-v04.json";
const REFRESH_DATE = "2026-09-07";

/** abbr -> { personnelAdjustment?, returningInjuryAdjustment?, notes } */
const CHANGES = {
  atl: {
    personnelAdjustment: 0.0,
    notes: "Post-preseason review (VSiN 2.0 p42): the preseason invalidated the Tua-addition premise behind the prior +2.5 — Tua did not seize the starting job and Michael Penix Jr. was too banged up for meaningful reps. Jalon Walker's torn ACL and James Pearce Jr.'s eight-game suspension further thin the pass rush. Kevin Stefanski coaching credit retained.",
  },
  ind: {
    personnelAdjustment: -2.0,
    returningInjuryAdjustment: 0.5,
    notes: "Post-preseason review (VSiN 2.0 p34): Daniel Jones opens the season off an Achilles tear, Michael Pittman Jr. was traded to Pittsburgh and replaced late by 34-year-old Keenan Allen, and Charvarius Ward is not 100% with a back injury. Justin Walley's return from a torn ACL is credited separately as returningInjuryAdjustment.",
  },
  ne: {
    personnelAdjustment: 1.0,
    notes: "Personnel credit rebalanced (VSiN 2.0 p31): the prior +2.5 counted the A.J. Brown and Romeo Doubs inflow without the offsetting Stefon Diggs (85-1,013) and Kayshon Boutte (33-551-6) outflow.",
  },
  car: {
    personnelAdjustment: -1.5,
    notes: "Post-preseason review (VSiN 2.0 p42): both starting tackles are compromised — Ikem Ekwonu on the PUP list and Taylor Moton diagnosed with a blood clot in his lung — with the offensive line struggling badly in joint practices, and Nic Scourton lost for the season from an already-thin back seven.",
  },
  hou: {
    personnelAdjustment: -1.0,
    notes: "Post-preseason review (VSiN 2.0 p34): Jayden Higgins tore his ACL, removing the intended WR2 behind Nico Collins, net of the Kayshon Boutte and David Montgomery additions. Elite DeMeco Ryans defense unchanged.",
  },
  wsh: {
    personnelAdjustment: -1.0,
    notes: "Post-preseason review (VSiN 2.0 p39): Laremy Tunsil (left tackle) and Jer'Zhan Newton both suffered season-ending injuries, throwing both lines into flux, net of the Stefon Diggs addition. Newton's loss is partly mitigated by the switch to a 3-4.",
  },
  no: {
    personnelAdjustment: -0.75,
    notes: "Post-preseason review (VSiN 2.0 p43): Alvin Kamara will miss at least a month and rookie WR Jordyn Tyson — the intended WR2 behind Chris Olave — was injured in camp, net of the Travis Etienne Jr. addition and the Rashid Shaheed trade.",
  },
  bal: {
    personnelAdjustment: 1.0,
    notes: "Trey Hendrickson addition, reduced for the center position: Danny Pinter's season-ending patellar injury leaves Ethan Pocic or Jovaughn Gwyn behind the departed Tyler Linderbaum (VSiN 2.0 p32). New Jesse Minter staff still held neutral pending evidence. STRUCTURAL REVIEW FLAG: see _meta.reviewFlags.bal — BAL's 2025-only base differs materially from the multi-year 2026 Projection and VSiN views; that gap is a base-window question and was deliberately NOT closed with a synthetic upward adjustment.",
  },
  tb: {
    returningInjuryAdjustment: 0.5,
    notes: "Mike Evans departure downgrade retained; returning-injury credit added for a healthy Bucky Irving after the cleanest camp in the division, with no major injuries on either side of the ball (VSiN 2.0 p43).",
  },
};

/** Teams whose notes carry a standing flag but no numeric change. */
const FLAG_ONLY = {
  jax: "Guide strongly corroborates JKB strength; no major verified offseason adjustment applied. UNRESOLVED BENCHMARK OUTLIER: see _meta.reviewFlags.jax — JKB rates JAX materially higher than both VSiN and the 2026 Projection lens, but the post-preseason review found no concrete football evidence supporting a downgrade, so none was applied.",
};

const artifact = JSON.parse(readFileSync(PATH, "utf8"));
const round2 = (n) => Math.round(n * 100) / 100;

const before = new Map(artifact.teams.map((t) => [t.abbr, { rating: t.rating2026, rank: t.rank }]));

// Only approved teams are recomputed. Published rating2026 values carry their
// own independent rounding (the validator allows 0.15 tolerance for exactly
// this reason), so recomputing an UNCHANGED team from rating2025Adjusted would
// silently shift it by up to 0.05. Unapproved rows are therefore left byte-identical.
for (const team of artifact.teams) {
  const change = CHANGES[team.abbr];
  if (!change) {
    if (FLAG_ONLY[team.abbr]) team.notes = FLAG_ONLY[team.abbr];
    continue;
  }
  const c = team.components;
  const oldProjectionAdjustment = team.projectionAdjustment2026;
  if (change.personnelAdjustment !== undefined) c.personnelAdjustment = change.personnelAdjustment;
  if (change.returningInjuryAdjustment !== undefined) c.returningInjuryAdjustment = change.returningInjuryAdjustment;
  team.notes = change.notes;

  team.projectionAdjustment2026 = round2(c.personnelAdjustment + c.coachAdjustment + c.returningInjuryAdjustment);
  // Apply the NET delta to the published rating rather than re-deriving it, so
  // the approved net change is hit exactly and published rounding is preserved.
  team.rating2026 = round2(team.rating2026 + (team.projectionAdjustment2026 - oldProjectionAdjustment));
}

// Re-rank strictly by descending rating2026 and re-sort the array to match.
artifact.teams.sort((a, b) => b.rating2026 - a.rating2026 || a.abbr.localeCompare(b.abbr));
artifact.teams.forEach((t, i) => { t.rank = i + 1; });

const ties = artifact.teams.filter((t, i, arr) => i > 0 && arr[i - 1].rating2026 === t.rating2026);
if (ties.length) console.warn("WARNING: rating2026 ties present:", ties.map((t) => t.abbr).join(","));

artifact._meta.offseasonSnapshotVerifiedThrough = REFRESH_DATE;
artifact._meta.status =
  "week-1 final — post-preseason 32-team forward-looking review complete (2026 VSiN NFL Betting Guide 2.0, pp. 29-45, ingested 2026-09-07). " +
  "Remaining known gaps: the detailed luck panel is still transcribed only for _meta.luckCoverageTeams, and returningInjuryAdjustment is populated only where a concrete prior-season return was verified (it is not a league-wide neutral zero).";
artifact._meta.reviewFlags = {
  bal:
    "STRUCTURAL BASE-WINDOW REVIEW CANDIDATE. BAL's jkbV03Rating base is 2025-only (2025 net-EPA rank 16), while both the 2026 Projection lens (0.6/0.4 2025/2024 blend; BAL 2024 net-EPA rank 1) and Steve Makinen's post-preseason VSiN rating (28.5, third overall) place BAL far higher. The only concrete post-preseason information about BAL is negative (center). The disagreement is therefore about the base window, not about forward-looking inputs, and was deliberately NOT closed with a synthetic upward personnel/coaching adjustment. Revisit when the base-window methodology is reviewed.",
  jax:
    "UNRESOLVED BENCHMARK OUTLIER. JKB rates JAX materially higher than both the VSiN post-preseason power rating (24.0, ~17th) and the 2026 Projection composite (~16th). The post-preseason review of VSiN 2.0 p35 found no concrete football evidence — no material injury, suspension, or personnel loss — supporting a downgrade, so none was applied. Rating disagreement alone is not grounds for a change.",
};
artifact._meta.reviewSources = [
  "2026 VSiN NFL Betting Guide 2.0 (post-preseason), p29 Steve Makinen power ratings — INDEPENDENT BENCHMARK ONLY, never an additive input",
  "2026 VSiN NFL Betting Guide 2.0 (post-preseason), pp30-45 team previews — primary source for the personnel/injury/coaching review",
];

writeFileSync(PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log("abbr  before -> after   (rank before -> after)");
for (const t of artifact.teams) {
  const b = before.get(t.abbr);
  const moved = b.rating !== t.rating2026 || b.rank !== t.rank;
  console.log(
    `${t.abbr.toUpperCase().padEnd(4)} ${b.rating.toFixed(2).padStart(6)} -> ${t.rating2026.toFixed(2).padStart(6)}   (#${String(b.rank).padStart(2)} -> #${String(t.rank).padStart(2)})${moved ? "" : "   ="}`
  );
}
