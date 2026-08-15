import { useState } from "react";

/* ==================================================================
   FULL-PAGE VISUAL REFERENCE — NFL Matchup, Team Comparison tab
   Placeholder data. Inline styles. Spec for sizing/spacing only.
   ================================================================== */

const AWAY = { abbr: "NE", name: "New England Patriots", record: "14-3 in 2025", div: "AFC East", color: "#0a1f44", accent: "#c8102e" };
const HOME = { abbr: "SEA", name: "Seattle Seahawks", record: "14-3 in 2025", div: "NFC West", color: "#002244", accent: "#69be28" };

const SNAPSHOT = [
  { label: "Overall Quality", leader: "home", note: "Leads 3 of 5" },
  { label: "Offense", leader: "away", note: "Leads 6 of 6" },
  { label: "Defense", leader: "home", note: "Leads 6 of 6" },
  { label: "Passing", leader: "even", note: "6 each of 13" },
  { label: "Rushing", leader: "home", note: "Leads 6 of 10" },
  { label: "Trenches", leader: "home", note: "Leads 4 of 4" },
];

const PANELS = [
  {
    id: "ne-ball",
    awayRole: "Offense", awayCaption: "ATTACKING",
    homeRole: "Defense", homeCaption: "DEFENDING",
    groups: [
      { group: "Overall", rows: [
        { label: "EPA / Play", away: { v: "+0.215", r: 1 }, home: { v: "-0.179", r: 2 } },
        { label: "Success Rate", period: "2025 Last 8", away: { v: "50.5%", r: 2 }, home: { v: "37.1%", r: 2 } },
        { label: "Yards / Play", away: { v: "6.81", r: 1 }, home: { v: "4.64", r: 3 } },
        { label: "1st Downs / Play", away: { v: "N/A", r: null }, home: { v: "N/A", r: null } },
        { label: "3rd Down Conversion", away: { v: "N/A", r: null }, home: { v: "N/A", r: null } },
      ]},
      { group: "Passing", rows: [
        { label: "EPA / Pass", away: { v: "+0.328", r: 1 }, home: { v: "-0.172", r: 4 } },
        { label: "Pass Success Rate", period: "2025 Last 8", away: { v: "56.1%", r: 1 }, home: { v: "39.1%", r: 5 } },
        { label: "Passing Yards / Attempt", away: { v: "8.82", r: 1 }, home: { v: "5.57", r: 3 } },
        { label: "Pass Block vs Pass Rush", period: "2025 Season", away: { v: "64%", r: 13 }, home: { v: "41%", r: 7 } },
        { label: "Sacks Allowed vs Sacks", away: { v: "1.75", r: 9 }, home: { v: "1.88", r: 21 } },
      ]},
      { group: "Rushing", rows: [
        { label: "EPA / Rush", away: { v: "+0.043", r: 4 }, home: { v: "-0.189", r: 3 } },
        { label: "Rush Success Rate", period: "2025 Last 8", away: { v: "41.9%", r: 12 }, home: { v: "34.0%", r: 1 } },
        { label: "Rush Yards / Attempt", away: { v: "5.09", r: 3 }, home: { v: "3.77", r: 6 } },
        { label: "Run Block vs Run Stop", period: "2025 Season", away: { v: "72%", r: 12 }, home: { v: "32%", r: 3 } },
      ]},
    ],
  },
  {
    id: "sea-ball",
    awayRole: "Defense", awayCaption: "DEFENDING",
    homeRole: "Offense", homeCaption: "ATTACKING",
    groups: [
      { group: "Overall", rows: [
        { label: "EPA / Play", away: { v: "-0.045", r: 12 }, home: { v: "-0.010", r: 19 } },
        { label: "Success Rate", period: "2025 Last 8", away: { v: "45.2%", r: 21 }, home: { v: "45.8%", r: 9 } },
        { label: "Yards / Play", away: { v: "5.10", r: 9 }, home: { v: "5.69", r: 12 } },
        { label: "1st Downs / Play", away: { v: "N/A", r: null }, home: { v: "N/A", r: null } },
        { label: "3rd Down Conversion", away: { v: "N/A", r: null }, home: { v: "N/A", r: null } },
      ]},
      { group: "Passing", rows: [
        { label: "EPA / Pass", away: { v: "-0.081", r: 9 }, home: { v: "-0.013", r: 24 } },
        { label: "Pass Success Rate", period: "2025 Last 8", away: { v: "42.6%", r: 11 }, home: { v: "50.2%", r: 6 } },
        { label: "Passing Yards / Attempt", away: { v: "5.76", r: 5 }, home: { v: "7.17", r: 13 } },
        { label: "Pass Block vs Pass Rush", period: "2025 Season", away: { v: "35%", r: 19 }, home: { v: "65%", r: 12 } },
        { label: "Sacks Allowed vs Sacks", away: { v: "1.88", r: 21 }, home: { v: "2.13", r: 17 } },
      ]},
      { group: "Rushing", rows: [
        { label: "EPA / Rush", away: { v: "+0.003", r: 25 }, home: { v: "-0.006", r: 10 } },
        { label: "Rush Success Rate", period: "2025 Last 8", away: { v: "48.8%", r: 31 }, home: { v: "40.3%", r: 16 } },
        { label: "Rush Yards / Attempt", away: { v: "4.73", r: 25 }, home: { v: "4.54", r: 8 } },
        { label: "Run Block vs Run Stop", period: "2025 Season", away: { v: "31%", r: 10 }, home: { v: "73%", r: 8 } },
      ]},
    ],
  },
];

