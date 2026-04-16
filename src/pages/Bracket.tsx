import { useEffect, useMemo, useState } from "react";
import { BarChart2, Copy, Info, RefreshCw, Save, Share2, SlidersHorizontal, Trash2 } from "lucide-react";
import RegionalRankingsTable from "@/components/bracket/RegionalRankingsTable";
import BracketMatchupModal from "@/components/bracket/BracketMatchupModal";
import SiteShell from "@/components/layout/SiteShell";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import StatSliders from "@/components/StatSliders";
import TeamLogo from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildCanonicalTeams, type ModelScoreOptions, type StatWeight } from "@/data/ncaaTeams";
import { useKenPom } from "@/hooks/useKenPom";
import { buildKenPomMap } from "@/lib/kenPom";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  BRACKET_REGION_NAMES,
  BRACKET_ROUNDS,
  BUILT_IN_PRESETS,
  buildBracketTree,
  buildPlaceholderBracketSource,
  calculateAdjustedTeamScore,
  createBracketSummaryText,
  createCustomPreset,
  createSavedBracket,
  duplicatePreset,
  duplicateSavedBracket,
  loadCustomPresets,
  loadOfficialBracketSource,
  loadSavedBrackets,
  rankTeamsInRegion,
  resolveBracketSource,
  saveCustomPresets,
  saveSavedBrackets,
  type BracketGame,
  type BracketPreset,
  type ResolvedBracketRegion,
  type SavedBracket,
} from "@/lib/bracket";
import { NCAA_BRACKET_PATH } from "@/lib/routes";

function SeedBadge({ seed }: { seed: number | null | undefined }) {
  return (
    <Badge variant="secondary" className="min-w-8 justify-center rounded-md border-white/10 px-2 py-1 text-[11px] font-bold">
      {seed ?? "-"}
    </Badge>
  );
}

function PresetNote() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center text-primary" aria-label="Preset note">
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Based on the rankings from last year&apos;s Elite 8 teams.</TooltipContent>
    </Tooltip>
  );
}

