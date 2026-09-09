import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

export const TOUCHDOWN_CONTEXT_SCHEMA_VERSION = "nfl-touchdown-context-v1";
export const TOUCHDOWN_PBP_COLUMNS = [
  "game_id", "play_id", "drive", "season", "season_type", "week", "posteam", "defteam",
  "yardline_100", "rush", "pass", "play_type", "two_point_attempt", "qb_kneel", "qb_spike",
  "rusher_player_id", "rusher_player_name", "receiver_player_id", "receiver_player_name",
  "rush_touchdown", "pass_touchdown",
];
export const TOUCHDOWN_CONTEXT_COLUMNS = [
  "game_id", "play_id", "drive", "season", "week", "team", "opponent", "player_id", "player_name",
  "opportunity_type", "yardline_100", "rz_opportunity", "inside_10_opportunity", "goal_line_opportunity", "touchdown",
];

const TEAM_ALIASES = { JAC: "jax", JAX: "jax", LA: "lar", LAR: "lar", WAS: "wsh", WSH: "wsh", AZ: "ari", ARI: "ari" };
const team = (value) => TEAM_ALIASES[String(value ?? "").trim().toUpperCase()] ?? String(value ?? "").trim().toLowerCase();
const one = (value) => Number(value) === 1;

export function splitTouchdownCsvLine(line) {
  const output = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { output.push(value); value = ""; }
    else value += char;
  }
  output.push(value);
  return output;
}

export function validateTouchdownPbpHeader(header) {
  const missing = TOUCHDOWN_PBP_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`Touchdown context source schema missing required columns: ${missing.join(", ")}`);
  return new Map(header.map((column, index) => [column, index]));
}

export function touchdownContextEvent(record) {
  if (record.season_type !== "REG" || String(record.play_type ?? "").trim() === "no_play" || one(record.two_point_attempt) || one(record.qb_kneel) || one(record.qb_spike)) return null;
  const rusherId = String(record.rusher_player_id ?? "").trim();
  const receiverId = String(record.receiver_player_id ?? "").trim();
  const isCarry = rusherId.length > 0 && one(record.rush);
  const isTarget = receiverId.length > 0 && one(record.pass);
  if (!isCarry && !isTarget) return null;
  if (isCarry && isTarget) throw new Error(`Ambiguous scorer opportunity at ${record.game_id}:${record.play_id}`);
  const yardline = Number(record.yardline_100);
  const hasYardline = Number.isFinite(yardline) && yardline > 0;
  const opportunityType = isCarry ? "carry" : "target";
  return {
    game_id: record.game_id,
    play_id: record.play_id,
    drive: record.drive,
    season: Number(record.season),
    week: Number(record.week),
    team: team(record.posteam),
    opponent: team(record.defteam),
    player_id: isCarry ? rusherId : receiverId,
    player_name: isCarry ? record.rusher_player_name : record.receiver_player_name,
    opportunity_type: opportunityType,
    yardline_100: hasYardline ? yardline : "",
    rz_opportunity: hasYardline ? (yardline <= 20 ? 1 : 0) : "",
    inside_10_opportunity: hasYardline ? (yardline <= 10 ? 1 : 0) : "",
    goal_line_opportunity: hasYardline ? (yardline <= 5 ? 1 : 0) : "",
    touchdown: isCarry ? (one(record.rush_touchdown) ? 1 : 0) : (one(record.pass_touchdown) ? 1 : 0),
  };
}

export async function extractTouchdownContextFromGzip(response) {
  if (!response.ok || !response.body) throw new Error(`nflverse PBP request failed (${response.status})`);
  const stream = Readable.fromWeb(response.body).pipe(createGunzip());
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let indexByColumn = null; const rows = []; let sourceRows = 0;
  for await (const line of lines) {
    if (!indexByColumn) { indexByColumn = validateTouchdownPbpHeader(splitTouchdownCsvLine(line)); continue; }
    if (!line) continue;
    sourceRows += 1;
    const values = splitTouchdownCsvLine(line);
    const record = Object.fromEntries(TOUCHDOWN_PBP_COLUMNS.map((column) => [column, values[indexByColumn.get(column)] ?? ""]));
    const event = touchdownContextEvent(record);
    if (event) rows.push(event);
  }
  if (!indexByColumn) throw new Error("nflverse PBP response was empty");
  return { rows, sourceRows };
}

const quote = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export function serializeTouchdownContext(rows) {
  return `${TOUCHDOWN_CONTEXT_COLUMNS.join(",")}\n${rows.map((row) => TOUCHDOWN_CONTEXT_COLUMNS.map((column) => quote(row[column])).join(",")).join("\n")}\n`;
}

export function nflverseTouchdownPbpUrl(season) {
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
}
