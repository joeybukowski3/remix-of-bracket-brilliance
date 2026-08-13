import { describe, expect, it } from "vitest";
import parConsensusSource from "../../../data/fantasy/2026-par-consensus.json";
import {
  FANTASY_PAR_RANKINGS,
  FANTASY_PAR_ROWS,
  FANTASY_POSITION_RESEARCH_BOARDS,
  PAR_POSITION_LIMITS,
  PAR_POSITIONS,
  PAR_TIER_BOUNDARIES,
  type FantasyParSourceRow,
} from "@/lib/fantasy/parRankings";
import { FANTASY_RANKINGS, countByPosition } from "@/lib/fantasy/rankings";

const sourceRows = parConsensusSource as readonly FantasyParSourceRow[];

describe("2026 consensus PAR rankings", () => {
  it("preserves the approved player metric checkpoints exactly", () => {
    const checkpoints = [
      { player: "Josh Allen", projectedPpg: 23.272886075949366, replacementPpg: 17.566666666666666, par: 5.706219409282699 },
      { player: "Jahmyr Gibbs", par: 10.717416610700697 },
      { player: "Ja'Marr Chase", par: 9.927564102564103 },
      { player: "Brock Bowers", par: 7.475693555271018 },
    ];

    for (const checkpoint of checkpoints) {
      const row = FANTASY_PAR_ROWS.find((entry) => entry.player === checkpoint.player);
      expect(row, checkpoint.player).toBeDefined();
      expect(row?.parPerGame).toBe(checkpoint.par);
      if (checkpoint.projectedPpg != null) expect(row?.projectedPpg).toBe(checkpoint.projectedPpg);
      if (checkpoint.replacementPpg != null) expect(row?.replacementPpg).toBe(checkpoint.replacementPpg);
    }
  });

  it("resolves the exact approved universe without K or DST rows", () => {
    expect(FANTASY_PAR_ROWS).toHaveLength(180);
    expect(FANTASY_PAR_ROWS.some((row) => ["K", "DST"].includes(row.position))).toBe(false);
    for (const position of PAR_POSITIONS) {
      expect(FANTASY_PAR_RANKINGS[position]).toHaveLength(PAR_POSITION_LIMITS[position]);
    }
  });

  it("copies every analytical value directly from the approved JSON", () => {
    for (const row of FANTASY_PAR_ROWS) {
      const source = sourceRows.find(
        (entry) => entry.Player === row.player && entry.Position === row.position,
      );
      expect(source, row.player).toBeDefined();
      expect(row.projectedGames).toBe(source?.["Projected Games"]);
      expect(row.projectedFantasyPoints).toBe(source?.["2026 Projected Fantasy Points"]);
      expect(row.projectedPpg).toBe(source?.["2026 Projected PPG"]);
      expect(row.replacementPpg).toBe(source?.["Historical Replacement PPG"]);
      expect(row.parPerGame).toBe(source?.["PAR/G"]);
      expect(row.projectedSeasonPar).toBe(source?.["Projected Season PAR"]);
    }
  });

  it("establishes PAR rank from descending PAR/G inside each approved universe", () => {
    for (const position of PAR_POSITIONS) {
      const byParRank = [...FANTASY_PAR_RANKINGS[position]].sort((a, b) => a.parRank - b.parRank);
      expect(byParRank.map((row) => row.parRank)).toEqual(
        Array.from({ length: PAR_POSITION_LIMITS[position] }, (_, index) => index + 1),
      );
      for (let index = 1; index < byParRank.length; index += 1) {
        expect(byParRank[index - 1].parPerGame).toBeGreaterThanOrEqual(byParRank[index].parPerGame);
      }
    }
  });

  it("assigns every exact approved tier boundary from PAR rank", () => {
    for (const position of PAR_POSITIONS) {
      const rows = FANTASY_PAR_RANKINGS[position];
      for (const boundary of PAR_TIER_BOUNDARIES[position]) {
        const ranks = rows
          .filter((row) => row.tier === boundary.tier)
          .map((row) => row.parRank)
          .sort((a, b) => a - b);
        expect(ranks).toEqual(
          Array.from({ length: boundary.end - boundary.start + 1 }, (_, index) => boundary.start + index),
        );
      }
    }
  });

  it("does not substitute consensus position rank for PAR rank", () => {
    const mismatches = FANTASY_PAR_ROWS.filter(
      (row) => row.parRank !== row.consensusPositionRank,
    );
    expect(mismatches.length).toBeGreaterThan(0);
    for (const row of mismatches) {
      const boundary = PAR_TIER_BOUNDARIES[row.position].find(
        ({ start, end }) => row.parRank >= start && row.parRank <= end,
      );
      expect(row.tier).toBe(boundary?.tier);
    }
  });

  it("uses JKB position rank as row order inside each tier", () => {
    for (const position of PAR_POSITIONS) {
      for (const boundary of PAR_TIER_BOUNDARIES[position]) {
        const rows = FANTASY_PAR_RANKINGS[position].filter((row) => row.tier === boundary.tier);
        const rankedRows = rows.filter((row) => row.jkbPositionRank != null);
        expect(rankedRows.map((row) => row.jkbPositionRank)).toEqual(
          [...rankedRows]
            .sort((a, b) => a.jkbPositionRank! - b.jkbPositionRank!)
            .map((row) => row.jkbPositionRank),
        );
        expect(rows.findIndex((row) => row.jkbPositionRank == null)).toBeGreaterThanOrEqual(
          rankedRows.length === rows.length ? -1 : rankedRows.length,
        );
      }
    }
  });

  it("keeps every JKB position row accessible while limiting tiers to approved universes", () => {
    const expectedCounts = countByPosition(FANTASY_RANKINGS.rows);
    for (const position of PAR_POSITIONS) {
      const board = FANTASY_POSITION_RESEARCH_BOARDS[position];
      const tierRows = board.tierGroups.flatMap((group) => group.rows);
      const visibleJkbRows = [
        ...tierRows.flatMap((row) => row.jkb ? [row.jkb] : []),
        ...board.outsideDraftPool.map((row) => row.jkb!),
      ];
      expect(tierRows).toHaveLength(PAR_POSITION_LIMITS[position]);
      expect(board.jkbRowCount).toBe(expectedCounts[position]);
      expect(visibleJkbRows).toHaveLength(expectedCounts[position]);
      expect(new Set(visibleJkbRows.map((row) => row.overallRank)).size).toBe(expectedCounts[position]);
      expect(board.outsideDraftPool.every((row) => row.tier == null && row.par == null)).toBe(true);
    }
  });

  it("retains the historical QB baseline when all eligible QBs have positive PAR", () => {
    expect(FANTASY_PAR_RANKINGS.QB.every((row) => row.parPerGame > 0)).toBe(true);
    expect(new Set(FANTASY_PAR_RANKINGS.QB.map((row) => row.replacementPpg))).toEqual(
      new Set([17.566666666666666]),
    );
  });
});