function GameCard({
  game,
  weights,
  modelOpts = {},
  onPick,
  onAnalyze,
}: {
  game: BracketGame;
  weights: StatWeight[];
  modelOpts?: ModelScoreOptions;
  onPick: (gameId: string, teamId: string) => void;
  onAnalyze: (game: BracketGame) => void;
}) {
  const bothKnown = !!(game.teamA && game.teamB);

  return (
    <Card className="overflow-hidden border-white/10 bg-card/95 shadow-[0_14px_30px_hsl(var(--background)/0.22)]">
      {bothKnown && (
        <div className="flex justify-end px-2 pt-1.5 pb-0">
          <button
            onClick={(e) => { e.stopPropagation(); onAnalyze(game); }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Quick game analysis"
            aria-label="Open matchup analysis"
          >
            <BarChart2 className="h-3 w-3" />
            <span>Analysis</span>
          </button>
        </div>
      )}
      <CardContent className="p-0">
        {[game.teamA, game.teamB].map((team, index) => (
          <button
            key={`${game.id}-${index}`}
            disabled={!team || !game.teamA || !game.teamB}
            onClick={() => team && onPick(game.id, team.canonicalId)}
            className={[
              "flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors disabled:opacity-50",
              index === 0 ? "border-b border-white/10" : "",
              game.winner?.canonicalId === team?.canonicalId
                ? "bg-primary/18 ring-1 ring-inset ring-primary/35"
                : "hover:bg-secondary/90",
            ].join(" ")}
          >
            <div className="flex min-w-0 items-center gap-3">
              <SeedBadge seed={team?.seed} />
              {team && <TeamLogo name={team.name} logo={team.logo} className="h-7 w-7" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{team?.name ?? "TBD"}</p>
                <p className="text-xs text-muted-foreground">{team ? `${team.abbreviation} - ${team.record || "Record unavailable"}` : "Waiting on prior result"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums text-foreground">{team ? calculateAdjustedTeamScore(team, weights, modelOpts).toFixed(1) : "--"}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Power</p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function RegionBuilderSection({
  region,
  regionGames,
  weights,
  modelOpts = {},
  onPick,
  onAnalyze,
}: {
  region: ResolvedBracketRegion;
  regionGames: BracketGame[];
  weights: StatWeight[];
  modelOpts?: ModelScoreOptions;
  onPick: (gameId: string, teamId: string) => void;
  onAnalyze: (game: BracketGame) => void;
}) {
  return (
    <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{region.name} Region</CardTitle>
            <CardDescription className="text-muted-foreground">All 16 teams, all four regional rounds, and live pick updates.</CardDescription>
          </div>
          <Badge variant="outline" className="border-white/10 bg-background/55 text-foreground">
            {region.teams.length} teams
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="grid min-w-[760px] gap-4 xl:min-w-0 xl:grid-cols-4">
          {[0, 1, 2, 3].map((roundIndex) => (
            <div key={`${region.name}-${roundIndex}`} className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-secondary/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{BRACKET_ROUNDS[roundIndex]}</p>
                <p className="text-sm font-semibold text-foreground">{region.name}</p>
              </div>
              {regionGames
                .filter((game) => game.roundIndex === roundIndex)
                .map((game) => (
                  <GameCard key={game.id} game={game} weights={weights} modelOpts={modelOpts} onPick={onPick} onAnalyze={onAnalyze} />
                ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ResumeRegressionSliders({
  homeInflationPenaltyWeight,
  q1BonusWeight,
  onHomeInflationChange,
  onQ1BonusChange,
}: {
  homeInflationPenaltyWeight: number;
  q1BonusWeight: number;
  onHomeInflationChange: (v: number) => void;
  onQ1BonusChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/75 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Resume &amp; Home Regression Adjustments</h3>
        <p className="text-xs text-muted-foreground">
          These layer on top of the core stat weights. Neutral-site efficiency blend (80% away / 20% home) is applied when active.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Home Inflation Penalty</label>
            <span className="text-sm font-bold text-primary tabular-nums">{homeInflationPenaltyWeight}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={homeInflationPenaltyWeight}
            onChange={(e) => onHomeInflationChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Penalizes teams whose ranking may be home-inflated. At 100, −1 pt per +1 inflation score.
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Q1 Win Rate Bonus</label>
            <span className="text-sm font-bold text-primary tabular-nums">{q1BonusWeight}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={q1BonusWeight}
            onChange={(e) => onQ1BonusChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Rewards teams with strong Q1 records (games vs top-50 opponents). At 100, a perfect Q1 record adds +2 pts.
          </p>
        </div>
      </div>
      {(homeInflationPenaltyWeight > 0 || q1BonusWeight > 0) && (
        <button
          onClick={() => { onHomeInflationChange(0); onQ1BonusChange(0); }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Reset adjustments
        </button>
      )}
    </div>
  );
}

export default function Bracket() {
  usePageSeo({
    title: "Official 2026 NCAA Bracket Builder & Tournament Analytics | Joe Knows Ball",
    description:
      "Build the official 2026 NCAA tournament bracket with advanced metrics, custom rankings, and path difficulty projections.",
    canonical: `https://www.joeknowsball.com${NCAA_BRACKET_PATH}`,
  });

  const { data: liveTeams = [] } = useLiveTeams();
  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);

  const { data: kenPomData } = useKenPom();
  const kenPomMap = useMemo(
    () => buildKenPomMap(kenPomData?.teams ?? [], teamPool, kenPomData?.source ?? null),
    [kenPomData, teamPool],
  );

  const [sourceConfig, setSourceConfig] = useState(buildPlaceholderBracketSource());
  const [customPresets, setCustomPresets] = useState<BracketPreset[]>([]);
  const [savedBrackets, setSavedBrackets] = useState<SavedBracket[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(BUILT_IN_PRESETS[0].id);
  const [weights, setWeights] = useState<StatWeight[]>(BUILT_IN_PRESETS[0].weights);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [selectedRegion, setSelectedRegion] = useState(BRACKET_REGION_NAMES[0]);
  const [activeBreakdownRegion, setActiveBreakdownRegion] = useState(BRACKET_REGION_NAMES[0]);
  const [showBuilderControls, setShowBuilderControls] = useState(false);
  const [showBreakdownControls, setShowBreakdownControls] = useState(false);
  const [homeInflationPenaltyWeight, setHomeInflationPenaltyWeight] = useState(0);
  const [q1BonusWeight, setQ1BonusWeight] = useState(0);
  const [analyzeGame, setAnalyzeGame] = useState<BracketGame | null>(null);
  const [presetSheetOpen, setPresetSheetOpen] = useState(false);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [saveBracketOpen, setSaveBracketOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [renamePresetId, setRenamePresetId] = useState<string | null>(null);
  const [renameBracketId, setRenameBracketId] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [newBracketName, setNewBracketName] = useState("");
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    setCustomPresets(loadCustomPresets());
    setSavedBrackets(loadSavedBrackets());
  }, []);

  useEffect(() => {
    saveCustomPresets(customPresets);
  }, [customPresets]);

  useEffect(() => {
    saveSavedBrackets(savedBrackets);
  }, [savedBrackets]);

  useEffect(() => {
    let ignore = false;
    loadOfficialBracketSource().then((officialSource) => {
      if (!ignore && officialSource) setSourceConfig(officialSource);
    });
    return () => {
      ignore = true;
    };
  }, []);

  const presets = useMemo(() => [...BUILT_IN_PRESETS, ...customPresets], [customPresets]);
  const activePreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const regions = useMemo(() => resolveBracketSource(sourceConfig, teamPool), [sourceConfig, teamPool]);
  const bracketTree = useMemo(() => buildBracketTree(regions, picks), [regions, picks]);
  const summaryText = useMemo(
    () => createBracketSummaryText(regions, bracketTree, weights, activePreset?.name ?? "Custom mix"),
    [regions, bracketTree, weights, activePreset],
  );
  const currentRegion = regions.find((region) => region.name === selectedRegion) ?? regions[0];
  const officialBracketLive = sourceConfig.mode === "live" && sourceConfig.season === "2026";
  const bracketTitle = "Official 2026 NCAA Bracket Builder";
  const bracketIntro = officialBracketLive
    ? "The official 2026 NCAA tournament bracket is live. Build picks, compare regions, and adjust the model in real time."
    : "Build the current working NCAA tournament bracket, tune the model live, and scan every region through compact rankings tables.";
  const bracketSubcopy = officialBracketLive
    ? "This page is now using the validated official bracket payload from the live sync pipeline."
    : "The builder is reading through the central bracket source. It will automatically switch to the validated official bracket as soon as the sync pipeline completes.";

  useEffect(() => {
    if (activePreset) {
      setWeights(activePreset.weights.map((weight) => ({ ...weight })));
    }
  }, [selectedPresetId]);

  useEffect(() => {
    if (!regions.length) return;
    if (!regions.some((region) => region.name === selectedRegion)) {
      setSelectedRegion(regions[0].name);
    }
  }, [regions, selectedRegion]);

  const handleWeightChange = (key: string, value: number) => {
    setSelectedPresetId(null);
    setWeights((prev) => prev.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const preset = createCustomPreset(newPresetName.trim(), weights);
    setCustomPresets((prev) => [preset, ...prev]);
    setSelectedPresetId(preset.id);
    setNewPresetName("");
    setSavePresetOpen(false);
  };

  const handleSaveBracket = () => {
    if (!newBracketName.trim()) return;
    const saved = createSavedBracket(newBracketName.trim(), selectedPresetId, weights, picks);
    setSavedBrackets((prev) => [saved, ...prev]);
    setNewBracketName("");
    setSaveBracketOpen(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Joe Knows Ball Bracket", text: summaryText });
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(summaryText);
    }
  };

  const modelOpts = useMemo<ModelScoreOptions>(
    () => ({ homeInflationPenaltyWeight, q1BonusWeight }),
    [homeInflationPenaltyWeight, q1BonusWeight],
  );

  const topRegionalTeams = useMemo(
    () =>
      regions.map((region) => {
        const top = rankTeamsInRegion(region, weights, modelOpts)[0];
        return { region: region.name, team: top?.team ?? null, score: top?.score ?? null };
      }),
    [regions, weights, modelOpts],
  );

  return (
    <SiteShell>
      <div className="site-container site-stack py-6 pb-28">
        <section className="surface-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="page-title text-foreground">{bracketTitle}</h1>
              <p className="mt-3 text-base text-foreground/90">{bracketIntro}</p>
              <p className="mt-2 text-sm text-muted-foreground">{bracketSubcopy}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={sourceConfig.mode === "live" ? "default" : "secondary"}>
                {officialBracketLive ? "Official 2026 bracket live" : "2026 bracket source loading"}
              </Badge>
              <Badge variant="outline" className="max-w-xs bg-background/55 text-foreground">
                {sourceConfig.sourceLabel}
              </Badge>
            </div>
          </div>
        </section>

        <Tabs defaultValue="builder" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 rounded-xl bg-secondary/85 p-1">
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="breakdown">Bracket Breakdown</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>
          <TabsContent value="builder" className="space-y-5">
            <section className="grid gap-4 md:grid-cols-2">
              <div className="surface-card-muted">
                <h2 className="text-lg font-semibold text-foreground">March Madness Bracket Breakdown</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Use tournament analytics, team power ratings, and region-level projections to compare how the bracket
                  is shaping up before you finalize picks.
                </p>
              </div>
              <div className="surface-card-muted">
                <h2 className="text-lg font-semibold text-foreground">Tournament Path Difficulty Analysis</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Every region ranking includes path difficulty context so you can spot favorable routes, brutal draws,
                  and model-driven upset pressure quickly.
                </p>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
              <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Model Presets</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Adjust the same ranking engine that powers region tables, path difficulty, and bracket power order.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant={selectedPresetId === BUILT_IN_PRESETS[0].id ? "default" : "secondary"} onClick={() => setSelectedPresetId(BUILT_IN_PRESETS[0].id)}>
                      Default Model
                    </Button>
                    <Button variant={selectedPresetId === "preset-2025-elite" ? "default" : "secondary"} onClick={() => setSelectedPresetId("preset-2025-elite")}>
                      2025 Elite 8 Preset*
                    </Button>
                    <PresetNote />
                    <Button variant="outline" onClick={() => setPresetSheetOpen(true)}>Manage Presets</Button>
                    <Button variant="ghost" onClick={() => setSavePresetOpen(true)}>Save Current as Preset</Button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1fr,auto]">
                    <div className="rounded-xl border border-white/10 bg-secondary/75 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Active preset</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{activePreset?.name ?? "Current custom mix"}</p>
                      <p className="text-sm text-muted-foreground">{activePreset?.note ?? "Current slider settings are acting as a temporary unsaved custom preset."}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      <Button variant="outline" onClick={() => setShowBuilderControls((prev) => !prev)}>
                        <SlidersHorizontal className="h-4 w-4" />
                        {showBuilderControls ? "Hide Weights" : "Adjust Weights"}
                      </Button>
                      <Button variant="outline" onClick={() => setPicks({})}>
                        <RefreshCw className="h-4 w-4" />
                        Reset Picks
                      </Button>
                    </div>
                  </div>

                  {showBuilderControls && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/10 bg-background/75 p-3">
                        <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
                      </div>
                      <ResumeRegressionSliders
                        homeInflationPenaltyWeight={homeInflationPenaltyWeight}
                        q1BonusWeight={q1BonusWeight}
                        onHomeInflationChange={setHomeInflationPenaltyWeight}
                        onQ1BonusChange={setQ1BonusWeight}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">Regional Leaders</CardTitle>
                  <CardDescription className="text-muted-foreground">Quick scan of the current No. 1 model team in each region before you lock in picks.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {topRegionalTeams.map((entry) => (
                    <div key={entry.region} className="rounded-xl border border-white/10 bg-background/72 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{entry.region}</p>
                      <div className="mt-2 flex items-center gap-2">
                        {entry.team && <TeamLogo name={entry.team.name} logo={entry.team.logo} className="h-7 w-7" />}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{entry.team?.name ?? "TBD"}</p>
                          <p className="text-xs text-muted-foreground">{entry.team ? `${entry.team.seed ?? "-"} seed - ${entry.team.record || "Record unavailable"}` : "No team resolved"}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-semibold tabular-nums text-primary">{entry.score?.toFixed(1) ?? "--"} power</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-primary">Champion snapshot</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{bracketTree.champion?.name ?? "Choose your champion"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <section className="space-y-4">
              <div className="sticky top-[68px] z-10 rounded-2xl border border-white/10 bg-background/92 px-3 py-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Bracket Builder</h2>
                    <p className="text-sm text-muted-foreground">
                      {officialBracketLive ? "All four official 2026 regions are active now." : "All four current bracket regions are active now."}
                    </p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {BRACKET_REGION_NAMES.map((regionName) => (
                      <Button
                        key={regionName}
                        type="button"
                        variant={selectedRegion === regionName ? "default" : "secondary"}
                        className="shrink-0"
                        onClick={() => setSelectedRegion(regionName)}
                      >
                        {regionName}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {sourceConfig.firstFour?.length ? (
                <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">First Four</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Play-in winners feed directly into the official 2026 Round of 64 bracket below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {sourceConfig.firstFour.map((game) => (
                      <div key={game.id} className="rounded-xl border border-white/10 bg-background/72 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{game.region} Region</p>
                            <p className="text-sm font-semibold text-foreground">No. {game.seed} play-in</p>
                          </div>
                          <Badge variant="outline" className="border-white/10 bg-secondary/70">
                            {game.label}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          {game.teams.map((team) => (
                            <div key={`${game.id}-${team.teamName}`} className="flex items-center gap-3 rounded-lg border border-white/10 bg-card/90 px-3 py-2">
                              <SeedBadge seed={team.seed} />
                              <TeamLogo name={team.teamName} logo={team.logo} className="h-7 w-7" />
                              <p className="truncate text-sm font-semibold text-foreground">{team.teamName}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              {currentRegion && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
                  <div className="xl:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Viewing {currentRegion.name} Region
                    </p>
                  </div>
                  <RegionBuilderSection
                    key={currentRegion.name}
                    region={currentRegion}
                    regionGames={bracketTree.regionGames[currentRegion.name] ?? []}
                    weights={weights}
                    modelOpts={modelOpts}
                    onPick={(gameId, teamId) => setPicks((prev) => ({ ...prev, [gameId]: teamId }))}
                    onAnalyze={(game) => setAnalyzeGame(game)}
                  />

                  <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Tournament Snapshot</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        Live leaders and advancing picks from the official 2026 field.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {regions.map((region) => {
                        const regionChampion = (bracketTree.regionGames[region.name] ?? []).find((game) => game.roundIndex === 3)?.winner;
                        const regionalLeader = rankTeamsInRegion(region, weights)[0]?.team ?? null;
                        return (
                          <div key={region.name} className="rounded-xl border border-white/10 bg-background/72 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{region.name}</p>
                            <div className="mt-2 flex items-center gap-2">
                              {regionalLeader && <TeamLogo name={regionalLeader.name} logo={regionalLeader.logo} className="h-6 w-6" />}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{regionalLeader?.name ?? "TBD"}</p>
                                <p className="text-xs text-muted-foreground">Model leader</p>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              {regionChampion && <TeamLogo name={regionChampion.name} logo={regionChampion.logo} className="h-6 w-6" />}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{regionChampion?.name ?? "No pick yet"}</p>
                                <p className="text-xs text-muted-foreground">Your regional winner</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
                        <p className="text-xs uppercase tracking-wide text-primary">Champion</p>
                        <p className="mt-1 text-xl font-bold text-foreground">{bracketTree.champion?.name ?? "Choose your champion"}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Final Four & Championship */}
              <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Final Four &amp; Championship</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Pick your Final Four winners and national champion. Teams appear once your regional picks advance.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Semifinal 1 · East vs West
                      </p>
                      <GameCard
                        game={bracketTree.finalFourGames[0]}
                        weights={weights}
                        modelOpts={modelOpts}
                        onPick={(gameId, teamId) => setPicks((prev) => ({ ...prev, [gameId]: teamId }))}
                        onAnalyze={(game) => setAnalyzeGame(game)}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Semifinal 2 · South vs Midwest
                      </p>
                      <GameCard
                        game={bracketTree.finalFourGames[1]}
                        weights={weights}
                        modelOpts={modelOpts}
                        onPick={(gameId, teamId) => setPicks((prev) => ({ ...prev, [gameId]: teamId }))}
                        onAnalyze={(game) => setAnalyzeGame(game)}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Championship
                      </p>
                      <GameCard
                        game={bracketTree.championshipGame}
                        weights={weights}
                        modelOpts={modelOpts}
                        onPick={(gameId, teamId) => setPicks((prev) => ({ ...prev, [gameId]: teamId }))}
                        onAnalyze={(game) => setAnalyzeGame(game)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-4">
            <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl">Bracket Breakdown</CardTitle>
                    <CardDescription className="mt-1 text-muted-foreground">
                      Compact regional rankings tables with live reordering, full stat columns, and expandable opponent-path detail.
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => setShowBreakdownControls((prev) => !prev)}>
                    <SlidersHorizontal className="h-4 w-4" />
                    {showBreakdownControls ? "Hide Weight Controls" : "Tune Weight Controls"}
                  </Button>
                </div>
              </CardHeader>
              {showBreakdownControls && (
                <CardContent className="pt-0 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-background/75 p-3">
                    <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
                  </div>
                  <ResumeRegressionSliders
                    homeInflationPenaltyWeight={homeInflationPenaltyWeight}
                    q1BonusWeight={q1BonusWeight}
                    onHomeInflationChange={setHomeInflationPenaltyWeight}
                    onQ1BonusChange={setQ1BonusWeight}
                  />
                </CardContent>
              )}
            </Card>

            <div className="space-y-3">
              {/* Region tab bar */}
              <div className="flex overflow-x-auto gap-1 rounded-2xl border border-white/10 bg-card/90 p-1.5">
                {regions.map((region) => (
                  <button
                    key={region.name}
                    onClick={() => setActiveBreakdownRegion(region.name)}
                    className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                      activeBreakdownRegion === region.name
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                    }`}
                  >
                    {region.name}
                  </button>
                ))}
              </div>
              {/* Single region table — full width */}
              {(() => {
                const activeRegionData = regions.find((r) => r.name === activeBreakdownRegion) ?? regions[0];
                return activeRegionData ? (
                  <RegionalRankingsTable
                    key={activeRegionData.name}
                    region={activeRegionData}
                    weights={weights}
                    teamPool={teamPool}
                    modelOpts={modelOpts}
                    kenPomMap={kenPomMap}
                  />
                ) : null;
              })()}
            </div>
          </TabsContent>
          <TabsContent value="saved" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Saved Brackets</h2>
              <p className="mt-1 text-muted-foreground">Save multiple brackets locally, restore them later, or duplicate a version before lock time.</p>
            </div>

            {savedBrackets.length === 0 ? (
              <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                <CardContent className="p-6 text-sm text-muted-foreground">No saved brackets yet. Save one from the builder to keep your progress.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {savedBrackets.map((savedBracket) => (
                  <Card key={savedBracket.id} className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-foreground">{savedBracket.name}</p>
                          <p className="text-sm text-muted-foreground">Updated {new Date(savedBracket.updatedAt).toLocaleString()}</p>
                        </div>
                        <Badge variant="outline" className="border-white/10">
                          {savedBracket.presetId ? (presets.find((preset) => preset.id === savedBracket.presetId)?.name ?? "Saved preset") : "Custom mix"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setPicks(savedBracket.picks);
                            setWeights(savedBracket.weights.map((weight) => ({ ...weight })));
                            setSelectedPresetId(savedBracket.presetId);
                          }}
                        >
                          Load
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setSavedBrackets((prev) => [duplicateSavedBracket(savedBracket), ...prev])}>
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRenameBracketId(savedBracket.id);
                            setRenameValue(savedBracket.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSavedBrackets((prev) => prev.filter((entry) => entry.id !== savedBracket.id))}>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        <SeoFooterBlock />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{activePreset?.name ?? "Current custom mix"}</p>
            <p className="truncate text-xs text-muted-foreground">{bracketTree.champion?.name ?? "No champion selected yet"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSaveBracketOpen(true)}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={presetSheetOpen} onOpenChange={setPresetSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl border-white/10 bg-card">
          <SheetHeader>
            <SheetTitle>Preset Manager</SheetTitle>
            <SheetDescription>Select, duplicate, rename, or remove presets without leaving the bracket flow.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {presets.map((preset) => (
              <Card key={preset.id} className="border-white/10 bg-background/72">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{preset.name}</p>
                        {preset.id === "preset-2025-elite" && (
                          <>
                            <span className="text-primary">*</span>
                            <PresetNote />
                          </>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{preset.note}</p>
                    </div>
                    <Badge variant={preset.source === "built-in" ? "outline" : "secondary"} className="border-white/10">
                      {preset.source}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        setPresetSheetOpen(false);
                      }}
                    >
                      Use
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setCustomPresets((prev) => [duplicatePreset(preset), ...prev])}>
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </Button>
                    {preset.source === "custom" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRenamePresetId(preset.id);
                            setRenameValue(preset.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCustomPresets((prev) => prev.filter((entry) => entry.id !== preset.id))}>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent className="border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>Save Custom Preset</DialogTitle>
            <DialogDescription>Save the current rating model so it can be reused for future bracket assumptions.</DialogDescription>
          </DialogHeader>
          <Input value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} placeholder="My 12-5 upset preset" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavePresetOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePreset}>Save Preset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveBracketOpen} onOpenChange={setSaveBracketOpen}>
        <DialogContent className="border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>Save Bracket</DialogTitle>
            <DialogDescription>Store this bracket locally so you can revisit, duplicate, or screenshot it later.</DialogDescription>
          </DialogHeader>
          <Input value={newBracketName} onChange={(event) => setNewBracketName(event.target.value)} placeholder="Entry 1" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveBracketOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBracket}>Save Bracket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renamePresetId || renameBracketId)}
        onOpenChange={() => {
          setRenamePresetId(null);
          setRenameBracketId(null);
          setRenameValue("");
        }}
      >
        <DialogContent className="border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Update the name without changing the bracket or preset logic.</DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenamePresetId(null);
                setRenameBracketId(null);
                setRenameValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renamePresetId) {
                  setCustomPresets((prev) => prev.map((preset) => (preset.id === renamePresetId ? { ...preset, name: renameValue.trim() || preset.name } : preset)));
                }
                if (renameBracketId) {
                  setSavedBrackets((prev) =>
                    prev.map((saved) => (saved.id === renameBracketId ? { ...saved, name: renameValue.trim() || saved.name, updatedAt: new Date().toISOString() } : saved)),
                  );
                }
                setRenamePresetId(null);
                setRenameBracketId(null);
                setRenameValue("");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>Bracket Share Summary</DialogTitle>
            <DialogDescription>Screenshot this card on mobile or copy/share the text summary.</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-white/10 bg-secondary/50 p-4">
            <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">Joe Knows Ball</p>
            <p className="mt-1 text-center text-xl font-bold text-foreground">{bracketTree.champion?.name ?? "Champion pending"}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {regions.map((region) => {
                const regionChampion = (bracketTree.regionGames[region.name] ?? []).find((game) => game.roundIndex === 3)?.winner;
                return (
                  <div key={region.name} className="rounded-xl border border-white/10 bg-background/72 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{region.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {regionChampion && <TeamLogo name={regionChampion.name} logo={regionChampion.logo} className="h-5 w-5" />}
                      <p className="font-semibold text-foreground">{regionChampion?.abbreviation ?? "TBD"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/72 p-3">
            <pre className="whitespace-pre-wrap text-xs text-foreground">{summaryText}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigator.clipboard?.writeText(summaryText)}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button onClick={handleShare}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BracketMatchupModal
        game={analyzeGame}
        weights={weights}
        teamPool={teamPool}
        onClose={() => setAnalyzeGame(null)}
        onPick={(gameId, teamId) => {
          setPicks((prev) => ({ ...prev, [gameId]: teamId }));
          setAnalyzeGame(null);
        }}
      />
    </SiteShell>
  );
}
