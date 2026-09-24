import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { nflPassingDisruptionSeries, researchStudies, researchStudyPath, type ResearchStatus, type ResearchStudy } from "@/data/researchStudies";
import "./research-studies.css";

const statusClass: Record<ResearchStatus, string> = {
  "Validated finding": "validated", "Useful context": "context", "Forward tracking": "tracking", "No clear relationship": "unclear", "Not supported": "unsupported",
};

function Status({ value }: { value: ResearchStatus }) {
  return <span className={`research-status ${statusClass[value]}`}>{value}</span>;
}

function StudyCard({ study }: { study: ResearchStudy }) {
  return <article className="research-card">
    <div className="research-card-top"><span>Phase {study.phase} · {study.sport}</span><Status value={study.status} /></div>
    <h3><Link to={researchStudyPath(study.slug)}>{study.title}</Link></h3>
    <p className="research-question">{study.question}</p>
    <p>{study.summary}</p>
    <div className="research-card-foot"><span>{study.seasons}<br /><strong>{study.sample}</strong></span><Link to={researchStudyPath(study.slug)} aria-label={`Read ${study.title}`}>Read study <ArrowRight size={16} /></Link></div>
  </article>;
}

function Progression({ activeSlug }: { activeSlug?: string }) {
  return <section className="research-section" aria-labelledby="research-progression-title">
    <div className="research-section-head"><h2 id="research-progression-title">How the research evolved</h2><p>Each phase tested the next question raised by the evidence.</p></div>
    <ol className="research-progression">
      {nflPassingDisruptionSeries.map((study) => <li key={study.slug} className={activeSlug === study.slug ? "active" : ""}>
        <Link to={researchStudyPath(study.slug)} aria-current={activeSlug === study.slug ? "page" : undefined}>
          <span>Phase {study.phase}</span><strong>{study.shortTitle}</strong><small>{study.summary}</small>
        </Link>
      </li>)}
    </ol>
  </section>;
}

function CurrentFinding() {
  return <section className="research-current" aria-labelledby="research-current-title">
    <div><span className="research-current-label">Current best-supported context metric</span><h2 id="research-current-title">Recent Team QB-Hit Exposure</h2><p>QB hits allowed per dropback over a team’s previous eight games. This describes the team’s recent passing environment: blocking, QB behavior, scheme, opponents and game script all contribute. It is not a pure offensive-line grade or a validated betting signal.</p></div>
    <div className="research-current-evidence"><strong>What survived validation</strong><p>In held-out 2024–2025 data, higher prior-eight exposure was associated with more future sacks and lower passing EPA. It remained associated after adjustment for the available QB excess-sack proxy.</p><Link to={researchStudyPath("protection-decomposition")}>See the decomposition <ArrowRight size={16} /></Link></div>
  </section>;
}

function QuintileChart() {
  const values = [5.02, 5.58, 6.11, 6.47, 7.71];
  return <figure className="research-chart"><figcaption><strong>Held-out future sack rate by protection quintile</strong><span>Phase 4 · 2024–2025 · 1,088 offense team-games · higher quintile means more recent QB-hit exposure</span></figcaption>
    <div className="research-bars" role="img" aria-label="Future sack rate rose across the five protection quintiles: 5.02, 5.58, 6.11, 6.47, and 7.71 percent.">
      {values.map((value, index) => <div className="research-bar-item" key={index}><strong>{value.toFixed(2)}%</strong><div className="research-bar-track"><span style={{ height: `${value / 8 * 100}%` }} /></div><span>Q{index + 1}</span></div>)}
    </div><p>Q1 = lowest hit exposure; Q5 = highest. These are observed group averages, not a causal estimate.</p>
  </figure>;
}

