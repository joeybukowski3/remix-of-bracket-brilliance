import { useEffect, useMemo, useState } from "react";
import { Copy, Info, RefreshCw, Save, Share2, Trash2 } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import TeamLogo from "@/components/TeamLogo";
import StatSliders from "@/components/StatSliders";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageSeo } from "@/hooks/usePageSeo";
import { buildCanonicalTeams, type StatWeight } from "@/data/ncaaTeams";
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

function SeedBadge({ seed }: { seed: number | null | undefined }) {
  return <Badge variant="secondary" className="rounded-md border-white/10 px-2 py-1 text-[11px] font-bold">{seed ?? "-"}</Badge>;
}

function PresetNote() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center text-primary">
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Based on the rankings from last year&apos;s Elite 8 teams.</TooltipContent>
    </Tooltip>
  );
}

function GameCard({ game, weights, onPick }: { game: BracketGame; weights: StatWeight[]; onPick: (gameId: string, teamId: string) => void }) {
  return (
    <Card className="overflow-hidden border-white/10 bg-card/95 shadow-[0_14px_30px_hsl(var(--background)/0.22)]">
      <CardContent className="p-0">
        {[game.teamA, game.teamB].map((team, index) => (
          <button
            key={`${game.id}-${index}`}
            disabled={!team || !game.teamA || !game.teamB}
            onClick={() => team && onPick(game.id, team.canonicalId)}
            className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors ${
              index === 0 ? "border-b border-border/70" : ""
            } ${game.winner?.canonicalId === team?.canonicalId ? "bg-primary/18 ring-1 ring-inset ring-primary/35" : "hover:bg-secondary/90"} disabled:opacity-50`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <SeedBadge seed={team?.seed} />
              {team && <TeamLogo name={team.name} logo={team.logo} className="h-7 w-7" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{team?.name ?? "TBD"}</p>
                <p className="text-xs text-muted-foreground">{team ? `${team.abbreviation} · ${team.record || "Record unavailable"}` : "Waiting on prior result"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums text-foreground">{team ? calculateAdjustedTeamScore(team, weights).toFixed(1) : "--"}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Power</p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function CompactRegionCard({ region, weights, mobile = false }: { region: ResolvedBracketRegion; weights: StatWeight[]; mobile?: boolean }) {
  const rankedTeams = rankTeamsInRegion(region, weights);

  const rows = (
    <div className={`space-y-1 ${mobile ? "" : "max-h-[360px] overflow-y-auto pr-1"}`}>
      {rankedTeams.map(({ team, score, path }, index) => (
        <div
          key={team.canonicalId}
          className="grid grid-cols-[auto,auto,1fr,auto,auto] items-center gap-2 rounded-lg border border-white/10 bg-background/72 px-2.5 py-2"
          title={path.likelyOpponents.map((opponent) => `${opponent.round}: ${opponent.team?.name ?? "TBD"}`).join(" | ")}
        >
          <span className="w-5 text-center text-[11px] font-bold text-primary">#{index + 1}</span>
          <SeedBadge seed={team.seed} />
          <div className="flex min-w-0 items-center gap-2">
            <TeamLogo name={team.name} logo={team.logo} className="h-6 w-6" />
            <span className="truncate text-sm font-semibold text-foreground">{team.name}</span>
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-foreground">{score.toFixed(1)}</span>
          <Badge
            variant={path.tier === "Brutal" ? "destructive" : path.tier === "Hard" ? "default" : "secondary"}
            className="rounded-md px-2 py-1 text-[10px]"
          >
            {path.tier}
          </Badge>
        </div>
      ))}
    </div>
  );

  if (mobile) {
    return (
      <AccordionItem value={region.name} className="rounded-2xl border border-white/10 bg-card/95 px-4 shadow-[0_10px_26px_hsl(var(--background)/0.18)]">
        <AccordionTrigger className="py-3 no-underline hover:no-underline">
          <div className="flex min-w-0 items-center justify-between gap-3 pr-3 text-left">
            <div>
              <p className="text-sm font-semibold text-foreground">{region.name} Region</p>
              <p className="text-xs text-muted-foreground">Compact rankings and path difficulty</p>
            </div>
            <Badge variant="outline" className="rounded-md border-white/10">16 teams</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-1">{rows}</AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <Card className="border-white/10 bg-card/95 shadow-[0_14px_30px_hsl(var(--background)/0.22)]">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-lg">{region.name} Region</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">Compact power view with seeds, logos, and path indicator.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">{rows}</CardContent>
    </Card>
  );
}

export default function Bracket() {
  usePageSeo({
    title: "2025 NCAA Bracket Builder | Joe Knows Ball",
    description: "Build a polished March Madness bracket using the current live working field, save entries locally, compare presets, and scan compact region breakdowns.",
    canonical: "https://joeknowsball.com/bracket",
  });

  const isMobile = useIsMobile();
  const { data: liveTeams = [] } = useLiveTeams();
  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);

  const [sourceConfig, setSourceConfig] = useState(buildPlaceholderBracketSource());
  const [customPresets, setCustomPresets] = useState<BracketPreset[]>([]);
  const [savedBrackets, setSavedBrackets] = useState<SavedBracket[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(BUILT_IN_PRESETS[0].id);
  const [weights, setWeights] = useState<StatWeight[]>(BUILT_IN_PRESETS[0].weights);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [selectedRegion, setSelectedRegion] = useState(BRACKET_REGION_NAMES[0]);
  const [showSliders, setShowSliders] = useState(false);
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

  useEffect(() => {
    if (activePreset) setWeights(activePreset.weights.map((weight) => ({ ...weight })));
  }, [selectedPresetId]);

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
    if (navigator.clipboard) await navigator.clipboard.writeText(summaryText);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto space-y-6 px-4 py-6 pb-28">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold text-foreground">March Madness Bracket Builder</h1>
            <p className="mt-1 text-muted-foreground">Current Bracket Builder using last year&apos;s field until the official bracket release. Make picks, save entries, and compare regional strength right now.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This is the live working bracket experience for today. When the official field is available, the centralized bracket source can swap the teams and regions without a UI rewrite.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sourceConfig.mode === "live" ? "default" : "secondary"} className="border-white/10">
              {sourceConfig.mode === "live" ? "Official bracket loaded" : "Live working field"}
            </Badge>
            <Badge variant="outline" className="max-w-xs border-white/10 text-foreground">
              {sourceConfig.sourceLabel}
            </Badge>
          </div>
        </div>
        <Tabs defaultValue="builder" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 rounded-xl bg-secondary/80 p-1">
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="breakdown">Bracket Breakdown</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>

          <TabsContent value="builder" className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[1.45fr,1fr]">
              <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Preset Controls</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Update rankings, region order, and path difficulty with a tighter preset workflow designed for quick mobile edits.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant={selectedPresetId === BUILT_IN_PRESETS[0].id ? "default" : "secondary"} onClick={() => setSelectedPresetId(BUILT_IN_PRESETS[0].id)}>
                      Default Model
                    </Button>
                    <Button variant={selectedPresetId === "preset-2025-elite" ? "default" : "secondary"} onClick={() => setSelectedPresetId("preset-2025-elite")}>
                      2025 Elite Preset*
                    </Button>
                    <PresetNote />
                    <Button variant="outline" onClick={() => setPresetSheetOpen(true)}>Manage Presets</Button>
                    <Button variant="ghost" onClick={() => setSavePresetOpen(true)}>Save Current as Preset</Button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-secondary/75 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Active preset</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{activePreset?.name ?? "Current custom mix"}</p>
                    <p className="text-sm text-muted-foreground">{activePreset?.note ?? "Current slider settings are acting as a temporary unsaved custom preset."}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setShowSliders((prev) => !prev)}>{showSliders ? "Hide Weights" : "Adjust Weights"}</Button>
                    <Button variant="outline" onClick={() => setPicks({})}>
                      <RefreshCw className="h-4 w-4" />
                      Reset Picks
                    </Button>
                  </div>

                  {showSliders && (
                    <div className="rounded-xl border border-white/10 bg-background/70 p-3">
                      <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">Final Four Snapshot</CardTitle>
                  <CardDescription className="text-muted-foreground">High-contrast summary for quick checks and cleaner screenshots.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {bracketTree.finalFourGames.map((game) => (
                    <div key={game.id} className="rounded-xl border border-white/10 bg-background/72 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{game.label}</p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                        <span className="inline-flex min-w-0 items-center gap-2 truncate">
                          {game.teamA && <TeamLogo name={game.teamA.name} logo={game.teamA.logo} className="h-5 w-5" />}
                          <span className="truncate">{game.teamA?.abbreviation ?? "TBD"}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">vs</span>
                        <span className="inline-flex min-w-0 items-center gap-2 truncate">
                          {game.teamB && <TeamLogo name={game.teamB.name} logo={game.teamB.logo} className="h-5 w-5" />}
                          <span className="truncate">{game.teamB?.abbreviation ?? "TBD"}</span>
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-primary">{game.winner?.name ?? "Winner not picked yet"}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-primary/20 bg-primary/12 p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-primary">Champion</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{bracketTree.champion?.name ?? "Choose your champion"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-white/10 bg-card/95 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">Bracket Builder</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Tap a team to advance it. This same layout will stay in place when the official field replaces the current working bracket source.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="sticky top-[68px] z-10 -mx-1 overflow-x-auto rounded-xl bg-background/90 px-1 py-2 backdrop-blur">
                  <div className="flex gap-2">
                    {BRACKET_REGION_NAMES.map((regionName) => (
                      <Button
                        key={regionName}
                        variant={selectedRegion === regionName ? "default" : "secondary"}
                        className="shrink-0"
                        onClick={() => setSelectedRegion(regionName)}
                      >
                        {regionName}
                      </Button>
                    ))}
                  </div>
                </div>

                {currentRegion && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((roundIndex) => (
                      <div key={`${currentRegion.name}-${roundIndex}`} className="space-y-3">
                        <div className="rounded-xl border border-white/10 bg-secondary/75 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{BRACKET_ROUNDS[roundIndex]}</p>
                          <p className="text-sm font-semibold text-foreground">{currentRegion.name} region</p>
                        </div>
                        {(bracketTree.regionGames[currentRegion.name] ?? [])
                          .filter((game) => game.roundIndex === roundIndex)
                          .map((game) => (
                            <GameCard key={game.id} game={game} weights={weights} onPick={(gameId, teamId) => setPicks((prev) => ({ ...prev, [gameId]: teamId }))} />
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-card/95 p-4 shadow-[0_16px_36px_hsl(var(--background)/0.22)]">
              <h2 className="text-2xl font-bold text-foreground">Bracket Breakdown</h2>
              <p className="mt-1 text-muted-foreground">
                A compact region overview that keeps the whole tournament landscape easier to scan. Logos, seeds, model rank, and path difficulty stay visible on every row.
              </p>
            </div>

            {isMobile ? (
              <Accordion type="single" collapsible defaultValue={regions[0]?.name} className="space-y-3">
                {regions.map((region) => (
                  <CompactRegionCard key={region.name} region={region} weights={weights} mobile />
                ))}
              </Accordion>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {regions.map((region) => (
                  <CompactRegionCard key={region.name} region={region} weights={weights} />
                ))}
              </div>
            )}
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
                        <Badge variant="outline" className="border-white/10">{savedBracket.presetId ? (presets.find((preset) => preset.id === savedBracket.presetId)?.name ?? "Saved preset") : "Custom mix"}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => {
                          setPicks(savedBracket.picks);
                          setWeights(savedBracket.weights.map((weight) => ({ ...weight })));
                          setSelectedPresetId(savedBracket.presetId);
                        }}>
                          Load
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setSavedBrackets((prev) => [duplicateSavedBracket(savedBracket), ...prev])}>
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => {
                          setRenameBracketId(savedBracket.id);
                          setRenameValue(savedBracket.name);
                        }}>
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
                    <Badge variant={preset.source === "built-in" ? "outline" : "secondary"} className="border-white/10">{preset.source}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => {
                      setSelectedPresetId(preset.id);
                      setPresetSheetOpen(false);
                    }}>
                      Use
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setCustomPresets((prev) => [duplicatePreset(preset), ...prev])}>
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </Button>
                    {preset.source === "custom" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => {
                          setRenamePresetId(preset.id);
                          setRenameValue(preset.name);
                        }}>
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

      <Dialog open={Boolean(renamePresetId || renameBracketId)} onOpenChange={() => {
        setRenamePresetId(null);
        setRenameBracketId(null);
        setRenameValue("");
      }}>
        <DialogContent className="border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Update the name without changing the bracket or preset logic.</DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRenamePresetId(null);
              setRenameBracketId(null);
              setRenameValue("");
            }}>
              Cancel
            </Button>
            <Button onClick={() => {
              if (renamePresetId) {
                setCustomPresets((prev) => prev.map((preset) => preset.id === renamePresetId ? { ...preset, name: renameValue.trim() || preset.name } : preset));
              }
              if (renameBracketId) {
                setSavedBrackets((prev) => prev.map((saved) => saved.id === renameBracketId ? { ...saved, name: renameValue.trim() || saved.name, updatedAt: new Date().toISOString() } : saved));
              }
              setRenamePresetId(null);
              setRenameBracketId(null);
              setRenameValue("");
            }}>
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
    </div>
  );
}
