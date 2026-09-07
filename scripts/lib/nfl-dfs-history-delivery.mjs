/** Static DFS transport only; values and cohorts come verbatim from WU6A.1. */
export function buildDfsHistoryDelivery(context) {
  const markets = { QB: "passing", RB: "rushing", WR: "receiving", TE: "receiving" };
  const { players, defenseMatchups, ...metadata } = context;
  const index = { ...metadata, schemaVersion: "nfl-dfs-history-index-v1", playerKeys: [], defenseDeltas: {} };
  const files = {};
  for (const [position, market] of Object.entries(markets)) {
    const selectedPlayers = Object.fromEntries(Object.entries(players).filter(([key, rows]) =>
      key.endsWith(`:${market}`) && rows.length && rows.every((row) => row.position === position)));
    const selectedDefense = Object.fromEntries(Object.entries(defenseMatchups).filter(([key]) => key.endsWith(`:${market}:${position}`)));
    files[`${position}.json`] = { ...metadata, position, players: selectedPlayers, defenseMatchups: selectedDefense };
    index.playerKeys.push(...Object.keys(selectedPlayers));
    for (const [key, rows] of Object.entries(selectedDefense)) index.defenseDeltas[key] = rows.map((row) => row.actualMinusPlayerAverage);
  }
  files["index.json"] = index;
  return files;
}
