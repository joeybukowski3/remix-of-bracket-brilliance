import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";

const MOBILE_QUERY = "(max-width: 767px)";
type MarketSummary = { team: string; value: string };

function normalizeName(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.'’`-]+/g, " ").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

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
  return Array.from(card.querySelectorAll<HTMLElement>("span")).map((element) => (element.textContent ?? "").trim()).filter((text) => /^[A-Z]{2,4}$/.test(text)).filter((text, index, all) => all.indexOf(text) === index).slice(0, 2);
}

function getPitcherNames(card: HTMLElement) {
  const names = Array.from(card.querySelectorAll<HTMLElement>("span[title]")).map((element) => (element.getAttribute("title") ?? element.textContent ?? "").trim()).filter((text) => text && text !== "TBD" && /^[A-Za-zÀ-ÖØ-öø-ÿ.'’-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ.'’-]+){1,3}$/.test(text)).filter((text, index, all) => all.indexOf(text) === index).slice(0, 2);
  return { away: names[1] ?? "TBD", home: names[0] ?? "TBD" };
}

function extractMarketSummary(card: HTMLElement, teams: string[]): MarketSummary {
  const marketLabel = Array.from(card.querySelectorAll<HTMLElement>("*")).filter((element) => /^polymarket value$/i.test((element.textContent ?? "").trim())).sort((a, b) => a.children.length - b.children.length)[0];
  if (marketLabel) {
    let scope: HTMLElement | null = marketLabel.parentElement;
    for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
      const exact = (scope.textContent ?? "").replace(/\s+/g, " ").trim().match(/\b([A-Z]{2,4})\s*([+-]?\d{1,3}(?:\.\d+)?)%\b/);
      if (exact) return { team: exact[1], value: `${exact[2]}%` };
    }
  }
  const fallback = (card.textContent ?? "").replace(/\s+/g, " ").trim().match(/POLYMARKET VALUE\s*([A-Z]{2,4})\s*([+-]?\d{1,3}(?:\.\d+)?)%/i);
  if (fallback) return { team: fallback[1].toUpperCase(), value: `${fallback[2]}%` };
  return { team: teams[0] ?? "Edge", value: "—" };
}

function addTeamContent(container: HTMLDivElement, logo: Node, team: string, pitcher: string, reverse = false) {
  const text = document.createElement("div");
  text.className = "jkb-mobile-team-text";
  const teamLabel = document.createElement("span");
  teamLabel.textContent = team;
  const pitcherLabel = document.createElement("small");
  pitcherLabel.textContent = pitcher;
  text.append(teamLabel, pitcherLabel);
  if (reverse) container.append(text, logo); else container.append(logo, text);
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
  const pitchers = getPitcherNames(card);
  const marketSummary = extractMarketSummary(card, teams);
  const left = document.createElement("div");
  left.className = "jkb-mobile-team-side";
  addTeamContent(left, cloneTeamLogo(images[0] ?? null, teams[0] ?? "MLB"), teams[0] ?? "", pitchers.away);
  const middle = document.createElement("div");
  middle.className = "jkb-mobile-market-center";
  const heading = document.createElement("small");
  heading.textContent = "Model Edge";
  const market = document.createElement("strong");
  market.textContent = `${marketSummary.team} ${marketSummary.value}`;
  const prompt = document.createElement("span");
  prompt.textContent = "Click to show matchup";
  middle.append(heading, market, prompt);
  const right = document.createElement("div");
  right.className = "jkb-mobile-team-side jkb-mobile-team-side-right";
  addTeamContent(right, cloneTeamLogo(images[1] ?? null, teams[1] ?? "MLB"), teams[1] ?? "", pitchers.home, true);
  summary.append(left, middle, right);
  card.prepend(summary);
  card.addEventListener("click", (event) => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    const target = event.target as Node;
    if (!summary.contains(target) && card.dataset.mobileExpanded === "true") return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const expanded = card.dataset.mobileExpanded !== "true";
    card.dataset.mobileExpanded = String(expanded);
    summary.setAttribute("aria-expanded", String(expanded));
    prompt.textContent = expanded ? "Click to hide matchup" : "Click to show matchup";
  }, true);
}

