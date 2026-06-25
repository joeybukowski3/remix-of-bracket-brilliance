from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Could not locate {label} in {path}")
    path.write_text(text.replace(old, new, 1))


page = ROOT / "src/pages/MlbNumerologyPage.tsx"
replace_once(
    page,
    '''  const universalDayLabel = profile.universalDayMaster
    ? `${profile.universalDayMaster}/${profile.universalDayRoot}`
    : `${profile.universalDayCompound}/${profile.universalDayRoot}`;''',
    '''  const universalDayLabel = profile.universalDayMaster
    ? `${profile.universalDayMaster}/${profile.universalDayRoot}`
    : profile.universalDayRawSum > 9
      ? `${profile.universalDayRawSum}/${profile.universalDayRoot}`
      : String(profile.universalDayRoot);''',
    "Universal Day page label",
)

generator = ROOT / "scripts/generate-mlb-numerology.mjs"
replace_once(
    generator,
    '''      universalDay: { compound: dailyProfile.universalDay.compound, master: dailyProfile.universalDay.master, root: dailyProfile.universalDay.root, rawSum: dailyProfile.universalDay.rawSum },''',
    '''      universalDay: { compound: dailyProfile.universalDay.rawSum, master: dailyProfile.universalDay.master, root: dailyProfile.universalDay.root, rawSum: dailyProfile.universalDay.rawSum },''',
    "Grok Universal Day payload",
)
replace_once(
    generator,
    '''  const udLabel = dailyProfile.universalDay.master
    ? `${dailyProfile.universalDay.master}/${dailyProfile.universalDay.root}`
    : `${dailyProfile.universalDay.compound}/${dailyProfile.universalDay.root}`;''',
    '''  const udLabel = dailyProfile.universalDay.master
    ? `${dailyProfile.universalDay.master}/${dailyProfile.universalDay.root}`
    : dailyProfile.universalDay.rawSum > 9
      ? `${dailyProfile.universalDay.rawSum}/${dailyProfile.universalDay.root}`
      : String(dailyProfile.universalDay.root);''',
    "generator Universal Day label",
)
replace_once(
    generator,
    '''      universalDayCompound: dailyProfile.universalDay.compound,''',
    '''      universalDayCompound: dailyProfile.universalDay.rawSum,''',
    "published Universal Day compound",
)
replace_once(
    generator,
    '''  if (output.dailyProfile?.universalDayRawSum !== expectedRawSum) {
    errors.push(`universalDayRawSum ${output.dailyProfile?.universalDayRawSum} ≠ expected ${expectedRawSum}`);
  }

  // Master number preservation''',
    '''  if (output.dailyProfile?.universalDayRawSum !== expectedRawSum) {
    errors.push(`universalDayRawSum ${output.dailyProfile?.universalDayRawSum} ≠ expected ${expectedRawSum}`);
  }
  if (output.dailyProfile?.universalDayCompound !== expectedRawSum) {
    errors.push(`universalDayCompound ${output.dailyProfile?.universalDayCompound} ≠ full-date compound ${expectedRawSum}`);
  }

  // Master number preservation''',
    "compound validation",
)
replace_once(
    generator,
    '''    } else if (pd.original === ud.compound || (ud.compound > 9 && pd.compound === ud.compound)) {
      award("personalDay", `Personal Day ${pd.compound} — Exact Primary`, "primary_exact_root", W.personalDayExactMaster - 4, `Personal Day ${pd.compound} matches Universal Day.`, "pd:exact");''',
    '''    } else if (pd.original === ud.rawSum || pd.compound === ud.rawSum) {
      award("personalDay", `Personal Day ${pd.original}/${pd.root} — Exact Primary`, "primary_exact_root", W.personalDayExactMaster - 4, `Personal Day ${pd.original} matches Universal Day compound ${ud.rawSum}.`, "pd:exact");''',
    "Personal Day exact compound scoring",
)
replace_once(
    generator,
    '''    } else if (j.compound === ud.compound && ud.compound <= 9) {
      award("jersey", `Jersey ${j.original} — Exact Primary`, "primary_exact_root", W.jerseyExactMaster - 2, `Jersey ${j.original} matches Universal Day.`, "jersey:udexact");''',
    '''    } else if (j.original === ud.rawSum) {
      award("jersey", `Jersey ${j.original} — Exact Primary`, "primary_exact_root", W.jerseyExactMaster - 2, `Jersey ${j.original} matches Universal Day compound ${ud.rawSum}.`, "jersey:udexact");''',
    "jersey exact compound scoring",
)

scoring = ROOT / "src/lib/numerology/scoring.ts"
replace_once(
    scoring,
    '''function matchesPrimaryExact(n: ReducedNumber, profile: DailyProfile): boolean {
  const ud = profile.universalDay;
  return n.compound === ud.compound || (ud.master != null && n.compound === ud.master) || n.original === ud.compound;
}''',
    '''function matchesPrimaryExact(n: ReducedNumber, profile: DailyProfile): boolean {
  const ud = profile.universalDay;
  return n.original === ud.rawSum || n.compound === ud.rawSum || (ud.master != null && (n.compound === ud.master || n.original === ud.master));
}''',
    "TypeScript exact compound matcher",
)
replace_once(
    scoring,
    '''        `Personal Day ${pd.compound} matches Universal Day ${dailyProfile.universalDay.compound}.`,''',
    '''        `Personal Day ${pd.original} matches Universal Day compound ${dailyProfile.universalDay.rawSum}.`,''',
    "Personal Day description",
)
replace_once(
    scoring,
    '''        `Jersey ${jersey.original} matches Universal Day compound ${dailyProfile.universalDay.compound}.`,''',
    '''        `Jersey ${jersey.original} matches Universal Day compound ${dailyProfile.universalDay.rawSum}.`,''',
    "jersey description",
)

tests = ROOT / "src/lib/numerology/numerology.test.ts"
text = tests.read_text()
marker = '''// ── Signal classification ──────────────────────────────────────────────────────'''
addition = '''describe("June 25, 2026 — compound display regression", () => {
  const profile = buildDailyProfile("2026-06-25");

  it("preserves 23 as the full-date compound and reduces it to root 5", () => {
    expect(profile.universalDay.rawSum).toBe(23);
    expect(profile.universalDay.root).toBe(5);
    expect(profile.universalDay.master).toBeNull();
  });

  it("does not treat 5 as the compound number", () => {
    expect(profile.universalDay.rawSum).not.toBe(profile.universalDay.root);
  });
});

'''
if marker not in text:
    raise SystemExit("Could not locate numerology test insertion point")
tests.write_text(text.replace(marker, addition + marker, 1))

print("Applied Universal Day 23/5 display and exact-compound matching fix.")
