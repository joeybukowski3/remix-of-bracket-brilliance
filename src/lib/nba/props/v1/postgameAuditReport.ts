/** Markdown rendering of a postgame audit. The JSON report is canonical; this is for reading. Private: carries hoopR/ESPN and sportsbook data. */
import { GAP_BANDS, type AuditReport, type Summary } from "./postgameAudit";

const f = (n: number | null | undefined, d = 1): string => (n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d));
const s = (n: number | null | undefined, d = 1): string => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}`);

/** Names, books and warnings come from outside; keep them from breaking a table row or injecting markup. */
const cell = (value: string): string => value.replace(/[\r\n]+/g, " ").replace(/[|<>[\]`]/g, (c) => `\\${c}`);

function summaryRow(label: string, x: Summary | null): string {
  return x
    ? `| ${label} | ${x.n} | ${f(x.jkbMAE, 2)} | ${s(x.jkbME, 2)} | ${f(x.lineMAE, 2)} | ${s(x.lineME, 2)} | ${f(x.minMAE, 2)} | ${s(x.minME, 2)} | ${x.dirHits}/${x.dirN} | ${x.closer}/${x.n} | ${s(x.minutesEffect, 2)} | ${s(x.rateEffect, 2)} |`
    : `| ${label} | 0 | — | — | — | — | — | — | — | — | — | — |`;
}

export function renderAuditMarkdown(r: AuditReport): string {
  const lines: string[] = [
    `# Postgame audit: ${r.gameKey} points`,
    "",
    `<!-- ${r.privateMarker} -->`,
    "PRIVATE: built from hoopR/ESPN data and The Odds API lines, both private-research only. Do not publish or share.",
    "",
    `Final score ${Object.entries(r.finalScore).map(([team, pts]) => `${team} ${pts}`).join(", ")}. Model ${r.modelVersions.join(", ")}; board built ${r.boardBuiltUtc}; tipoff ${r.tipoffUtc}; box score retrieved ${r.boxRetrievedAtUtc}; captures ${r.captureIds.map(cell).join(", ") || "none"}.`,
    "Error = projection (or line) minus actual: positive = over-prediction.",
    "",
    "| Group (projection - line) | n | JKB MAE | JKB bias | Line MAE | Line bias | Min MAE | Min bias | Direction | JKB closer | Minutes effect | Rate effect |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    summaryRow("all with a line", r.matched),
    ...GAP_BANDS.map((band) => summaryRow(band, r.groups[band])),
    "",
    `Everyone who played (n=${r.allPlayed.n}): JKB MAE ${f(r.allPlayed.jkbMAE, 2)}, bias ${s(r.allPlayed.jkbME, 2)}; minutes MAE ${f(r.allPlayed.minMAE, 2)}, bias ${s(r.allPlayed.minME, 2)}; projected ${f(r.allPlayed.projTotalPts)} points in ${f(r.allPlayed.projTotalMin, 0)} minutes against ${r.allPlayed.actTotalPts} in ${f(r.allPlayed.actTotalMin, 0)}.`,
    "",
    "| Player | Tm | Proj | Line (book) | Actual | JKB err | Line err | Proj min | Act min | Proj PPM | Act PPM | Side | Result |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...r.players.filter((p) => p.status === "played").sort((a, b) => Math.abs(b.ptsErr ?? 0) - Math.abs(a.ptsErr ?? 0)).map((p) => `| ${cell(p.name)} | ${cell(p.team ?? "—")} | ${f(p.projPts)} | ${p.line ? `${p.line.line} (${cell(p.line.sportsbook)})` : "—"} | ${p.actPts} | ${s(p.ptsErr)} | ${s(p.lineErr)} | ${f(p.projMin)} | ${p.actMin} | ${f(p.projPPM, 3)} | ${f(p.actPPM, 3)} | ${p.jkbSide ?? "—"} | ${p.result ?? "—"} |`),
    "",
    `Projected but not in the scored sample: ${r.missing.length ? r.missing.map((m) => `${cell(m.name)} (${m.status}, projected ${f(m.projPts)} in ${f(m.projMin)} min)`).join("; ") : "none"}.`,
    "",
    ...(r.warnings.length ? ["Warnings:", ...r.warnings.map((w) => `- ${cell(w)}`), ""] : []),
  ];
  return lines.join("\n");
}