function findSocialRow(label: HTMLElement, container: HTMLElement) {
  let current: HTMLElement | null = label;
  while (current && current !== container) {
    if (current.dataset.hrRow != null || current.dataset.kRow != null || current.style.position === "relative" || current.style.borderLeft) return current;
    current = current.parentElement;
  }
  return null;
}

function findNameLabels(container: HTMLElement, name: string) {
  const normalized = normalizeName(name);
  return Array.from(container.querySelectorAll<HTMLElement>("span,div")).filter((element) => element.children.length === 0 && normalizeName(element.textContent) === normalized);
}

function upsertOddsBadge(label: HTMLElement, kind: "hr" | "k", text: string, missing: boolean) {
  const parent = label.parentElement;
  if (!parent) return;
  let badge = parent.querySelector<HTMLElement>(`:scope > [data-jkb-social-${kind}-odds]`);
  if (!badge) {
    badge = document.createElement("span");
    badge.setAttribute(`data-jkb-social-${kind}-odds`, "true");
    badge.className = `jkb-social-odds jkb-social-odds-${kind}`;
    label.insertAdjacentElement("afterend", badge);
  }
  if (badge.textContent !== text) badge.textContent = text;
  badge.dataset.missing = String(missing);
}

function applySocialOdds(batters: any[], pitchers: any[], date: string | null, generatedAt: string | null) {
  const hrContainer = document.querySelector<HTMLElement>('[data-x-export="mlb-hr-social"]');
  if (hrContainer) {
    if (date) hrContainer.dataset.hrDate = date;
    if (generatedAt) hrContainer.dataset.hrGeneratedAt = generatedAt;
    for (const batter of batters) {
      const odds = typeof batter.hrOddsYes === "string" && /^[+-]\d+$/.test(batter.hrOddsYes) ? batter.hrOddsYes : null;
      for (const label of findNameLabels(hrContainer, batter.player)) {
        const row = findSocialRow(label, hrContainer);
        if (!row) continue;
        if (row.style.position === "relative") {
          row.dataset.hrRow = row.dataset.hrRow || normalizeName(batter.player);
          row.dataset.hrPlayer = batter.player;
          row.dataset.hrTeam = batter.team ?? "";
          row.dataset.hrScore = Number.isFinite(Number(batter.hrScore)) ? String(batter.hrScore) : "";
          row.dataset.hrOdds = odds ?? "";
          row.dataset.hrBookmaker = batter.hrOddsBook ?? "";
        }
        upsertOddsBadge(label, "hr", odds ?? "N/A", !odds);
      }
    }
  }
  const kContainer = document.querySelector<HTMLElement>('[data-x-export="mlb-k-social"]');
  if (kContainer) {
    if (date) kContainer.dataset.kDate = date;
    if (generatedAt) kContainer.dataset.kGeneratedAt = generatedAt;
    for (const pitcher of pitchers) {
      const line = Number(pitcher.kLine);
      const validLine = Number.isFinite(line) && line > 0 ? line : null;
      const over = typeof pitcher.kOddsOver === "string" && /^[+-]\d+$/.test(pitcher.kOddsOver) ? pitcher.kOddsOver : null;
      const under = typeof pitcher.kOddsUnder === "string" && /^[+-]\d+$/.test(pitcher.kOddsUnder) ? pitcher.kOddsUnder : null;
      const lineLabel = validLine != null ? (Number.isInteger(validLine) ? validLine.toFixed(0) : String(validLine)) : "";
      const display = validLine != null && over ? `O ${lineLabel} (${over})` : "N/A";
      for (const label of findNameLabels(kContainer, pitcher.pitcher)) {
        const row = findSocialRow(label, kContainer);
        if (!row) continue;
        if (row.style.position === "relative" || row.dataset.kRow != null) {
          row.dataset.kRow = row.dataset.kRow || normalizeName(pitcher.pitcher);
          row.dataset.kPitcher = pitcher.pitcher;
          row.dataset.kTeam = pitcher.team ?? "";
          row.dataset.kOpponent = pitcher.opponent ?? "";
          row.dataset.kLine = validLine != null ? String(validLine) : "";
          row.dataset.kOddsOver = validLine != null && over ? `${lineLabel} Ks (${over})` : "";
          row.dataset.kOddsUnder = under ?? "";
          row.dataset.kBookmaker = pitcher.kOddsBook ?? "";
        }
        upsertOddsBadge(label, "k", display, validLine == null || !over);
      }
    }
  }
}

