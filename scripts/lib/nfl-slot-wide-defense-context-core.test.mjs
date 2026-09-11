import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSlotWideDefenseArtifact, normalizeSlotWideDefenseRows, parseSlotWideDefenseTable } from "./nfl-slot-wide-defense-context-core.mjs";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const REAL_FIXTURE = readFileSync(join(FIXTURES_DIR, "razzball-slot-wide-defense-2026-week1.html"), "utf8");

/** Mirrors identity.ts's normalizeNflTeamAbbr's alias set for this table's team codes, without importing TS from a .mjs test. */
function normalizeTeamAbbr(code) {
  const upper = String(code ?? "").trim().toUpperCase();
  const aliases = { ARZ: "ari", BLT: "bal", CLV: "cle", HST: "hou", LA: "lar", JAC: "jax", WAS: "wsh" };
  if (!upper) return null;
  return aliases[upper] ?? upper.toLowerCase();
}

describe("parseSlotWideDefenseTable", () => {
  it("parses the representative live-page fixture into 32 team rows, excluding the NFL Average summary row", () => {
    const result = parseSlotWideDefenseTable(REAL_FIXTURE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(32);
    expect(result.rows.some((row) => row.team === "NFL Average")).toBe(false);
  });

  it("parses PPG values as numbers and percentages as fractions", () => {
    const result = parseSlotWideDefenseTable(REAL_FIXTURE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const arz = result.rows.find((row) => row.team === "ARZ");
    expect(arz).toMatchObject({ totalPpgAllowed: 25.4, slotPpgAllowed: 10.3, widePpgAllowed: 15.2, slotPct: 0.35, widePct: 0.65, nextOpponent: "CIN" });
  });

  it("rejects HTML that does not contain the expected table id", () => {
    const result = parseSlotWideDefenseTable("<html><body><p>no table here</p></body></html>");
    expect(result.ok).toBe(false);
  });

  it("rejects a row with a malformed cell count", () => {
    const malformed = `<table id="neorazzstatstable"><TBODY><tr><td></td><td>ARZ</td><td>25.4</td></tr></TBODY></table>`;
    const result = parseSlotWideDefenseTable(malformed);
    expect(result.ok).toBe(false);
  });

  it("rejects a row with a non-numeric PPG field", () => {
    const malformed = `<table id="neorazzstatstable"><TBODY><tr><td></td><td>ARZ</td><td>N/A</td><td>10.3</td><td>15.2</td><td>35%</td><td>65%</td><td>CIN</td></tr></TBODY></table>`;
    const result = parseSlotWideDefenseTable(malformed);
    expect(result.ok).toBe(false);
  });
});

describe("normalizeSlotWideDefenseRows", () => {
  const parsedRows = () => {
    const result = parseSlotWideDefenseTable(REAL_FIXTURE);
    if (!result.ok) throw new Error("fixture failed to parse");
    return result.rows;
  };

  it("normalizes Razzball's broadcast-style team codes and sorts deterministically", () => {
    const result = normalizeSlotWideDefenseRows(parsedRows(), normalizeTeamAbbr);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teams).toHaveLength(32);
    expect(result.teams.map((team) => team.team)).toEqual([...result.teams.map((team) => team.team)].sort());
    const ari = result.teams.find((team) => team.team === "ari");
    expect(ari).toBeDefined();
    const bal = result.teams.find((team) => team.team === "bal");
    expect(bal).toBeDefined();
  });

  it("rejects duplicate normalized teams", () => {
    const rows = parsedRows();
    const duplicated = [...rows, { ...rows[0] }];
    const result = normalizeSlotWideDefenseRows(duplicated, normalizeTeamAbbr);
    expect(result.ok).toBe(false);
  });

  it("rejects insufficient team coverage", () => {
    const result = normalizeSlotWideDefenseRows(parsedRows().slice(0, 20), normalizeTeamAbbr);
    expect(result.ok).toBe(false);
  });

  it("rejects implausible numeric ranges", () => {
    const rows = parsedRows();
    const corrupted = rows.map((row, index) => (index === 0 ? { ...row, totalPpgAllowed: 999 } : row));
    const result = normalizeSlotWideDefenseRows(corrupted, normalizeTeamAbbr);
    expect(result.ok).toBe(false);
  });

  it("rejects a team code that cannot be normalized", () => {
    const rows = parsedRows();
    const corrupted = rows.map((row, index) => (index === 0 ? { ...row, team: "" } : row));
    const result = normalizeSlotWideDefenseRows(corrupted, () => null);
    expect(result.ok).toBe(false);
  });
});

describe("buildSlotWideDefenseArtifact", () => {
  it("builds a deterministic artifact envelope", () => {
    const parsed = parseSlotWideDefenseTable(REAL_FIXTURE);
    if (!parsed.ok) throw new Error("fixture failed to parse");
    const normalized = normalizeSlotWideDefenseRows(parsed.rows, normalizeTeamAbbr);
    if (!normalized.ok) throw new Error("fixture failed to normalize");
    const artifact = buildSlotWideDefenseArtifact({ season: 2026, generatedAt: "2026-09-11T00:00:00.000Z", teams: normalized.teams });
    expect(artifact.schemaVersion).toBe("nfl-slot-wide-defense-context-v1");
    expect(artifact.sourceUrl).toBe("https://football.razzball.com/defensive-slot-vs-wide-ppg-allowed/");
    expect(artifact.teams).toHaveLength(32);
  });
});
