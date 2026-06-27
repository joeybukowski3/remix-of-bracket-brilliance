import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

type MarketSummary = { team: string; value: string };

function cloneTeamLogo(source: HTMLImageElement | null, fallback: string) {
  if (!source) {
    const circle = document.createElement("span");
    circle.className = "jkb-mobile-team-fallback";
    circle.textContent = fallback;
    return circle;
  }
  const clone = source.cloneNode(true) as HTMLImageElement;
  clone.removeAttribute("width");
  clone.removeAttribute("height");
  clone.className = "jkb-mobile-team-logo";
  return clone;
}

function getTeamLabels(card: HTMLElement) {
  return Array.from(card.querySelectorAll<HTMLElement>("span"))
    .map((element) => (element.textContent ?? "").trim())
    .filter((text) => /^[A-Z]{2,4}$/.test(text))
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(0, 2);
}

function extractMarketSummary(card: HTMLElement, teams: string[]): MarketSummary {
  const text = (card.textContent ?? "").replace(/\s+/g, " ").trim();
  const values = Array.from(text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*(%|¢)/g))
    .map((match) => ({ numeric: Number(match[1]), display: `${match[1]}${match[2]}` }))
    .filter((item) => Number.isFinite(item.numeric) && item.numeric >= 0 && item.numeric <= 100);

  if (values.length >= 2 && teams.length >= 2) {
    const winnerIndex = values[1].numeric > values[0].numeric ? 1 : 0;
    return { team: teams[winnerIndex], value: values[winnerIndex].display };
  }

  if (values.length === 1) {
    const nearbyTeam = teams.find((team) => new RegExp(`${team}[^%¢]{0,24}${values[0].display.replace("%", "\\%").replace("¢", "\\¢")}`, "i").test(text));
    return { team: nearbyTeam ?? teams[0] ?? "Favored", value: values[0].display };
  }

  return { team: teams[0] ?? "Favored", value: "—" };
}

function setupMatchupCard(card: HTMLButtonElement) {
  if (card.dataset.mobileEnhancementReady === "true") return;
  card.dataset.mobileEnhancementReady = "true";
  card.dataset.mobileExpanded = "false";
  card.classList.add("jkb-mobile-matchup-card");

  const summary = document.createElement("div");
  summary.className = "jkb-mobile-matchup-summary";
  summary.setAttribute("role", "button");
  summary.setAttribute("aria-expanded", "false");

  const images = Array.from(card.querySelectorAll<HTMLImageElement>("img"));
  const teams = getTeamLabels(card);
  const marketSummary = extractMarketSummary(card, teams);

  const left = document.createElement("div");
  left.className = "jkb-mobile-team-side";
  left.appendChild(cloneTeamLogo(images[0] ?? null, teams[0] ?? "MLB"));
  const leftLabel = document.createElement("span");
  leftLabel.textContent = teams[0] ?? "";
  left.appendChild(leftLabel);

  const middle = document.createElement("div");
  middle.className = "jkb-mobile-market-center";
  const market = document.createElement("strong");
  market.textContent = `${marketSummary.team} ${marketSummary.value}`;
  const marketSub = document.createElement("small");
  marketSub.textContent = "Polymarket favorite";
  const prompt = document.createElement("span");
  prompt.textContent = "Click to show matchup";
  middle.append(market, marketSub, prompt);

  const right = document.createElement("div");
  right.className = "jkb-mobile-team-side jkb-mobile-team-side-right";
  const rightLabel = document.createElement("span");
  rightLabel.textContent = teams[1] ?? "";
  right.appendChild(rightLabel);
  right.appendChild(cloneTeamLogo(images[1] ?? null, teams[1] ?? "MLB"));

  summary.append(left, middle, right);
  card.prepend(summary);

  card.addEventListener("click", (event) => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    const target = event.target as Node;
    if (!summary.contains(target) && card.dataset.mobileExpanded === "true") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const expanded = card.dataset.mobileExpanded !== "true";
    card.dataset.mobileExpanded = String(expanded);
    summary.setAttribute("aria-expanded", String(expanded));
    prompt.textContent = expanded ? "Click to hide matchup" : "Click to show matchup";
  }, true);
}

function applyEnhancements() {
  if (location.pathname !== "/mlb") return;
  document.querySelectorAll<HTMLButtonElement>("button[id^='mlb-game-']").forEach(setupMatchupCard);
}

export default function MlbMobileHubEnhancements() {
  useEffect(() => {
    applyEnhancements();
    const observer = new MutationObserver(applyEnhancements);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", applyEnhancements);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyEnhancements);
    };
  }, []);

  return <style>{`
    .jkb-mobile-matchup-summary { display: none; }
    @media (max-width: 767px) {
      .jkb-mobile-matchup-card { min-height: 0 !important; overflow: hidden; }
      .jkb-mobile-matchup-card[data-mobile-expanded="false"] > :not(.jkb-mobile-matchup-summary) { display: none !important; }
      .jkb-mobile-matchup-summary { display: grid; grid-template-columns: minmax(70px,1fr) minmax(135px,1.45fr) minmax(70px,1fr); align-items: center; gap: 8px; width: 100%; padding: 12px; background: #fff; }
      .jkb-mobile-team-side { display:flex; align-items:center; gap:6px; min-width:0; font-size:11px; font-weight:800; color:#031635; }
      .jkb-mobile-team-side-right { justify-content:flex-end; }
      .jkb-mobile-team-logo { width:34px !important; height:34px !important; object-fit:contain; flex:0 0 auto; }
      .jkb-mobile-team-fallback { display:grid; place-items:center; width:34px; height:34px; border-radius:999px; background:#eff4ff; color:#031635; font-size:9px; font-weight:900; }
      .jkb-mobile-market-center { display:flex; flex-direction:column; align-items:center; gap:3px; text-align:center; min-width:0; }
      .jkb-mobile-market-center strong { font-size:14px; line-height:1.1; color:#0f766e; white-space:nowrap; }
      .jkb-mobile-market-center small { font-size:9px; line-height:1; color:#64748b; font-weight:700; }
      .jkb-mobile-market-center span { display:inline-flex; border-radius:999px; background:#031635; padding:4px 8px; color:white; font-size:9px; font-weight:800; line-height:1; white-space:nowrap; }
    }
  `}</style>;
}