function MlbSocialPropOddsEnhancements() {
  const { batters, pitchers, dashboard } = useMlbPropsData();
  const payload = useMemo(() => ({ batters, pitchers, date: dashboard?.date ?? null, generatedAt: dashboard?.generatedAt ?? null }), [batters, pitchers, dashboard?.date, dashboard?.generatedAt]);
  useEffect(() => {
    const apply = () => applySocialOdds(payload.batters, payload.pitchers, payload.date, payload.generatedAt);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [payload]);
  return null;
}

function applyMatchupEnhancements(pathname: string) {
  if (pathname !== "/mlb") return;
  document.querySelectorAll<HTMLButtonElement>("button[id^='mlb-game-']").forEach(setupMatchupCard);
}

export default function MlbMobileHubEnhancements() {
  const { pathname } = useLocation();
  useEffect(() => {
    applyMatchupEnhancements(pathname);
    const observer = new MutationObserver(() => applyMatchupEnhancements(pathname));
    observer.observe(document.body, { childList: true, subtree: true });
    const onResize = () => applyMatchupEnhancements(pathname);
    window.addEventListener("resize", onResize);
    return () => { observer.disconnect(); window.removeEventListener("resize", onResize); };
  }, [pathname]);
  return <>
    {pathname === "/mlb" && <MlbSocialPropOddsEnhancements />}
    {pathname === "/mlb" && <a href="/mlb/numerology" className="jkb-mobile-numerology-link" aria-label="Open MLB Numerology"><span aria-hidden="true">🔮</span><span>Numerology</span></a>}
    <style>{`.jkb-mobile-matchup-summary,.jkb-mobile-numerology-link{display:none}.jkb-social-odds{display:inline-flex;align-items:center;justify-content:center;margin-left:6px;border-radius:999px;padding:2px 6px;font-size:10px;font-weight:900;line-height:1;white-space:nowrap}.jkb-social-odds-hr{border:1px solid rgba(56,189,248,.45);background:rgba(14,165,233,.16);color:#7dd3fc}.jkb-social-odds-k{border:1px solid rgba(74,222,128,.45);background:rgba(34,197,94,.14);color:#86efac}.jkb-social-odds[data-missing="true"]{border-color:rgba(148,163,184,.3);background:rgba(148,163,184,.1);color:#94a3b8}@media (max-width:767px){.jkb-mobile-numerology-link{display:flex;position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:80;align-items:center;gap:7px;border:1px solid rgba(160,120,255,.45);border-radius:999px;background:#171426;color:#eadfff;padding:10px 14px;font-size:12px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.28)}.jkb-mobile-numerology-link span:first-child{font-size:17px;line-height:1}.jkb-mobile-matchup-card{min-height:0!important;overflow:hidden}.jkb-mobile-matchup-card[data-mobile-expanded="false"]>:not(.jkb-mobile-matchup-summary){display:none!important}.jkb-mobile-matchup-summary{display:grid;grid-template-columns:minmax(82px,1fr) minmax(132px,1.25fr) minmax(82px,1fr);align-items:center;gap:6px;width:100%;padding:12px 10px;background:#fff}.jkb-mobile-team-side{display:flex;align-items:center;gap:6px;min-width:0;color:#031635}.jkb-mobile-team-side-right{justify-content:flex-end;text-align:right}.jkb-mobile-team-text{display:flex;min-width:0;flex-direction:column;gap:1px}.jkb-mobile-team-text span{font-size:11px;font-weight:900;line-height:1.1}.jkb-mobile-team-text small{max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px;font-weight:700;line-height:1.15;color:#64748b}.jkb-mobile-team-logo{width:34px!important;height:34px!important;object-fit:contain;flex:0 0 auto}.jkb-mobile-team-fallback{display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:#eff4ff;color:#031635;font-size:9px;font-weight:900}.jkb-mobile-market-center{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;min-width:0}.jkb-mobile-market-center>small{font-size:10px;line-height:1;color:#0f766e;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.jkb-mobile-market-center strong{font-size:14px;line-height:1.1;color:#0f766e;white-space:nowrap}.jkb-mobile-market-center span{display:inline-flex;border-radius:999px;background:#031635;padding:4px 8px;color:white;font-size:9px;font-weight:800;line-height:1;white-space:nowrap}}`}</style>
  </>;
}
