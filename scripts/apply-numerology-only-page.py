from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def rep(path, old, new, label):
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Missing {label}")
    path.write_text(text.replace(old, new, 1))

p = ROOT / "src/pages/MlbNumerologyPage.tsx"
rep(p, 'type SortMode = "final" | "numerology" | "baseball" | "battingOrder";', 'type SortMode = "numerology" | "baseball" | "battingOrder";', "sort type")
rep(p, '  const [sort, setSort] = useState<SortMode>("final");', '  const [sort, setSort] = useState<SortMode>("numerology");', "default sort")
rep(p, '<option value="final">Final score</option><option value="numerology">Numerology</option><option value="baseball">Baseball</option><option value="battingOrder">Batting order</option>', '<option value="numerology">Numerology alignment</option><option value="baseball">Baseball context</option><option value="battingOrder">Batting order</option>', "sort options")
rep(p, '<div><span className="font-semibold text-white/60">Final Score Formula:</span> 60% Numerology Resonance + 40% Baseball Opportunity.</div>', '<div><span className="font-semibold text-white/60">Alignment ranking:</span> Numerology Resonance only. Baseball Opportunity is displayed as context and never affects selection, qualification, or rank.</div>', "methodology formula")
rep(p, '<div className="mb-1 flex justify-between"><span className="text-[9px] text-white/30">Baseball</span><span className="text-[9px] font-bold text-sky-300">{play.baseballScore}</span></div>', '<div className="mb-1 flex justify-between"><span className="text-[9px] text-white/30">Baseball context <span className="text-white/15">(not ranked)</span></span><span className="text-[9px] font-bold text-sky-300">{play.baseballScore}</span></div>', "baseball label")
rep(p, '<p className="mb-3 rounded-lg border border-white/6 bg-white/3 px-3 py-2 text-[10px] text-white/30">This experimental feature analyzes numerical patterns for research and entertainment. It does not guarantee player performance.</p>', '<p className="mb-3 rounded-lg border border-white/6 bg-white/3 px-3 py-2 text-[10px] text-white/30">This experimental feature analyzes numerical patterns for research and entertainment. Players are selected and ranked only by numerology; baseball ratings are separate context and never affect alignment.</p>', "disclosure")
rep(p, 'No player on today\'s slate has reached qualifying alignment.', 'No player on today\'s slate has reached the numerology-only qualifying threshold.', "threshold notice")
rep(p, 'Conflicting or opposing patterns. These are not predicted failures — they represent tension between numerical fields and baseball opportunity.', 'Conflicting or opposing numerical patterns. These are not predicted failures. Baseball context is displayed separately and does not affect classification.', "countercurrent copy")
rep(p, '<p className="text-center text-[9px] text-white/15">Strong numerical overlap can coexist with poor baseball opportunity. Unknown data is shown as unknown.</p>', '<p className="text-center text-[9px] text-white/15">Players are selected and ranked only by numerology. Baseball opportunity is context only and may support or conflict with a match without changing its alignment score.</p>', "footer copy")

print("Applied numerology-only page labels.")