function ResearchIndex() {
  const [sport, setSport] = useState("All sports");
  const [category, setCategory] = useState("All topics");
  const [status, setStatus] = useState("All evidence");
  const sports = ["All sports", ...new Set(researchStudies.map((study) => study.sport))];
  const categories = ["All topics", ...new Set(researchStudies.flatMap((study) => study.categories))];
  const statuses = ["All evidence", ...new Set(researchStudies.map((study) => study.status))];
  const filtered = useMemo(() => researchStudies.filter((study) => (sport === "All sports" || study.sport === sport) && (category === "All topics" || study.categories.includes(category)) && (status === "All evidence" || study.status === status)), [sport, category, status]);
  usePageSeo({ title: "Research Studies | Joe Knows Ball", description: "Explore Joe Knows Ball research: questions, methods, held-out findings, negative results and decisions.", path: "/research-studies" });
  return <SiteShell><main className="research-page"><header className="research-hero"><div><h1>Research Studies</h1><p>Behind the numbers: which football ideas held up, which did not, and which measures are worth tracking.</p></div><div className="research-hero-note"><BookOpen size={22} aria-hidden="true" /><span>Every conclusion is tied to a completed research report. Negative results belong in the record, too.</span></div></header>
    <CurrentFinding /><Progression /><section className="research-section" aria-labelledby="all-studies-title"><div className="research-section-head"><h2 id="all-studies-title">All studies</h2><p>Browse by sport, topic, or strength of evidence.</p></div><div className="research-filters"><label>Sport<select value={sport} onChange={(event) => setSport(event.target.value)}>{sports.map((item) => <option key={item}>{item}</option>)}</select></label><label>Topic<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Evidence<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div><p className="research-count" aria-live="polite">Showing {filtered.length} of {researchStudies.length} studies</p><div className="research-grid">{filtered.map((study) => <StudyCard key={study.slug} study={study} />)}</div>{filtered.length === 0 && <p className="research-empty">No studies match these filters. Change a filter to see more.</p>}</section><QuintileChart /></main></SiteShell>;
}

function TextSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="research-detail-section"><h2>{title}</h2>{children}</section>;
}

function ResearchDetail({ study }: { study: ResearchStudy }) {
  const seriesStudies = researchStudies.filter((item) => item.series === study.series).sort((a, b) => a.phase - b.phase);
  const currentIndex = seriesStudies.findIndex((item) => item.slug === study.slug);
  const prev = seriesStudies[currentIndex - 1];
  const next = seriesStudies[currentIndex + 1];
  usePageSeo({ title: `${study.title} | Research Studies`, description: study.summary, path: researchStudyPath(study.slug) });
  return <SiteShell><main className="research-page research-detail"><Link className="research-back" to="/research-studies"><ArrowLeft size={16} /> All studies</Link><header className="research-detail-hero"><div className="research-detail-meta"><span>{study.sport} · Phase {study.phase} of {seriesStudies.length}</span><Status value={study.status} /></div><h1>{study.title}</h1><p>{study.summary}</p><div className="research-detail-facts"><span><strong>Seasons</strong>{study.seasons}</span><span><strong>Sample</strong>{study.sample}</span><span><strong>Series</strong>{study.series}</span></div></header>
    <div className="research-detail-layout"><article className="research-article"><TextSection title="Research question"><p>{study.question}</p></TextSection><TextSection title="Why we tested it"><p>{study.why}</p></TextSection><TextSection title="Data"><p>{study.data}</p></TextSection><TextSection title="Method"><p>{study.method}</p></TextSection><TextSection title="Key findings"><div className="research-stats">{study.stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span>{stat.note && <small>{stat.note}</small>}</div>)}</div>{study.phase === 4 && <QuintileChart />}</TextSection><div className="research-outcomes"><TextSection title="What held up"><ul>{study.heldUp.map((item) => <li key={item}>{item}</li>)}</ul></TextSection><TextSection title="What didn’t hold up"><ul>{study.didNot.map((item) => <li key={item}>{item}</li>)}</ul></TextSection></div><TextSection title="Interpretation"><p>{study.interpretation}</p></TextSection><TextSection title="JKB decision"><p>{study.decision}</p></TextSection><TextSection title="Limitations"><ul>{study.limitations.map((item) => <li key={item}>{item}</li>)}</ul></TextSection><p className="research-source">Source: JKB research audit · Phase {study.phase}. Figures reflect the completed study report and its retained results.</p></article><aside className="research-detail-aside"><strong>In this series</strong><ol>{seriesStudies.map((item) => <li key={item.slug}><Link aria-current={item.slug === study.slug ? "page" : undefined} to={researchStudyPath(item.slug)}><span>{item.phase}</span>{item.shortTitle}</Link></li>)}</ol></aside></div><section className="research-related" aria-label="Related studies">{prev && <Link to={researchStudyPath(prev.slug)}><ArrowLeft size={16} /> Previous: {prev.shortTitle}</Link>}{next && <Link to={researchStudyPath(next.slug)}>Next: {next.shortTitle} <ArrowRight size={16} /></Link>}</section><div className="research-series-link"><Link to="/research-studies">Explore the full research series <ChevronRight size={16} /></Link></div></main></SiteShell>;
}

export default function ResearchStudies() {
  const { studySlug } = useParams();
  const study = researchStudies.find((item) => item.slug === studySlug);
  if (!studySlug) return <ResearchIndex />;
  if (!study) return <SiteShell><main className="research-page research-missing"><h1>Study not found</h1><p>This study is not in the research collection.</p><Link to="/research-studies">Browse all studies</Link></main></SiteShell>;
  return <ResearchDetail study={study} />;
}
