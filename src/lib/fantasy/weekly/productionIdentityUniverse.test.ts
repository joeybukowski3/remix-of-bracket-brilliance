import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../../../scripts/lib/nfl-schedules-results-core.mjs";
import { auditedProductionAlias, normalizeProductionPlayerName, resolveProductionProjectionIdentity, type ProductionIdentitySourceRow } from "./productionIdentity";

type CsvRow = Record<string, string>;
const positions = new Set(["QB", "RB", "WR", "TE"]);
const projections = JSON.parse(readFileSync(join(process.cwd(), "data/fantasy/2026-par-consensus.json"), "utf8")) as Array<{ Player: string; Team: string; Position: "QB" | "RB" | "WR" | "TE"; "Source ID": string }>;
const source = (row: CsvRow, roster: boolean): ProductionIdentitySourceRow => ({
  gsisId: row.gsis_id || null, pfrId: row.pfr_id || null,
  playerName: roster ? row.full_name : row.display_name, position: row.position,
  team: (roster ? row.team : row.team_abbr) || null, status: row.status || null,
});
const players = (parseCsv(readFileSync(join(process.cwd(), "data/nfl/nflverse/players/players.csv"), "utf8")) as CsvRow[]).map((row) => source(row, false));
const roster = (parseCsv(readFileSync(join(process.cwd(), "data/nfl/nflverse/weekly-rosters/roster_weekly_2026.csv"), "utf8")) as CsvRow[])
  .filter((row) => row.season === "2026" && row.week === "1" && row.game_type === "REG").map((row) => source(row, true));
const results = projections.filter((row) => positions.has(row.Position)).map((projection) => ({ projection, resolution: resolveProductionProjectionIdentity({
  projection: { sourceId: projection["Source ID"], playerName: projection.Player, position: projection.Position, team: projection.Team }, rosterRows: roster, playerRows: players,
}) }));

describe("2026 Week 1 projection identity universe", () => {
  it("contains only the audited direct PFR collisions", () => {
    const conflicts = results.filter(({ resolution }) => resolution.directPfrConflict);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.map(({ projection }) => projection.Player)).toEqual(expect.arrayContaining(["Barion Brown", "Darren Waller", "Jahmyr Gibbs", "Josh Allen"]));
    for (const { projection, resolution } of conflicts.filter(({ resolution }) => resolution.resolved)) {
      const alias = auditedProductionAlias({ sourceId: projection["Source ID"], playerName: projection.Player, position: projection.Position, team: projection.Team });
      const resolvedName = normalizeProductionPlayerName(resolution.roster!.playerName);
      expect(resolvedName === normalizeProductionPlayerName(projection.Player) || resolvedName === alias).toBe(true);
      expect(resolution.roster!.position).toBe(projection.Position);
    }
  });

  it("never resolves a projection to another name or position", () => {
    for (const { projection, resolution } of results.filter(({ resolution }) => resolution.resolved)) {
      const normalizedRoster = normalizeProductionPlayerName(resolution.roster!.playerName);
      const normalizedProjection = normalizeProductionPlayerName(projection.Player);
      const alias = auditedProductionAlias({ sourceId: projection["Source ID"], playerName: projection.Player, position: projection.Position, team: projection.Team });
      expect(normalizedRoster === normalizedProjection || normalizedRoster === alias).toBe(true);
      expect(resolution.roster!.position).toBe(projection.Position);
    }
  });

  it("never emits the same canonical GSIS for multiple projections", () => {
    const ids = results.flatMap(({ resolution }) => resolution.resolved ? [resolution.gsisId] : []);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(["Barion Brown", "Bo Melton", "Darren Waller"])("keeps %s fail-closed", (playerName) => {
    expect(results.find(({ projection }) => projection.Player === playerName)?.resolution.resolved).toBe(false);
  });
});
