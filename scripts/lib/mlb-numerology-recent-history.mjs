const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const EMAIL_INK = "#0f172a";
const EMAIL_MUTED = "#64748b";
const EMAIL_BORDER = "#e2e8f0";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function finiteStat(stats, key) {
  const value = Number(stats?.[key]);
  return Number.isFinite(value) ? value : 0;
}

export function selectRecentTopNumerologyMatches(performancePayload, limit = 5) {
  const records = Array.isArray(performancePayload?.records) ? performancePayload.records : [];
  const seen = new Set();

  return records
    .filter((record) => record?.selectionType === "top-play" && record?.resultStatus === "final" && record?.stats)
    .sort((left, right) => {
      const dateOrder = String(right.date ?? "").localeCompare(String(left.date ?? ""));
      if (dateOrder !== 0) return dateOrder;
      return Number(right.numerologyScore ?? 0) - Number(left.numerologyScore ?? 0);
    })
    .filter((record) => {
      const key = `${record.date ?? ""}|${record.playerId ?? record.player ?? ""}|${record.gameId ?? record.gameKey ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function resultMeta(record) {
  return record.hitHomeRun === true
    ? { label: "HIT", background: "#dcfce7", color: "#166534" }
    : { label: "MISS", background: "#fee2e2", color: "#991b1b" };
}

function formatBoxScore(record) {
  const stats = record.stats ?? {};
  return [
    ["AB", finiteStat(stats, "atBats")],
    ["R", finiteStat(stats, "runs")],
    ["H", finiteStat(stats, "hits")],
    ["HR", finiteStat(stats, "homeRuns")],
    ["RBI", finiteStat(stats, "rbi")],
    ["BB", finiteStat(stats, "baseOnBalls")],
    ["K", finiteStat(stats, "strikeOuts")],
    ["TB", finiteStat(stats, "totalBases")],
  ];
}

function renderBoxScoreTable(record) {
  const cells = formatBoxScore(record)
    .map(([label, value]) => `<td align="center" style="padding:7px 3px;border-left:1px solid ${EMAIL_BORDER};font-family:${EMAIL_FONT};"><div style="font-size:9px;font-weight:800;color:${EMAIL_MUTED};">${label}</div><div style="font-size:13px;font-weight:800;color:${EMAIL_INK};margin-top:2px;">${value}</div></td>`)
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border:1px solid ${EMAIL_BORDER};border-radius:6px;overflow:hidden;"><tr>${cells}</tr></table>`;
}

function renderHistoryCard(record) {
  const result = resultMeta(record);
  return `<tr><td style="padding:0 24px 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-numerology-recent-history-entry="true" style="width:100%;border:1px solid ${EMAIL_BORDER};border-radius:9px;"><tr><td style="padding:12px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top"><div style="font-family:${EMAIL_FONT};font-size:15px;font-weight:800;color:${EMAIL_INK};">${escapeHtml(record.player)}</div><div style="font-family:${EMAIL_FONT};font-size:11px;color:${EMAIL_MUTED};margin-top:3px;">${escapeHtml(record.date)} · ${escapeHtml(record.team)} vs ${escapeHtml(record.opponent)} · ${escapeHtml(record.matchType || "Top numerology match")}</div></td><td width="74" align="right" valign="top"><span style="display:inline-block;padding:4px 9px;border-radius:999px;background-color:${result.background};color:${result.color};font-family:${EMAIL_FONT};font-size:10px;font-weight:800;">${result.label}</span><div style="font-family:${EMAIL_FONT};font-size:10px;color:${EMAIL_MUTED};margin-top:5px;">Score ${escapeHtml(record.numerologyScore ?? "—")}</div></td></tr></table><div style="margin-top:10px;">${renderBoxScoreTable(record)}</div></td></tr></table></td></tr>`;
}

export function injectRecentTopMatchesHtml(html, performancePayload) {
  const records = selectRecentTopNumerologyMatches(performancePayload, 5);
  const content = records.length
    ? records.map(renderHistoryCard).join("")
    : `<tr><td style="padding:0 24px 10px;"><div style="font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL_MUTED};">No finalized top numerology matches are available yet.</div></td></tr>`;
  const section = `<tbody data-numerology-recent-history="true"><tr><td style="padding:28px 24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-bottom:2px solid ${EMAIL_INK};padding-bottom:8px;"><span style="font-family:${EMAIL_FONT};font-size:18px;font-weight:800;color:${EMAIL_INK};">Recent Top Matches</span></td></tr></table><div style="font-family:${EMAIL_FONT};font-size:12px;color:${EMAIL_MUTED};margin-top:6px;">Box scores for the five most recent finalized top numerology matches</div></td></tr>${content}</tbody>`;
  return html.replace('<tbody data-numerology-tracking="true">', `${section}\n    <tbody data-numerology-tracking="true">`);
}

export function injectRecentTopMatchesText(text, performancePayload) {
  const records = selectRecentTopNumerologyMatches(performancePayload, 5);
  const lines = ["===================", "RECENT TOP MATCHES", "==================="];
  if (!records.length) {
    lines.push("No finalized top numerology matches are available yet.");
  } else {
    for (const record of records) {
      const stats = formatBoxScore(record).map(([label, value]) => `${label} ${value}`).join(" | ");
      lines.push(`${record.date} — ${record.player} (${record.team} vs ${record.opponent}) — Score ${record.numerologyScore ?? "—"} — ${record.hitHomeRun ? "HIT" : "MISS"}`);
      lines.push(`  ${stats}`);
    }
  }
  lines.push("");
  return text.replace("===================\nTRACKING SNAPSHOT", `${lines.join("\n")}===================\nTRACKING SNAPSHOT`);
}
