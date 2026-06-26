import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function smallestTextElement(root: Element, pattern: RegExp) {
  const matches = Array.from(root.querySelectorAll<HTMLElement>("*"))
    .filter((element) => pattern.test((element.textContent ?? "").trim()))
    .sort((a, b) => a.children.length - b.children.length || (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0));
  return matches[0] ?? null;
}

function extractPolymarketLabel(card: HTMLElement) {
  const exact = smallestTextElement(card, /polymarket/i);
  if (exact) {
    const text = (exact.textContent ?? "").replace(/\s+/g, " ").trim();
    const percent = text.match(/\b\d{1,3}(?:\.\d+)?%\b/);
    const cents = text.match(/\b\d{1,3}(?:\.\d+)?¢\b/);
    if (percent) return `Polymarket ${percent[0]}`;
    if (cents) return `Polymarket ${cents[0]}`;
    if (text.length <= 42) return text;
  }

  const fullText = (card.textContent ?? "").replace(/\s+/g, " ");
  const nearby = fullText.match(/Polymarket[^%¢]{0,30}(\d{1,3}(?:\.\d+)?[%¢])/i);
  return nearby ? `Polymarket ${nearby[1]}` : "Polymarket —";
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

function setupMatchupCard(card: HTMLButtonElement) {
  if (card.dataset.mobileEnhancementReady === "true") return;
  card.dataset.mobileEnhancementReady = "true";
  card.dataset.mobileExpanded = "false";
  card.classList.add("jkb-mobile-matchup-card");

  const summary = document.createElement("div");
  summary.className = "jkb-mobile-matchup-summary";
  summary.setAttribute("role", "button");
  summary.setAttribute("aria-expanded", "false");
  summary.setAttribute("aria-label", "Click to show matchup");

  const images = Array.from(card.querySelectorAll<HTMLImageElement>("img"));
  const labels = Array.from(card.querySelectorAll<HTMLElement>("span"))
    .map((element) => (element.textContent ?? "").trim())
    .filter((text) => /^[A-Z]{2,4}$/.test(text));

  const left = document.createElement("div");
  left.className = "jkb-mobile-team-side";
  left.appendChild(cloneTeamLogo(images[0] ?? null, labels[0] ?? "MLB"));
  const leftLabel = document.createElement("span");
  leftLabel.textContent = labels[0] ?? "";
  left.appendChild(leftLabel);

  const middle = document.createElement("div");
  middle.className = "jkb-mobile-market-center";
  const market = document.createElement("strong");
  market.textContent = extractPolymarketLabel(card);
  const prompt = document.createElement("span");
  prompt.textContent = "Click to show matchup";
  middle.append(market, prompt);

  const right = document.createElement("div");
  right.className = "jkb-mobile-team-side jkb-mobile-team-side-right";
  const rightLabel = document.createElement("span");
  rightLabel.textContent = labels[1] ?? "";
  right.appendChild(rightLabel);
  right.appendChild(cloneTeamLogo(images[1] ?? null, labels[1] ?? "MLB"));

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

function findSocialMediaContainer() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,div,span"))
    .filter((element) => /^social media$/i.test((element.textContent ?? "").trim()));
  const heading = candidates[0];
  if (!heading) return null;
  return heading.closest<HTMLElement>("section,article,[class*='rounded'],[class*='card']") ?? heading.parentElement;
}

function placeNumerologyLink() {
  if (!window.matchMedia(MOBILE_QUERY).matches) return;
  if (!location.pathname.startsWith("/mlb")) return;
  if (document.querySelector("[data-mobile-numerology-link='true']")) return;

  const socialContainer = findSocialMediaContainer();
  if (!socialContainer?.parentElement) return;

  const wrapper = document.createElement("div");
  wrapper.dataset.mobileNumerologyLink = "true";
  wrapper.className = "jkb-mobile-numerology-link";

  const link = document.createElement("a");
  link.href = "/mlb/numerology";
  link.setAttribute("aria-label", "Open MLB numerology analysis");
  link.textContent = "𓂀";
  wrapper.appendChild(link);

  socialContainer.insertAdjacentElement("afterend", wrapper);
}

function applyEnhancements() {
  if (!location.pathname.startsWith("/mlb")) return;
  document.querySelectorAll<HTMLButtonElement>("button[id^='mlb-game-']").forEach(setupMatchupCard);
  placeNumerologyLink();
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

  return (
    <style>{`
      .jkb-mobile-matchup-summary,
      .jkb-mobile-numerology-link { display: none; }

      @media (max-width: 767px) {
        .jkb-mobile-matchup-card {
          min-height: 0 !important;
          overflow: hidden;
        }

        .jkb-mobile-matchup-card[data-mobile-expanded="false"] > :not(.jkb-mobile-matchup-summary) {
          display: none !important;
        }

        .jkb-mobile-matchup-summary {
          display: grid;
          grid-template-columns: minmax(70px, 1fr) minmax(120px, 1.35fr) minmax(70px, 1fr);
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          background: #ffffff;
        }

        .jkb-mobile-team-side {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          font-size: 11px;
          font-weight: 800;
          color: #031635;
        }

        .jkb-mobile-team-side-right { justify-content: flex-end; }

        .jkb-mobile-team-logo {
          width: 34px !important;
          height: 34px !important;
          object-fit: contain;
          flex: 0 0 auto;
        }

        .jkb-mobile-team-fallback {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: #eff4ff;
          color: #031635;
          font-size: 9px;
          font-weight: 900;
        }

        .jkb-mobile-market-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          text-align: center;
          min-width: 0;
        }

        .jkb-mobile-market-center strong {
          font-size: 12px;
          line-height: 1.2;
          color: #0f766e;
        }

        .jkb-mobile-market-center span {
          display: inline-flex;
          border-radius: 999px;
          background: #031635;
          padding: 4px 8px;
          color: white;
          font-size: 9px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
        }

        .jkb-mobile-numerology-link {
          display: flex;
          justify-content: center;
          padding: 8px 0 14px;
        }

        .jkb-mobile-numerology-link a {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: #17132a;
          color: #c4b5fd;
          font-size: 18px;
          text-decoration: none;
          box-shadow: 0 4px 14px rgba(23, 19, 42, 0.18);
        }
      }
    `}</style>
  );
}
