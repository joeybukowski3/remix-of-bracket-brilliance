/**
 * Deterministic parser for the FantasyPros "Real-Time ADP" export.
 *
 * The export's actual shape (audited against the supplied 2026-08-25 file):
 *   line 1: a quoted title, e.g. "Real-Time ADP — Redraft PPR, All, 12-team — ..."
 *   line 2: blank
 *   line 3: header — RK,Name,POS.RK,REAL-TIME,TREND (24H),TREND (7D),PICK NUM.,ESPN,YAHOO,SLEEPER
 *   line 4+: one player/team-defense per row
 *
 * `REAL-TIME` is the only ADP value used anywhere downstream. `PICK NUM.` is a
 * 12-team mock-draft slot, not ADP, and is intentionally never read here.
 *
 * The `Name` field packs three things into one string, e.g.
 * "James Cook III BUF (7)" or the free-agent form "Tyreek Hill FA ()". Only the
 * trailing "TEAM (BYE)" pair is stripped; everything before it — including
 * real name suffixes like "Jr.", "Sr.", "II", "III", "IV" — stays in the name.
 */

export type FantasyProsAdpPosition = "QB" | "RB" | "WR" | "TE" | "DST" | "K";

/** The subset of source positions that appear on the JKB rest-of-season board. */
export const ELIGIBLE_ADP_POSITIONS: readonly FantasyProsAdpPosition[] = ["QB", "RB", "WR", "TE"];

export type ParsedFantasyProsPlayerField = {
  player: string;
  /** Null for a free agent (source team code "FA") or an unparseable field. */
  team: string | null;
  /** Null when the source omits a bye week (free agents: "Name FA ()"). */
  byeWeek: number | null;
};

/** Splits the trailing "TEAM (BYE)" pair off a FantasyPros `Name` field. */
export function parseFantasyProsPlayerField(raw: string): ParsedFantasyProsPlayerField {
  const trimmed = raw.trim();
  const match = /^(.+?)\s+([A-Z]{2,3})\s+\((\d*)\)$/.exec(trimmed);
  if (!match) {
    return { player: trimmed, team: null, byeWeek: null };
  }
  const [, player, teamCode, byeText] = match;
  const team = teamCode === "FA" ? null : teamCode;
  const byeWeek = byeText === "" ? null : Number(byeText);
  return { player, team, byeWeek: Number.isFinite(byeWeek) ? byeWeek : null };
}

export type ParsedFantasyProsPositionRank = {
  position: FantasyProsAdpPosition;
  positionRank: number;
};

/** Splits a `POS.RK` field, e.g. "RB1" or "DST19", into position and rank. */
export function parseFantasyProsPositionRank(raw: string): ParsedFantasyProsPositionRank | null {
  const match = /^([A-Z]+)(\d+)$/.exec(raw.trim());
  if (!match) return null;
  const [, position, rankText] = match;
  if (!ELIGIBLE_ADP_POSITIONS.includes(position as FantasyProsAdpPosition) && position !== "DST" && position !== "K") {
    return null;
  }
  return { position: position as FantasyProsAdpPosition, positionRank: Number(rankText) };
}

export type FantasyProsAdpCsvRecord = Readonly<Record<string, string>>;

export type ParsedFantasyProsAdpRow = {
  fantasyProsOverallRank: number;
  player: string;
  team: string | null;
  byeWeek: number | null;
  position: FantasyProsAdpPosition;
  fantasyProsPositionRank: number;
  adp: number;
};

/**
 * Parses one already-header-mapped CSV record. Returns null for a row this
 * board does not track (DST/K) or a row missing a required field — never a
 * fabricated value.
 */
export function parseFantasyProsAdpRecord(record: FantasyProsAdpCsvRecord): ParsedFantasyProsAdpRow | null {
  const posRk = parseFantasyProsPositionRank(record["POS.RK"] ?? "");
  if (!posRk || posRk.position === "DST" || posRk.position === "K") return null;

  const overallRank = Number(record.RK);
  const adp = Number(record["REAL-TIME"]);
  if (!Number.isFinite(overallRank) || !Number.isFinite(adp) || adp <= 0) return null;

  const { player, team, byeWeek } = parseFantasyProsPlayerField(record.Name ?? "");
  if (!player) return null;

  return {
    fantasyProsOverallRank: overallRank,
    player,
    team,
    byeWeek,
    position: posRk.position,
    fantasyProsPositionRank: posRk.positionRank,
    adp,
  };
}

/**
 * Splits the raw FantasyPros export into CSV data lines, dropping the title
 * line and the blank line that precede the real header. RFC4180-style quoted
 * fields are supported since the title line itself is quoted.
 */
export function splitFantasyProsAdpCsvLines(csvText: string): string[][] {
  const withoutBom = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const lines = withoutBom.split(/\r\n|\n|\r/);
  // Drop the quoted title line (line 1) and the blank line (line 2).
  const body = lines.slice(2).filter((line) => line.trim() !== "");
  return body.map((line) => splitCsvLine(line));
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** Parses the full FantasyPros ADP export text into eligible QB/RB/WR/TE rows. */
export function parseFantasyProsAdpCsv(csvText: string): ParsedFantasyProsAdpRow[] {
  const lines = splitFantasyProsAdpCsvLines(csvText);
  if (lines.length === 0) return [];
  const [header, ...dataLines] = lines;
  const rows: ParsedFantasyProsAdpRow[] = [];
  for (const line of dataLines) {
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = line[index] ?? "";
    });
    const parsed = parseFantasyProsAdpRecord(record);
    if (parsed) rows.push(parsed);
  }
  return rows;
}
