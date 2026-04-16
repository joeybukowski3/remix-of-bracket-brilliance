import { useEffect } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";

const NFL_DRAFT_STYLES = `
  .draft-section{max-width:1200px;margin:2rem auto;padding:0 1rem}
  .draft-section h2{font-size:1.8rem;font-weight:700;margin-bottom:.3rem;color:#111;border-left:5px solid #1a3a5c;padding-left:12px}
  .draft-section .subtitle{font-size:.82rem;color:#666;margin-bottom:1.2rem;padding-left:17px}
  .draft-section .table-scroll{overflow-x:auto;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.13)}
  .draft-section table{width:100%;min-width:900px;border-collapse:collapse;background:#fff;font-size:12px}
  .draft-section thead tr{background:#1a3a5c;color:#fff}
  .draft-section thead th{padding:9px 10px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
  .draft-section tbody tr:nth-child(even){background:#f7f9fc}
  .draft-section tbody tr:hover{background:#e8f2fb}
  .draft-section td{padding:9px 10px;vertical-align:middle;border-bottom:1px solid #e5e9ee;line-height:1.45}
  .draft-section td.notes-col{vertical-align:top;padding-top:10px}
  .draft-section .team-cell{display:flex;align-items:center;gap:8px;min-width:150px}
  .draft-section .team-logo{width:36px;height:36px;object-fit:contain;flex-shrink:0;border-radius:3px}
  .draft-section .team-logo-fallback{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;color:#fff}
  .draft-section .team-info .team-name{font-weight:700;font-size:12.5px;white-space:nowrap}
  .draft-section .team-info .pick-num{font-size:10px;color:#888}
  .draft-section .team-info .trade-note{font-size:9.5px;color:#c0392b;font-style:italic}
  .draft-section .player-name{font-weight:600;font-size:12.5px}
  .draft-section .pos{display:inline-block;font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:9px;margin-left:3px;vertical-align:middle;white-space:nowrap}
  .draft-section .school{font-size:10.5px;color:#555;margin-top:1px}
  .draft-section .source-tag{font-size:9.5px;color:#999;font-style:italic;margin-top:1px}
  .draft-section .qb{background:#d0e8fb;color:#0c447c}
  .draft-section .edge{background:#c8f0df;color:#085041}
  .draft-section .lb{background:#e5e0fc;color:#3c3489}
  .draft-section .rb{background:#fde8b8;color:#6b3c00}
  .draft-section .ot{background:#d8f0c4;color:#27500a}
  .draft-section .cb{background:#fbd9e8;color:#72243e}
  .draft-section .s{background:#fde0d4;color:#712b13}
  .draft-section .wr{background:#fcd8d8;color:#791f1f}
  .draft-section .dl{background:#e8e6df;color:#3a3a38}
  .draft-section .g{background:#e0f0e8;color:#1a5c3a}
  .draft-section .note{font-size:10.5px;color:#444;line-height:1.5}
  .draft-section tr.divider td{background:#1a3a5c;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:5px 10px;text-align:center}
  @media(max-width:700px){.draft-section h2{font-size:1.3rem}}
`;

interface TeamCellProps {
  abbr: string;
  alt: string;
  color: string;
  logo: string;
  name: string;
  pick: string;
  tradeNote?: string;
}

function useNflDraftStyles() {
  useEffect(() => {
    const existing = document.getElementById("nfl-draft-table-styles");
    if (existing) return;

    const style = document.createElement("style");
    style.id = "nfl-draft-table-styles";
    style.textContent = NFL_DRAFT_STYLES;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);
}

function TeamCell({ abbr, alt, color, logo, name, pick, tradeNote }: TeamCellProps) {
  return (
    <div className="team-cell">
      <img
        className="team-logo"
        src={logo}
        alt={alt}
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const fallback = event.currentTarget.nextElementSibling as HTMLDivElement | null;
          if (fallback) fallback.style.display = "flex";
        }}
      />
      <div className="team-logo-fallback" style={{ background: color, display: "none" }}>{abbr}</div>
      <div className="team-info">
        <div className="team-name">{name}</div>
        <div className="pick-num">{pick}</div>
        {tradeNote ? <div className="trade-note">{tradeNote}</div> : null}
      </div>
    </div>
  );
}

