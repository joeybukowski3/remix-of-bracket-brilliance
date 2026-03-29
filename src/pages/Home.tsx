import { useNavigate } from "react-router-dom";

const sports = [
  {
    id: "mlb",
    label: "MLB",
    route: "/mlb",
    active: true,
    logoSrc: "/logos/mlb.svg",
    logoBg: "radial-gradient(circle at top, rgba(34, 94, 168, 0.45), rgba(4, 30, 66, 0.98))",
    logoBorder: "#E31937",
    desc: "HR prop analyzer, daily slate matchups, and Statcast-powered recommendations.",
  },
  {
    id: "ncaa",
    label: "NCAA Basketball",
    route: "/ncaa",
    active: true,
    logoSrc: "/logos/ncaa.svg",
    logoBg: "radial-gradient(circle at top, rgba(41, 98, 176, 0.42), rgba(26, 58, 107, 0.96))",
    logoBorder: "#F97316",
    desc: "Custom power rankings, matchup analysis, and March Madness bracket tools.",
  },
  {
    id: "nfl",
    label: "NFL",
    route: null,
    active: false,
    logoSrc: "/logos/nfl.svg",
    logoBg: "radial-gradient(circle at top, rgba(1, 51, 105, 0.42), rgba(7, 16, 31, 0.96))",
    logoBorder: "#D50A0A",
    desc: "Game analysis, line movement, player props, and weekly picks.",
  },
  {
    id: "nba",
    label: "NBA",
    route: null,
    active: false,
    logoSrc: "/logos/nba.png",
    logoBg: "radial-gradient(circle at top, rgba(29, 66, 138, 0.42), rgba(14, 20, 32, 0.96))",
    logoBorder: "#C9082A",
    desc: "Player prop tools, pace/efficiency breakdowns, and DFS lineup edge.",
  },
  {
    id: "pga",
    label: "PGA Tour",
    route: null,
    active: false,
    logoSrc: "/logos/pga.svg",
    logoBg: "radial-gradient(circle at top, rgba(26, 92, 56, 0.42), rgba(9, 24, 18, 0.96))",
    logoBorder: "#C9A227",
    desc: "Course fit analysis, SG breakdowns, and tournament prop edge.",
  },
] as const;

const LockIcon = () => (
  <svg
    style={{ position: "absolute", top: 16, right: 16, width: 18, height: 18, color: "#6b7280" }}
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
          "radial-gradient(circle at top, rgba(249,115,22,0.12), transparent 28%), linear-gradient(180deg, #0d0d0d 0%, #141414 45%, #111111 100%)",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        color: "#fff",
      }}
    >
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(12px)",
          background: "rgba(10, 10, 10, 0.86)",
          padding: "0.9rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 18 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, #F97316, #fb923c)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              boxShadow: "0 10px 30px rgba(249,115,22,0.28)",
            }}
          >
            🏀
          </div>
          Joe Knows Ball
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {sports.map((sport) => (
            <button
              key={`nav-${sport.id}`}
              type="button"
              onClick={() => sport.active && sport.route && navigate(sport.route)}
              aria-label={sport.label}
              title={sport.label}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: `1px solid ${sport.active ? "rgba(249,115,22,0.32)" : "rgba(255,255,255,0.08)"}`,
                background: sport.logoBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                cursor: sport.active ? "pointer" : "default",
                opacity: sport.active ? 1 : 0.55,
                boxShadow: sport.active ? "0 8px 24px rgba(0,0,0,0.2)" : "none",
              }}
            >
              <img
                src={sport.logoSrc}
                alt={sport.label}
                style={{ width: 24, height: 24, objectFit: "contain", display: "block" }}
              />
            </button>
          ))}
        </div>
      </nav>

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "4.5rem 2rem 2rem" }}>
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(249,115,22,0.28)",
              background: "rgba(249,115,22,0.08)",
              color: "#fdba74",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            Pick your sport
          </div>
          <h1
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
              fontWeight: 900,
              margin: "1rem 0 0.85rem",
              letterSpacing: "-0.05em",
              lineHeight: 1,
            }}
          >
            Betting tools built for <span style={{ color: "#F97316" }}>sharp decisions</span>.
          </h1>
          <p
            style={{
              color: "#b3b3b3",
              fontSize: "clamp(1rem, 1.8vw, 1.1rem)",
              margin: 0,
              lineHeight: 1.7,
              maxWidth: 640,
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
          padding: "1rem 2rem 5rem",
        }}
      >
        {sports.map((sport) => (
          <button
            key={sport.id}
            type="button"
            onClick={() => sport.active && sport.route && navigate(sport.route)}
            style={{
              background: "linear-gradient(180deg, rgba(34,34,34,0.98), rgba(24,24,24,0.98))",
              border: `1px solid ${sport.active ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 20,
              padding: "1.6rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              minHeight: 320,
              gap: 16,
              position: "relative",
              cursor: sport.active ? "pointer" : "default",
              opacity: sport.active ? 1 : 0.72,
              transition: "transform 0.18s ease, border-color 0.2s ease, box-shadow 0.2s ease",
              textAlign: "left",
              boxShadow: sport.active ? "0 18px 40px rgba(0,0,0,0.28)" : "0 14px 30px rgba(0,0,0,0.18)",
            }}
            onMouseEnter={(e) => {
              if (sport.active) {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = "rgba(249,115,22,0.8)";
                e.currentTarget.style.boxShadow = "0 22px 44px rgba(0,0,0,0.34)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = sport.active ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.08)";
              e.currentTarget.style.boxShadow = sport.active
                ? "0 18px 40px rgba(0,0,0,0.28)"
                : "0 14px 30px rgba(0,0,0,0.18)";
            }}
          >
            {!sport.active && <LockIcon />}

            <div
              style={{
                width: 86,
                height: 86,
                borderRadius: 22,
                background: sport.logoBg,
                border: `1px solid ${sport.logoBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
            >
              <img
                src={sport.logoSrc}
                alt={`${sport.label} logo`}
                style={{ width: 58, height: 58, objectFit: "contain", display: "block" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <div style={{ fontSize: "1.18rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{sport.label}</div>

              {sport.active ? (
                <span
                  style={{
                    width: "fit-content",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "5px 11px",
                    borderRadius: 999,
                    background: "rgba(249,115,22,0.16)",
                    color: "#fb923c",
                    border: "1px solid rgba(249,115,22,0.35)",
                  }}
                >
                  Free for a Limited Time
                </span>
              ) : (
                <span
                  style={{
                    width: "fit-content",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "5px 11px",
                    borderRadius: 999,
                    background: "rgba(163,163,163,0.1)",
                    color: "#a3a3a3",
                    border: "1px solid rgba(163,163,163,0.2)",
                  }}
                >
                  Subscription Required
                </span>
              )}

              <p style={{ fontSize: "0.88rem", color: "#9ca3af", margin: 0, lineHeight: 1.65 }}>{sport.desc}</p>
            </div>

            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: sport.active ? "#f5f5f5" : "#737373",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 0.2,
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
