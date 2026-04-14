import { useNavigate } from "react-router-dom";
import SiteNav from "@/components/SiteNav";

const sports = [
  {
    id: "mlb",
    label: "MLB",
    route: "/mlb",
    active: true,
    external: true,
    logoSrc: "/logos/mlb.svg",
    logoBg: "linear-gradient(180deg, rgba(59,110,165,0.12), rgba(59,110,165,0.04))",
    logoBorder: "#BFD4E7",
    desc: "HR prop analyzer, daily slate matchups, and Statcast-powered recommendations.",
  },
  {
    id: "ncaa",
    label: "NCAA Basketball",
    route: "/ncaa",
    active: true,
    logoSrc: "/logos/ncaa.svg",
    logoBg: "linear-gradient(180deg, rgba(76,111,255,0.12), rgba(76,111,255,0.04))",
    logoBorder: "#CAD5FF",
    desc: "Custom power rankings, matchup analysis, and March Madness bracket tools.",
  },
  {
    id: "nfl",
    label: "NFL",
    route: null,
    active: false,
    logoSrc: "/logos/nfl.svg",
    logoBg: "linear-gradient(180deg, rgba(120,144,156,0.16), rgba(120,144,156,0.05))",
    logoBorder: "#D7DEE5",
    desc: "Game analysis, line movement, player props, and weekly picks.",
  },
  {
    id: "nba",
    label: "NBA",
    route: null,
    active: false,
    logoSrc: "/logos/nba.png",
    logoBg: "linear-gradient(180deg, rgba(120,144,156,0.16), rgba(120,144,156,0.05))",
    logoBorder: "#D7DEE5",
    desc: "Player prop tools, pace/efficiency breakdowns, and DFS lineup edge.",
  },
  {
    id: "pga",
    label: "PGA Picks",
    route: "/rbc-heritage-2026-picks",
    active: true,
    logoSrc: "/logos/pga.svg",
    logoBg: "linear-gradient(180deg, rgba(60,140,106,0.14), rgba(60,140,106,0.04))",
    logoBorder: "#C9E4D8",
    desc: "RBC Heritage best bets, PGA betting picks today, top 40 parlays, and course-fit model analysis.",
  },
] as const;

const LockIcon = () => (
  <svg
    style={{ position: "absolute", top: 16, right: 16, width: 18, height: 18, color: "#94a3b8" }}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export default function Home() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(76,111,255,0.08), transparent 28%), linear-gradient(180deg, #f8fafc 0%, #f5f7fa 45%, #fafaf9 100%)",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        color: "#1f2937",
      }}
    >
      <SiteNav />

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "4rem 1.25rem 1.5rem" }}>
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid #dbe4f0",
              background: "#ffffff",
              color: "#4c6fff",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            Pick your sport
          </div>
          <h1
            style={{
              fontSize: "clamp(2.2rem, 5vw, 4rem)",
              fontWeight: 700,
              margin: "1rem 0 0.85rem",
              letterSpacing: "-0.04em",
              lineHeight: 1.02,
              color: "#1f2937",
            }}
          >
            Betting tools built for <span style={{ color: "#3b6ea5" }}>clearer decisions</span>.
          </h1>
          <p
            style={{
              color: "#667085",
              fontSize: "clamp(1rem, 1.8vw, 1.08rem)",
              margin: 0,
              lineHeight: 1.8,
              maxWidth: 680,
            }}
          >
            Jump into sport-specific dashboards for prop analysis, matchup tools, rankings, projections, and workflow
            advantages that make slate review faster.
          </p>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 22,
          maxWidth: 1180,
          margin: "0 auto",
          padding: "1rem 1.25rem 5rem",
        }}
      >
        {sports.map((sport) => (
          <button
            key={sport.id}
            type="button"
            onClick={() => {
              if (sport.active && sport.route) {
                if ("external" in sport && sport.external) {
                  window.location.href = sport.route;
                } else {
                  navigate(sport.route);
                }
              }
            }}
            style={{
              background: "#ffffff",
              border: `1px solid ${sport.active ? "#dbe4f0" : "#e6eaf0"}`,
              borderRadius: 22,
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              minHeight: 300,
              gap: 16,
              position: "relative",
              cursor: sport.active ? "pointer" : "default",
              opacity: sport.active ? 1 : 0.72,
              transition: "transform 0.18s ease, border-color 0.2s ease, box-shadow 0.2s ease",
              textAlign: "left",
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
            }}
            onMouseEnter={(e) => {
              if (sport.active) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.borderColor = "#bfd4e7";
                e.currentTarget.style.boxShadow = "0 14px 30px rgba(15, 23, 42, 0.09)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = sport.active ? "#dbe4f0" : "#e6eaf0";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.06)";
            }}
          >
            {!sport.active && <LockIcon />}

            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 22,
                background: sport.logoBg,
                border: `1px solid ${sport.logoBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={sport.logoSrc}
                alt={`${sport.label} logo`}
                style={{ width: 58, height: 58, objectFit: "contain", display: "block" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#24303f" }}>{sport.label}</div>

              {sport.active ? (
                <span
                  style={{
                    width: "fit-content",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 999,
                    background: "#eef4ff",
                    color: "#3b6ea5",
                    border: "1px solid #d7e4f3",
                  }}
                >
                  Available Now
                </span>
              ) : (
                <span
                  style={{
                    width: "fit-content",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 11px",
                    borderRadius: 999,
                    background: "#f8fafc",
                    color: "#667085",
                    border: "1px solid #e6eaf0",
                  }}
                >
                  Subscription Required
                </span>
              )}

              <p style={{ fontSize: "0.92rem", color: "#667085", margin: 0, lineHeight: 1.7 }}>{sport.desc}</p>
            </div>

            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: sport.active ? "#24303f" : "#94a3b8",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.1,
              }}
            >
              {sport.active ? "Open tools" : "Locked"}
              <span style={{ fontSize: 16 }}>{sport.active ? "→" : "•"}</span>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
