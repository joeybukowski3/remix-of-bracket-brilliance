/**
 * Loading the immutable pregame snapshot and the final box score for a postgame audit. Temporary directories and invented
 * rows only: no network, credential or real data.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertOutputOutsidePregame, boxRowsFromHoopr, verifyPregameManifest } from "./postgameAuditInputs";

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-inputs-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function snapshot(files: Record<string, string>, manifestOverride?: Record<string, string>): string {
  const dir = temp();
  const manifest: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
    manifest.push(`${manifestOverride?.[name] ?? sha(text)} *${name}`);
  }
  writeFileSync(path.join(dir, "MANIFEST.sha256"), `${manifest.join("\n")}\n`);
  return dir;
}

describe("the pregame snapshot is verified against its manifest before anything is read", () => {
  it("accepts a snapshot whose files all match, including files in subfolders", () => {
    const dir = snapshot({ "board.json": "{}", "odds-captures/cap.json": "{\"a\":1}" });
    expect(verifyPregameManifest(dir)).toEqual({ files: 2, manifestSha256: sha(readFileSync(path.join(dir, "MANIFEST.sha256"), "utf8")) });
  });

  it("refuses a file that changed after the manifest was written", () => {
    const dir = snapshot({ "board.json": "{}" }, { "board.json": sha("something else") });
    expect(() => verifyPregameManifest(dir)).toThrow(/board\.json.*changed/);
  });

  it("refuses a manifest entry whose file is missing, and a file the manifest does not list", () => {
    const missing = snapshot({ "board.json": "{}" });
    writeFileSync(path.join(missing, "MANIFEST.sha256"), `${sha("{}")} *board.json\n${sha("x")} *gone.json\n`);
    expect(() => verifyPregameManifest(missing)).toThrow(/gone\.json.*missing/);
    const extra = snapshot({ "board.json": "{}" });
    writeFileSync(path.join(extra, "late.json"), "{}");
    expect(() => verifyPregameManifest(extra)).toThrow(/late\.json.*not in the manifest/);
  });

  it("refuses manifest names that are not plain relative files: dot segments, drive or stream colons, duplicates", () => {
    for (const name of ["..", ".", "a:stream", "C:evil.json"]) {
      const dir = snapshot({ "board.json": "{}" });
      writeFileSync(path.join(dir, "MANIFEST.sha256"), `${sha("{}")} *board.json
${sha("x")} *${name}
`);
      expect(() => verifyPregameManifest(dir), name).toThrow(/outside the snapshot|not a plain relative file/);
    }
    const dup = snapshot({ "board.json": "{}" });
    writeFileSync(path.join(dup, "MANIFEST.sha256"), `${sha("{}")} *board.json
${sha("{}")} *board.json
`);
    expect(() => verifyPregameManifest(dup)).toThrow(/more than once/);
  });

  it("refuses a listed file that is a link, since a link can point outside the frozen folder", () => {
    const dir = snapshot({ "real.json": "{}" });
    const outside = path.join(temp(), "elsewhere.json");
    writeFileSync(outside, "{\"x\":1}");
    try {
      symlinkSync(outside, path.join(dir, "link.json"), "file");
    } catch {
      return; // symbolic links need a privilege this machine does not grant; the junction test below covers the same rule
    }
    writeFileSync(path.join(dir, "MANIFEST.sha256"), `${sha("{}")} *real.json
${sha("{\"x\":1}")} *link.json
`);
    expect(() => verifyPregameManifest(dir)).toThrow(/link\.json.*regular file/);
  });

  it("refuses a snapshot with no manifest, and a manifest path that climbs out of the folder", () => {
    expect(() => verifyPregameManifest(temp())).toThrow(/no MANIFEST\.sha256/);
    const dir = snapshot({ "board.json": "{}" });
    writeFileSync(path.join(dir, "MANIFEST.sha256"), `${sha("{}")} *../outside.json\n`);
    expect(() => verifyPregameManifest(dir)).toThrow(/outside the snapshot/);
  });
});

describe("hoopR box-score rows become final rows for one game", () => {
  const hoopr = (over: Record<string, unknown>) => ({ game_id: 1, game_date: "2026-10-28", athlete_id: 11, athlete_display_name: "Player A", team_abbreviation: "NO", minutes: 30, points: 12, starter: true, did_not_play: false, ...over });

  it("keeps the two teams of the game, maps ESPN codes to canonical ones, and carries did-not-play and starter flags", () => {
    const rows = boxRowsFromHoopr([hoopr({}), hoopr({ athlete_id: 12, athlete_display_name: "Player B", team_abbreviation: "DEN", starter: false, did_not_play: true, minutes: 0, points: 0 }), hoopr({ game_id: 2, team_abbreviation: "BOS" })], "2026-10-28|DEN@NOP");
    expect(rows).toEqual([
      { gameKey: "2026-10-28|DEN@NOP", team: "NOP", playerId: "11", playerName: "Player A", minutes: 30, points: 12, didNotPlay: false, started: true },
      { gameKey: "2026-10-28|DEN@NOP", team: "DEN", playerId: "12", playerName: "Player B", minutes: 0, points: 0, didNotPlay: true, started: false },
    ]);
  });

  it("refuses rows from two different games between the same teams, and leaves out a team that is not in the game", () => {
    expect(() => boxRowsFromHoopr([hoopr({}), hoopr({ game_id: 3, team_abbreviation: "DEN" })], "2026-10-28|DEN@NOP")).toThrow(/more than one game/);
    expect(boxRowsFromHoopr([hoopr({ team_abbreviation: "ZZZ" })], "2026-10-28|DEN@NOP")).toEqual([]);
  });

  it("never turns a missing number into a zero: a played row without points or minutes is refused, a did-not-play row is zeros", () => {
    expect(() => boxRowsFromHoopr([hoopr({ points: null })], "2026-10-28|DEN@NOP")).toThrow(/Player A.*points/);
    expect(() => boxRowsFromHoopr([hoopr({ minutes: null })], "2026-10-28|DEN@NOP")).toThrow(/Player A.*minutes/);
    expect(boxRowsFromHoopr([hoopr({ did_not_play: true, minutes: null, points: null })], "2026-10-28|DEN@NOP")[0]).toMatchObject({ minutes: 0, points: 0, didNotPlay: true });
  });

  it("returns nothing for a game that was not played that day, rather than guessing another date", () => {
    expect(boxRowsFromHoopr([hoopr({ game_date: "2026-10-27" })], "2026-10-28|DEN@NOP")).toEqual([]);
  });
});

describe("the audit's output stays in data/nba/postgame-audit and never inside the pregame snapshot", () => {
  const layout = () => {
    const root = temp();
    const audit = path.join(root, "data", "nba", "postgame-audit");
    const pregame = path.join(audit, "pregame");
    mkdirSync(pregame, { recursive: true });
    mkdirSync(path.join(root, "data", "nba", "odds-captures"), { recursive: true });
    return { root, audit, pregame };
  };

  it("refuses the snapshot folder, a folder inside it, and any folder outside data/nba/postgame-audit, including the capture ledger", () => {
    const { root, audit, pregame } = layout();
    expect(() => assertOutputOutsidePregame(pregame, pregame, root)).toThrow(/pregame snapshot/);
    expect(() => assertOutputOutsidePregame(path.join(pregame, "analysis"), pregame, root)).toThrow(/pregame snapshot/);
    expect(() => assertOutputOutsidePregame(path.join(root, "public", "analysis"), pregame, root)).toThrow(/data\/nba\/postgame-audit/);
    expect(() => assertOutputOutsidePregame(path.join(root, "data", "nba", "odds-captures"), pregame, root)).toThrow(/data\/nba\/postgame-audit/);
    expect(() => assertOutputOutsidePregame(path.join(root, "data", "nba", "props-v1"), pregame, root)).toThrow(/data\/nba\/postgame-audit/);
    expect(() => assertOutputOutsidePregame(path.join(audit, "analysis"), pregame, root)).not.toThrow();
  });

  it("follows links: an output folder that is a junction to somewhere else is refused", () => {
    const { root, audit, pregame } = layout();
    const elsewhere = path.join(root, "elsewhere");
    mkdirSync(elsewhere);
    const link = path.join(audit, "analysis");
    try {
      symlinkSync(elsewhere, link, "junction");
    } catch {
      return; // links cannot be created here; the lexical checks above still apply
    }
    expect(() => assertOutputOutsidePregame(link, pregame, root)).toThrow(/data\/nba\/postgame-audit/);
    const intoSnapshot = path.join(audit, "alias");
    symlinkSync(pregame, intoSnapshot, "junction");
    expect(() => assertOutputOutsidePregame(path.join(intoSnapshot, "x"), pregame, root)).toThrow(/pregame snapshot/);
  });
});