function Player({ name, position, school, note }: { name: string; position: string; school: string; note: string }) {
  return (
    <tr>
      <td />
      <td><div className="player-name">{name}</div></td>
      <td><span className={`pos ${position.toLowerCase()}`}>{position}</span></td>
      <td><div className="school">{school}</div></td>
      <td className="notes-col"><div className="note">{note}</div></td>
    </tr>
  );
}

export default function NFL() {
  useNflDraftStyles();

  usePageSeo({
    title: "NFL Mock Draft Full Round 1",
    description:
      "Joe Knows Ball NFL landing page featuring the 2026 NFL Mock Draft full Round 1 board with Charlie Campbell picks and team notes.",
    path: "/nfl",
  });

  return (
    <SiteShell>
      <main className="site-page pb-16 pt-10">
        <div className="site-container site-stack">
          <section className="surface-card md:p-8">
            <div className="max-w-4xl">
              <div className="eyebrow-label">NFL Landing Page</div>
              <h1 className="page-title mt-4 max-w-3xl">
                2026 NFL mock draft with the full first round board and Campbell notes.
              </h1>
              <p className="page-copy mt-5 max-w-3xl">
                This page now reflects the full Round 1 draft table from your latest downloaded HTML file, with the
                source styling kept local to the NFL landing page.
              </p>
            </div>
          </section>

          <section className="draft-section">
            <h2>2026 NFL Mock Draft - Full Round 1</h2>
            <p className="subtitle">Charlie Campbell / WalterFootball · April 13-16, 2026 · Logos via ESPN CDN</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Campbell Pick</th>
                    <th>Position</th>
                    <th>School</th>
                    <th>Campbell Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="divider"><td colSpan={5}>Picks 1-10</td></tr>

                  <tr>
                    <td><TeamCell abbr="LV" alt="Las Vegas Raiders" color="#a5acaf" logo="https://a.espncdn.com/i/teamlogos/nfl/500/lv.png" name="Las Vegas Raiders" pick="Pick #1" /></td>
                    <td><div className="player-name">Fernando Mendoza</div></td>
                    <td><span className="pos qb">QB</span></td>
                    <td><div className="school">Indiana</div></td>
                    <td className="notes-col"><div className="note">Team-sourced signal. Raiders operated entire offseason around Mendoza. Kirk Cousins signed as bridge. GM Spytek: "Meritocracy - best guy will play." Lock pick.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="NYJ" alt="NY Jets" color="#125740" logo="https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png" name="New York Jets" pick="Pick #2" /></td>
                    <td><div className="player-name">David Bailey</div></td>
                    <td><span className="pos edge">EDGE</span></td>
                    <td><div className="school">Texas Tech</div></td>
                    <td className="notes-col"><div className="note">Rising team signal. Both Bailey and Reese visited facility. Breer (SI): "Bailey makes more sense." HC Glenn: "If we love the player, we go get him." Jets ranked 31st in sacks in 2025.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="ARI" alt="Arizona Cardinals" color="#97233f" logo="https://a.espncdn.com/i/teamlogos/nfl/500/ari.png" name="Arizona Cardinals" pick="Pick #3" /></td>
                    <td><div className="player-name">David Bailey</div></td>
                    <td><span className="pos edge">EDGE</span></td>
                    <td><div className="school">Texas Tech</div></td>
                    <td className="notes-col"><div className="note">Board-driven. Assumes Bailey falls from #2. Cardinals signed 4 OL but zero EDGE in FA - by design. GM Ossenfort trade-down possible. If Bailey goes #2, Reese likely lands here.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="TEN" alt="Tennessee Titans" color="#4b92db" logo="https://a.espncdn.com/i/teamlogos/nfl/500/ten.png" name="Tennessee Titans" pick="Pick #4" /></td>
                    <td><div className="player-name">Jeremiyah Love</div></td>
                    <td><span className="pos rb">RB</span></td>
                    <td><div className="school">Notre Dame</div></td>
                    <td className="notes-col"><div className="note">Team-sourced signal. ESPN: Love fits Jahmyr Gibbs mold Saleh valued in SF. HC Saleh "would-be" interest confirmed. 6.9 ypc, 18 TDs in 2025. Whoever escapes #2/#3 between Bailey/Reese likely lands here instead.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="NYG" alt="NY Giants" color="#0b2265" logo="https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png" name="New York Giants" pick="Pick #5" /></td>
                    <td><div className="player-name">Caleb Downs</div></td>
                    <td><span className="pos s">S</span></td>
                    <td><div className="school">Ohio State</div></td>
                    <td className="notes-col"><div className="note">Board-driven. GM Schoen praised Downs and Styles by name; watched "a lot of Ohio State defensive film." Said "we like our RB room" - signal against Love. HC Harbaugh reportedly loves Love. True BPA pick.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="CLE" alt="Cleveland Browns" color="#ff3c00" logo="https://a.espncdn.com/i/teamlogos/nfl/500/cle.png" name="Cleveland Browns" pick="Pick #6" /></td>
                    <td><div className="player-name">Carnell Tate</div></td>
                    <td><span className="pos wr">WR</span></td>
                    <td><div className="school">Ohio State</div></td>
                    <td className="notes-col"><div className="note">Speculative. Berry: BPA, won't typecast tackle by side. Visited Proctor and Freeling (OT). Also WR in play. Trade-down actively being explored per Breer. Have Shedeur Sanders - no QB needed here.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="WSH" alt="Washington Commanders" color="#773141" logo="https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png" name="Washington Commanders" pick="Pick #7" /></td>
                    <td><div className="player-name">Sonny Styles</div></td>
                    <td><span className="pos lb">LB</span></td>
                    <td><div className="school">Ohio State</div></td>
                    <td className="notes-col"><div className="note">Board-driven. Peters confirmed: "We don't have to pick for need." Spent $250M+ in FA. Combine: "Pass rush will weigh more." Downs checks nearly every Peters draft-tendency box per Hogs Haven analysis.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="NO" alt="New Orleans Saints" color="#9f8958" logo="https://a.espncdn.com/i/teamlogos/nfl/500/no.png" name="New Orleans Saints" pick="Pick #8" /></td>
                    <td><div className="player-name">Carnell Tate</div></td>
                    <td><span className="pos wr">WR</span></td>
                    <td><div className="school">Ohio State</div></td>
                    <td className="notes-col"><div className="note">Team-sourced signal. Ex-coach Mike Smith: "Saints will be all over Tate." Loomis had extended Delane chat at LSU pro day. No EDGE signed in FA - defense also in play. WR and EDGE co-favorite paths.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="KC" alt="Kansas City Chiefs" color="#e31837" logo="https://a.espncdn.com/i/teamlogos/nfl/500/kc.png" name="Kansas City Chiefs" pick="Pick #9" /></td>
                    <td><div className="player-name">Rueben Bain Jr.</div></td>
                    <td><span className="pos edge">EDGE</span></td>
                    <td><div className="school">Miami (FL)</div></td>
                    <td className="notes-col"><div className="note">Team visit confirmed. Veach named WR, EDGE, DB as priorities. 4 WR top-30 visits but zero EDGE - possible smoke-screen. Chiefs had 26 sacks in 2025, tied for worst. Veach history of pre-draft deception.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="CIN" alt="Cincinnati Bengals" color="#fb4f14" logo="https://a.espncdn.com/i/teamlogos/nfl/500/cin.png" name="Cincinnati Bengals" pick="Pick #10" /></td>
                    <td><div className="player-name">Jermod McCoy</div></td>
                    <td><span className="pos cb">CB</span></td>
                    <td><div className="school">Tennessee</div></td>
                    <td className="notes-col"><div className="note">Speculative/board-driven. CB is Round 1 priority after FA moves. Delane now safer option after McCoy medical red-flag (degenerative knee per Pauline). Tobin: "Big enough, fast enough, strong enough."</div></td>
                  </tr>

                  <tr className="divider"><td colSpan={5}>Picks 11-20</td></tr>

                  <tr>
                    <td><TeamCell abbr="MIA" alt="Miami Dolphins" color="#008e97" logo="https://a.espncdn.com/i/teamlogos/nfl/500/mia.png" name="Miami Dolphins" pick="Pick #11" /></td>
                    <td><div className="player-name">Makai Lemon</div></td>
                    <td><span className="pos wr">WR</span></td>
                    <td><div className="school">USC</div></td>
                    <td className="notes-col"><div className="note">Tyreek Hill and Jaylen Waddle gone; Dolphins receiver room is barren. Lemon wins contested catches and has first-round talent despite poor combine interview. Campbell: Dolphins desperately need WR1.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="DAL" alt="Dallas Cowboys" color="#003594" logo="https://a.espncdn.com/i/teamlogos/nfl/500/dal.png" name="Dallas Cowboys" pick="Pick #12" /></td>
                    <td><div className="player-name">Mansoor Delane</div></td>
                    <td><span className="pos cb">CB</span></td>
                    <td><div className="school">LSU</div></td>
                    <td className="notes-col"><div className="note">Trevon Diggs released - CB is glaring need. Delane had 45 tackles, 2 INTs, 11 PBUs in 2025. 4.35 40 at LSU pro day. Campbell has Cowboys addressing CB with this pick. Cowboys also have pick #20 (ex-Packers).</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="LAR" alt="Los Angeles Rams" color="#003594" logo="https://a.espncdn.com/i/teamlogos/nfl/500/lar.png" name="LA Rams" pick="Pick #13" tradeNote="via Falcons" /></td>
                    <td><div className="player-name">Omar Cooper Jr.</div></td>
                    <td><span className="pos wr">WR</span></td>
                    <td><div className="school">Indiana</div></td>
                    <td className="notes-col"><div className="note">Rams add slot receiver alongside Puka Nacua and Davante Adams. Cooper: 69 catches, 937 yds, 13 TDs in 2025. Schemed as Deebo Samuel comp. Falcons traded this pick - LA selecting here.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="BAL" alt="Baltimore Ravens" color="#241773" logo="https://a.espncdn.com/i/teamlogos/nfl/500/bal.png" name="Baltimore Ravens" pick="Pick #14" /></td>
                    <td><div className="player-name">Jordyn Tyson</div></td>
                    <td><span className="pos wr">WR</span></td>
                    <td><div className="school">Arizona State</div></td>
                    <td className="notes-col"><div className="note">Ravens add a true outside receiver for Lamar Jackson. Tyson: 75 catches, 1,101 yds, 10 TDs in 2024. Durability concerns flagged by team sources - missed time each college season. High upside, elevated risk.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="TB" alt="Tampa Bay Buccaneers" color="#d50a0a" logo="https://a.espncdn.com/i/teamlogos/nfl/500/tb.png" name="Tampa Bay Buccaneers" pick="Pick #15" /></td>
                    <td><div className="player-name">C.J. Allen</div></td>
                    <td><span className="pos lb">LB</span></td>
                    <td><div className="school">Georgia</div></td>
                    <td className="notes-col"><div className="note">Lavonte David retired - LB is a clear need. Allen: 88 tackles, 3.5 sacks, 2 FFs in 2025. Smart, instinctive linebacker with versatility. Campbell: plug-and-play starter next to Alex Anzalone.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="NYJ" alt="NY Jets" color="#125740" logo="https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png" name="New York Jets" pick="Pick #16" tradeNote="via Colts" /></td>
                    <td><div className="player-name">Jermod McCoy</div></td>
                    <td><span className="pos cb">CB</span></td>
                    <td><div className="school">Tennessee</div></td>
                    <td className="notes-col"><div className="note">Jets use 2nd first-rounder on CB to replace Sauce Gardner. McCoy: instinctive tackler, coming off torn ACL - healthy per team sources. Jets need CB depth across roster after Gardner trade. 5 first-round picks in next 2 years.</div></td>
                  </tr>

                  <tr className="divider"><td colSpan={5}>Picks 17-26</td></tr>

                  <tr>
                    <td><TeamCell abbr="DET" alt="Detroit Lions" color="#0076b6" logo="https://a.espncdn.com/i/teamlogos/nfl/500/det.png" name="Detroit Lions" pick="Pick #17" /></td>
                    <td><div className="player-name">Kadyn Proctor</div></td>
                    <td><span className="pos ot">OT</span></td>
                    <td><div className="school">Alabama</div></td>
                    <td className="notes-col"><div className="note">Taylor Decker released - Lions must replace LT. Proctor: 6-7, 360 lbs. Colossal run blocker with upside. Character concerns flagged. Campbell: Lions will love his big-time potential and SEC experience.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="MIN" alt="Minnesota Vikings" color="#4f2683" logo="https://a.espncdn.com/i/teamlogos/nfl/500/min.png" name="Minnesota Vikings" pick="Pick #18" /></td>
                    <td><div className="player-name">Lee Hunter</div></td>
                    <td><span className="pos dl">DL</span></td>
                    <td><div className="school">Texas Tech</div></td>
                    <td className="notes-col"><div className="note">Vikings need young interior DL talent. Hunter: quick off ball, surprising athleticism for a heavy NT. 41 tackles, 2.5 sacks in 2025. Campbell: good gap filler and pass rusher at the position.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="CAR" alt="Carolina Panthers" color="#0085ca" logo="https://a.espncdn.com/i/teamlogos/nfl/500/car.png" name="Carolina Panthers" pick="Pick #19" /></td>
                    <td><div className="player-name">Keldric Faulk</div></td>
                    <td><span className="pos edge">EDGE</span></td>
                    <td><div className="school">Auburn</div></td>
                    <td className="notes-col"><div className="note">Panthers grab big-bodied EDGE to help stop the run. Faulk: 6-6, 270 lbs. 7 sacks in 2024; only 2 in 2025 due to scheme restrictions. Campbell: Auburn coaches two-gapped him rather than letting him rush. High upside if used properly.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="DAL" alt="Dallas Cowboys" color="#003594" logo="https://a.espncdn.com/i/teamlogos/nfl/500/dal.png" name="Dallas Cowboys" pick="Pick #20" tradeNote="via Packers" /></td>
                    <td><div className="player-name">Francis Mauigoa</div></td>
                    <td><span className="pos ot">OT</span></td>
                    <td><div className="school">Miami (FL)</div></td>
                    <td className="notes-col"><div className="note">Cowboys use 2nd first-rounder on top OT. Mauigoa: 6-5, 329 lbs. 85.9 PFF pass-block grade. Run blocker who could protect Dak Prescott. Campbell has Dallas doubling up - CB at #12, OT at #20.</div></td>
                  </tr>

                  <tr className="divider"><td colSpan={5}>Picks 21-32</td></tr>

                  <tr>
                    <td><TeamCell abbr="PIT" alt="Pittsburgh Steelers" color="#ffb612" logo="https://a.espncdn.com/i/teamlogos/nfl/500/pit.png" name="Pittsburgh Steelers" pick="Pick #21" /></td>
                    <td><div className="player-name">Olaivavega Ioane</div></td>
                    <td><span className="pos g">G</span></td>
                    <td><div className="school">Penn State</div></td>
                    <td className="notes-col"><div className="note">Isaac Seumalo left in FA - interior OL upgrade needed. Ioane: 6-4, 334 lbs. Power blocker, nasty at point of attack. Campbell: protects Aaron Rodgers and opens holes for ground game. No sacks allowed since 2023.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="LAC" alt="LA Chargers" color="#0080c6" logo="https://a.espncdn.com/i/teamlogos/nfl/500/lac.png" name="LA Chargers" pick="Pick #22" /></td>
                    <td><div className="player-name">Kayden McDonald</div></td>
                    <td><span className="pos dl">DL</span></td>
                    <td><div className="school">Ohio State</div></td>
                    <td className="notes-col"><div className="note">Chargers had massive OL and DL issues in 2025. McDonald: disruptive defender, plus athleticism at big size. Campbell: Chargers need defensive line help to sweep Mahomes - McDonald provides interior pass rush.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="PHI" alt="Philadelphia Eagles" color="#004c54" logo="https://a.espncdn.com/i/teamlogos/nfl/500/phi.png" name="Philadelphia Eagles" pick="Pick #23" /></td>
                    <td><div className="player-name">Caleb Lomu</div></td>
                    <td><span className="pos ot">OT</span></td>
                    <td><div className="school">Utah</div></td>
                    <td className="notes-col"><div className="note">Lane Johnson missed 8 games last season - Eagles need OT depth/succession. Lomu: 6-6, 304 lbs. Athletic, adept at handling speed rushers. Campbell: could be LT long-term once Johnson's time is done. Needs to get stronger.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="CLE" alt="Cleveland Browns" color="#ff3c00" logo="https://a.espncdn.com/i/teamlogos/nfl/500/cle.png" name="Cleveland Browns" pick="Pick #24" tradeNote="via Jaguars" /></td>
                    <td><div className="player-name">Monroe Freeling</div></td>
                    <td><span className="pos ot">OT</span></td>
                    <td><div className="school">Georgia</div></td>
                    <td className="notes-col"><div className="note">Browns use 2nd first-rounder on OT. Freeling: #2 OT prospect, 13th on Kiper big board. Berry confirmed Browns "spent extended time" with Freeling in predraft process. One-year full-time LT starter at Georgia.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="CHI" alt="Chicago Bears" color="#0b162a" logo="https://a.espncdn.com/i/teamlogos/nfl/500/chi.png" name="Chicago Bears" pick="Pick #25" /></td>
                    <td><div className="player-name">Vega Ioane</div></td>
                    <td><span className="pos g">G</span></td>
                    <td><div className="school">Penn State</div></td>
                    <td className="notes-col"><div className="note">Steelers grabbed Ioane at #21 in this mock - Bears get the next best interior OL. Campbell notes Bears OL needs help protecting Caleb Williams. Explosive guard with nasty streak, fits scheme well.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="BUF" alt="Buffalo Bills" color="#00338d" logo="https://a.espncdn.com/i/teamlogos/nfl/500/buf.png" name="Buffalo Bills" pick="Pick #26" /></td>
                    <td><div className="player-name">Cashius Howell</div></td>
                    <td><span className="pos edge">EDGE</span></td>
                    <td><div className="school">West Virginia</div></td>
                    <td className="notes-col"><div className="note">Bills could draft a speed rusher to rotate with veteran ends. Howell: 11.5 sacks, 6 PBUs, 31 tackles in 2025. 6-2, 248 lbs. Fast off edge with pass-rush repertoire. Size makes him a tweener - but production earns early-round status.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="SF" alt="San Francisco 49ers" color="#aa0000" logo="https://a.espncdn.com/i/teamlogos/nfl/500/sf.png" name="San Francisco 49ers" pick="Pick #27" /></td>
                    <td><div className="player-name">K.C. Concepcion</div></td>
                    <td><span className="pos wr">WR</span></td>
                    <td><div className="school">NC State</div></td>
                    <td className="notes-col"><div className="note">Mike Evans aging, Ricky Pearsall injury-prone - 49ers need WR for Purdy. Concepcion: 61 catches, 919 yds, 9 TDs; 2 punt return TDs. 5-11, 190 lbs. Quick and shifty, dangerous with ball in hands. Similar to other SF receiver targets.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="HOU" alt="Houston Texans" color="#03202f" logo="https://a.espncdn.com/i/teamlogos/nfl/500/hou.png" name="Houston Texans" pick="Pick #28" /></td>
                    <td><div className="player-name">Spencer Fano</div></td>
                    <td><span className="pos ot">OT</span></td>
                    <td><div className="school">Utah</div></td>
                    <td className="notes-col"><div className="note">Texans need OL help. Fano: 6-6, 310 lbs. Fast, athletic, plays with mean streak. Force as run blocker. Versatile - started at both LT and RT in college. Campbell: lots of teams will fall in love with his tape.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="KC" alt="Kansas City Chiefs" color="#e31837" logo="https://a.espncdn.com/i/teamlogos/nfl/500/kc.png" name="Kansas City Chiefs" pick="Pick #29" tradeNote="via Rams" /></td>
                    <td><div className="player-name">Dillon Thieneman</div></td>
                    <td><span className="pos s">S</span></td>
                    <td><div className="school">Purdue</div></td>
                    <td className="notes-col"><div className="note">Chiefs use 2nd first-rounder on safety to replace aging depth. Thieneman: 8 career INTs, elite instincts in coverage. Kiper has long had him to Minnesota - Campbell has him sliding to KC. Veach also has 2nd pick from Rams deal here.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="MIA" alt="Miami Dolphins" color="#008e97" logo="https://a.espncdn.com/i/teamlogos/nfl/500/mia.png" name="Miami Dolphins" pick="Pick #30" tradeNote="via Broncos" /></td>
                    <td><div className="player-name">Avieon Terrell</div></td>
                    <td><span className="pos cb">CB</span></td>
                    <td><div className="school">Clemson</div></td>
                    <td className="notes-col"><div className="note">Dolphins use 2nd first-rounder (acquired from Denver) on CB depth. Terrell: brother of A.J. Terrell, instinctive press-man corner. Campbell: plays bigger than 5-11 frame. Dolphins secondary still needs reinforcement.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="NE" alt="New England Patriots" color="#002244" logo="https://a.espncdn.com/i/teamlogos/nfl/500/ne.png" name="New England Patriots" pick="Pick #31" /></td>
                    <td><div className="player-name">Max Iheanachor</div></td>
                    <td><span className="pos ot">OT</span></td>
                    <td><div className="school">Arizona State</div></td>
                    <td className="notes-col"><div className="note">Patriots add RT to pair with Will Campbell. Iheanachor: 6-6, 330 lbs. Power run blocker, nasty at point of attack. Drake Maye took 5+ sacks in every playoff game - OL upgrade is critical. Needs to improve pass-pro consistency.</div></td>
                  </tr>
                  <tr>
                    <td><TeamCell abbr="SEA" alt="Seattle Seahawks" color="#002244" logo="https://a.espncdn.com/i/teamlogos/nfl/500/sea.png" name="Seattle Seahawks" pick="Pick #32" /></td>
                    <td><div className="player-name">Colton Hood</div></td>
                    <td><span className="pos cb">CB</span></td>
                    <td><div className="school">Tennessee</div></td>
                    <td className="notes-col"><div className="note">Seahawks lost Riq Woolen in FA - CB is priority. Hood: 50 tackles, 1 INT, 8 PBUs in 2025. 6-0, 195 lbs. Stepped up as #1 corner when McCoy was out with ACL. Campbell: could trade down given only 4 draft picks, but stays put here.</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