const STAT_ROWS = [
  { label: "JKB Power Rating", away: { v: "65.7", r: 5 }, home: { v: "74.4", r: 2 }, adv: "SEA Advantage" },
  { label: "EPA / Play", away: { v: "+0.215", r: 1 }, home: { v: "-0.010", r: 19 }, adv: "NE Advantage" },
  { label: "EPA / Play Allowed", away: { v: "-0.045", r: 12 }, home: { v: "-0.179", r: 2 }, adv: "SEA Advantage" },
  { label: "Success Rate", away: { v: "50.5%", r: 2 }, home: { v: "45.8%", r: 9 }, adv: "NE Advantage" },
  { label: "Success Rate Allowed", away: { v: "45.2%", r: 21 }, home: { v: "37.1%", r: 2 }, adv: "SEA Advantage" },
  { label: "Avg Time of Possession", away: { v: "N/A", r: null }, home: { v: "N/A", r: null }, adv: "Not Compared" },
];

const PERIODS = [
  { label: "2026 Last 4", away: 42, home: 50 },
  { label: "2026 Last 8", away: 44, home: 48 },
  { label: "2026 Season", away: 43, home: 49 },
  { label: "2025 Weeks 11–18", away: 46, home: 45 },
];

/* ---------------------- tier scale (8 bands) ---------------------- */
function tier(r) {
  if (r == null) return { bg: "#f1f5f9", fg: "#94a3b8", wash: "transparent", border: "#e2e8f0" };
  if (r <= 4)  return { bg: "#047857", fg: "#ffffff", wash: "#ecfdf5", border: "#047857" };
  if (r <= 8)  return { bg: "#d1fae5", fg: "#065f46", wash: "#f0fdf4", border: "#6ee7b7" };
  if (r <= 12) return { bg: "#ecfdf5", fg: "#047857", wash: "#f7fefb", border: "#a7f3d0" };
  if (r <= 16) return { bg: "#f8fafc", fg: "#475569", wash: "transparent", border: "#cbd5e1" };
  if (r <= 20) return { bg: "#fef9c3", fg: "#854d0e", wash: "#fefce8", border: "#fde047" };
  if (r <= 24) return { bg: "#ffedd5", fg: "#9a3412", wash: "#fff7ed", border: "#fdba74" };
  if (r <= 28) return { bg: "#fee2e2", fg: "#991b1b", wash: "#fef2f2", border: "#fca5a5" };
  return { bg: "#dc2626", fg: "#ffffff", wash: "#fef2f2", border: "#dc2626" };
}
function ord(n) {
  if (n == null) return "—";
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/* ---------------------- shared type tokens ------------------------ */
const T = {
  eyebrow:   { fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "#047857" },
  sectionTitle: { fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" },
  sectionSub:{ fontSize: 13, color: "#64748b", marginTop: 3 },
  /* metric label and rank number share ONE size — the key fix */
  primary:   { fontSize: 20, fontWeight: 800, lineHeight: 1.2 },
  period:    { fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em" },
  value:     { fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
};

const CARD = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  boxShadow: "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
};

function Logo({ team, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: team.color,
      border: `3px solid ${team.accent}`, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#fff", fontWeight: 900,
      fontSize: size * 0.33, flexShrink: 0, letterSpacing: "-0.02em",
      boxShadow: "0 2px 4px rgba(15,23,42,0.18)",
    }}>{team.abbr}</div>
  );
}

function SectionHead({ eyebrow, title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "16px 20px 12px" }}>
      <div>
        <div style={T.eyebrow}>{eyebrow}</div>
        <div style={{ ...T.sectionTitle, marginTop: 4 }}>{title}</div>
        {sub && <div style={T.sectionSub}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ===================== 1. MATCHUP HEADER ========================== */
function MatchupHeader() {
  const markets = [
    { label: "Spread", main: "SEA −3.5", sub: "NE +3.5", accent: HOME.accent, team: HOME },
    { label: "Moneyline", main: "SEA −198", sub: "NE +164", accent: HOME.accent, team: HOME },
    { label: "Total", main: "44.5", sub: "Over / Under", accent: "#64748b", team: null },
  ];
  return (
    <div style={{ ...CARD, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "10px 20px 0" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#047857", cursor: "pointer" }}>← All weekly matchups</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 20, padding: "16px 24px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo team={AWAY} size={56} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.09em" }}>AWAY</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1.15, letterSpacing: "-0.02em" }}>{AWAY.name}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{AWAY.record} · {AWAY.div}</div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#cbd5e1", letterSpacing: "0.14em" }}>AT</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "flex-end", textAlign: "right" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.09em" }}>HOME</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1.15, letterSpacing: "-0.02em" }}>{HOME.name}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{HOME.record} · {HOME.div}</div>
          </div>
          <Logo team={HOME} size={56} />
        </div>
      </div>

      <div style={{ padding: "0 24px 8px", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
        Wed, Sep 9, 8:20 PM EDT · Lumen Field · Week 1, 2026
      </div>

      {/* market cards — bordered, logo'd, and sized to match the page */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "8px 24px 22px" }}>
        {markets.map((m) => (
          <div key={m.label} style={{
            background: "#f8fafc", border: "1px solid #cbd5e1", borderLeft: `5px solid ${m.accent}`,
            borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 7 }}>
              {m.team && <Logo team={m.team} size={30} />}
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", lineHeight: 1.1, letterSpacing: "-0.02em" }}>{m.main}</div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginTop: 1 }}>{m.sub}</div>
              </div>
            </div>
          </div>
        ))}
        <div style={{
          background: "#ecfdf5", border: "1px solid #a7f3d0", borderLeft: "5px solid #047857",
          borderRadius: 10, padding: "12px 16px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#047857", letterSpacing: "0.08em", textTransform: "uppercase" }}>Market Line</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#065f46", marginTop: 7 }}>nflverse</div>
          <div style={{ fontSize: 12, color: "#047857", marginTop: 3, lineHeight: 1.35 }}>Single source-published line. Book composition not disclosed.</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== 2. TABS =================================== */
function Tabs() {
  const tabs = ["Overview", "Team Comparison", "Availability & Snaps", "Strength of Schedule", "Model Details"];
  return (
    <div style={{ ...CARD, marginBottom: 14, display: "flex", gap: 6, padding: "0 12px" }}>
      {tabs.map((t) => {
        const active = t === "Team Comparison";
        return (
          <div key={t} style={{
            padding: "16px 16px 13px", fontSize: 15,
            fontWeight: active ? 800 : 600,
            color: active ? "#0f172a" : "#64748b",
            borderBottom: active ? "3px solid #047857" : "3px solid transparent",
            cursor: "pointer",
          }}>{t}</div>
        );
      })}
    </div>
  );
}

/* ===================== 3. CONTROLS BAND ========================== */
function Controls() {
  return (
    <div style={{
      background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 12,
      padding: "14px 20px", marginBottom: 14,
      display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#047857", letterSpacing: "0.08em" }}>DATA WINDOW</span>
      <div style={{ display: "flex", background: "#fff", border: "1px solid #a7f3d0", borderRadius: 8, padding: 3 }}>
        {["Season", "Last 5"].map((o, i) => (
          <span key={o} style={{
            padding: "7px 16px", fontSize: 14, fontWeight: i === 0 ? 800 : 600, borderRadius: 6,
            background: i === 0 ? "#047857" : "transparent", color: i === 0 ? "#fff" : "#64748b", cursor: "pointer",
          }}>{o}</span>
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#047857", letterSpacing: "0.08em" }}>HISTORICAL BLEND</span>
      <span style={{
        background: "#fff", border: "1px solid #a7f3d0", borderRadius: 999, padding: "7px 15px",
        fontSize: 14, fontWeight: 700, color: "#065f46",
      }}>● Include 2025 Last 8 — On</span>
      <span style={{ marginLeft: "auto", fontSize: 13, color: "#047857", fontWeight: 700 }}>Sample: 8 games · 2025</span>
    </div>
  );
}

/* ===================== 4. SUMMARY + SNAPSHOT ===================== */
function Snapshot() {
  return (
    <div style={{ ...CARD, marginBottom: 14 }}>
      <SectionHead eyebrow="At a glance" title="Category Snapshot"
        sub="Unweighted count of comparable metrics in each section. Not the model projection." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: "0 20px 20px" }}>
        {SNAPSHOT.map((c) => {
          const team = c.leader === "away" ? AWAY : c.leader === "home" ? HOME : null;
          return (
            <div key={c.label} style={{
              background: "#f8fafc", border: "1px solid #cbd5e1",
              borderTop: `4px solid ${team ? "#047857" : "#cbd5e1"}`,
              borderRadius: 10, padding: "13px 16px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              {team ? <Logo team={team} size={46} /> : (
                <div style={{
                  width: 46, height: 46, borderRadius: "50%", background: "#e2e8f0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, color: "#64748b", flexShrink: 0,
                }}>EVEN</div>
              )}
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{c.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: team ? "#047857" : "#64748b", marginTop: 2 }}>
                  {team ? team.abbr : "Even"}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 1 }}>{c.note}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== 5. UNIT MATCHUPS ========================== */
/* The row is capped and centered so rank/value never fly to the page edges */
const ROW_MAX = 1080;
const SIDE_COL = 230;

function RankPill({ cell }) {
  const t = tier(cell.r);
  if (cell.r == null) {
    return <span style={{ ...T.primary, color: "#94a3b8" }}>N/A</span>;
  }
  return (
    <span style={{
      ...T.primary,
      background: t.bg, color: t.fg, border: `2px solid ${t.border}`,
      borderRadius: 10, padding: "5px 14px", minWidth: 74, textAlign: "center",
      fontVariantNumeric: "tabular-nums",
    }}>{ord(cell.r)}</span>
  );
}

function UnitRow({ row }) {
  const at = tier(row.away.r), ht = tier(row.home.r);
  return (
    <div style={{ borderBottom: "1px solid #f1f5f9" }}>
      <div style={{
        maxWidth: ROW_MAX, margin: "0 auto",
        display: "grid", gridTemplateColumns: `${SIDE_COL}px minmax(0,1fr) ${SIDE_COL}px`,
        alignItems: "center",
      }}>
        {/* AWAY — value outer, rank inner */}
        <div style={{
          background: at.wash, display: "flex", alignItems: "center",
          justifyContent: "flex-end", gap: 12, padding: "13px 16px", height: "100%",
        }}>
          {row.away.r != null && <span style={{ ...T.value, color: "#475569" }}>{row.away.v}</span>}
          <RankPill cell={row.away} />
        </div>

        {/* METRIC — same size as the rank number */}
        <div style={{ textAlign: "center", padding: "13px 20px" }}>
          <div style={{ ...T.primary, color: "#1e293b" }}>{row.label}</div>
          {row.period && <div style={{ ...T.period, marginTop: 3 }}>{row.period}</div>}
        </div>

        {/* HOME — rank inner, value outer */}
        <div style={{
          background: ht.wash, display: "flex", alignItems: "center",
          justifyContent: "flex-start", gap: 12, padding: "13px 16px", height: "100%",
        }}>
          <RankPill cell={row.home} />
          {row.home.r != null && <span style={{ ...T.value, color: "#475569" }}>{row.home.v}</span>}
        </div>
      </div>
    </div>
  );
}

function UnitPanel({ panel }) {
  return (
    <div style={{ border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      {/* panel header — LARGER than the rows beneath it */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
        padding: "16px 22px", background: "#f1f5f9", borderBottom: "2px solid #cbd5e1",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <Logo team={AWAY} size={44} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
              {AWAY.name} {panel.awayRole}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "0.09em", marginTop: 2 }}>
              {panel.awayCaption}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.12em" }}>VS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 13, justifyContent: "flex-end", textAlign: "right" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
              {HOME.name} {panel.homeRole}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "0.09em", marginTop: 2 }}>
              {panel.homeCaption}
            </div>
          </div>
          <Logo team={HOME} size={44} />
        </div>
      </div>

      {panel.groups.map((g) => (
        <div key={g.group}>
          <div style={{
            background: "#1e293b", color: "#f8fafc", textAlign: "center",
            fontSize: 15, fontWeight: 900, letterSpacing: "0.14em",
            padding: "9px 16px", textTransform: "uppercase",
          }}>{g.group}</div>
          {g.rows.map((r) => <UnitRow key={r.label} row={r} />)}
        </div>
      ))}
    </div>
  );
}

function UnitMatchups() {
  return (
    <div style={{ ...CARD, marginBottom: 14 }}>
      <SectionHead eyebrow="Unit by unit" title="Offense vs Defense"
        sub="Direct unit comparison. No matchup score or projected advantage is derived." />
      <div style={{ padding: "0 20px 18px" }}>
        {PANELS.map((p) => <UnitPanel key={p.id} panel={p} />)}
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          Sources: nflverse team-week, nflfastR play-by-play, RBSDM.
        </div>
      </div>
    </div>
  );
}

/* ===================== 6. STAT COMPARISON + PERIODS ============== */
function StatRow({ row }) {
  const at = tier(row.away.r), ht = tier(row.home.r);
  return (
    <div style={{ borderBottom: "1px solid #f1f5f9" }}>
      <div style={{
        maxWidth: 780, margin: "0 auto",
        display: "grid", gridTemplateColumns: "190px minmax(0,1fr) 190px", alignItems: "center",
      }}>
        <div style={{ background: at.wash, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "12px 14px", height: "100%" }}>
          {row.away.r != null && <span style={{ ...T.value, color: "#475569" }}>{row.away.v}</span>}
          <RankPill cell={row.away} />
        </div>
        <div style={{ textAlign: "center", padding: "12px 14px" }}>
          <div style={{ ...T.primary, color: "#1e293b" }}>{row.label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginTop: 3 }}>{row.adv}</div>
        </div>
        <div style={{ background: ht.wash, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, padding: "12px 14px", height: "100%" }}>
          <RankPill cell={row.home} />
          {row.home.r != null && <span style={{ ...T.value, color: "#475569" }}>{row.home.v}</span>}
        </div>
      </div>
    </div>
  );
}

function StatComparison() {
  const cats = ["Offense", "Defense", "Passing", "Rushing", "Trenches"];
  return (
    <div style={{ ...CARD, flex: "1 1 640px" }}>
      <SectionHead eyebrow="Metric by metric" title="Statistical Comparison"
        sub="League rank out of 32 — 1 is best. Every row states its advantage in words." />
      <div style={{
        display: "grid", gridTemplateColumns: "190px minmax(0,1fr) 190px",
        maxWidth: 780, margin: "0 auto", padding: "8px 0",
        borderTop: "1px solid #e2e8f0", borderBottom: "2px solid #cbd5e1",
      }}>
        <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 14 }}><Logo team={AWAY} size={34} /></div>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.09em", alignSelf: "center" }}>METRIC · ADVANTAGE</div>
        <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: 14 }}><Logo team={HOME} size={34} /></div>
      </div>

      <div style={{ background: "#1e293b", color: "#f8fafc", textAlign: "center", fontSize: 15, fontWeight: 900, letterSpacing: "0.14em", padding: "9px 16px" }}>
        OVERALL QUALITY
      </div>
      {STAT_ROWS.map((r) => <StatRow key={r.label} row={r} />)}

      {cats.map((c) => (
        <div key={c} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "15px 20px", borderBottom: "1px solid #e2e8f0", cursor: "pointer",
        }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{c}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo team={c === "Offense" ? AWAY : HOME} size={26} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>Leads 6 of 6</span>
            <span style={{ fontSize: 16, color: "#94a3b8" }}>⌄</span>
          </span>
        </div>
      ))}

      <div style={{ padding: "14px 20px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.08em" }}>RANK TIERS</span>
        {[[1,"Elite 1–4"],[6,"Excellent 5–8"],[10,"Good 9–12"],[14,"Average 13–16"],[18,"Below 17–20"],[22,"Weak 21–24"],[26,"Poor 25–28"],[30,"Very Poor 29–32"]].map(([r,l]) => {
          const t = tier(r);
          return (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: t.bg, border: `1px solid ${t.border}` }} />
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{l}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PeriodPanel() {
  return (
    <div style={{ ...CARD, flex: "1 1 380px" }}>
      <SectionHead eyebrow="Over time" title="Success Rate by Period"
        sub="Fixed windows — 2026 recency plus 2025's stretch run." />
      <div style={{ padding: "0 20px 20px" }}>
        {PERIODS.map((p) => (
          <div key={p.label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{p.label}</div>
            {[{ t: AWAY, v: p.away }, { t: HOME, v: p.home }].map((row) => (
              <div key={row.t.abbr} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
                <Logo team={row.t} size={26} />
                <div style={{ flex: 1, height: 12, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${(row.v / 60) * 100}%`, height: "100%", borderRadius: 6,
                    background: (row.t === AWAY ? p.away > p.home : p.home > p.away) ? "#047857" : "#cbd5e1",
                  }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", width: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.v}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================== ROOT ====================================== */
export default function FullPageReference() {
  const [w, setW] = useState("desktop");
  const width = w === "desktop" ? 1440 : 390;
  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#111827", color: "#e5e7eb" }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Full-page visual reference — Team Comparison</span>
        <div style={{ display: "flex", gap: 6 }}>
          {["desktop", "mobile"].map((m) => (
            <button key={m} onClick={() => setW(m)} style={{
              padding: "5px 14px", borderRadius: 999, border: "1px solid #374151",
              background: w === m ? "#e5e7eb" : "transparent", color: w === m ? "#111827" : "#e5e7eb",
              fontWeight: 700, fontSize: 11.5, cursor: "pointer", textTransform: "capitalize",
            }}>{m === "desktop" ? "Desktop 1440" : "Mobile 390"}</button>
          ))}
        </div>
      </div>

      <div style={{ background: "#eef1f5", padding: 20, display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: width }}>
          <MatchupHeader />
          <Tabs />
          <Controls />
          <div style={{ fontSize: 15, color: "#334155", lineHeight: 1.55, marginBottom: 14, padding: "0 4px" }}>
            <b style={{ color: "#0f172a" }}>New England Patriots</b> lead Offense.{" "}
            <b style={{ color: "#0f172a" }}>Seattle Seahawks</b> lead Overall Quality, Defense, Rushing and Trenches. Passing is even.
          </div>
          <Snapshot />
          <UnitMatchups />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
            <StatComparison />
            <PeriodPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
