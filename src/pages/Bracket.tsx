import { useEffect, useMemo, useState } from "react";
import { Copy, Info, RefreshCw, Save, Share2, Trash2 } from "lucide-react";
import SiteNav from "@/components/SiteNav";
import StatSliders from "@/components/StatSliders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import { buildCanonicalTeams, type StatWeight, type Team } from "@/data/ncaaTeams";
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
  type SavedBracket,
} from "@/lib/bracket";

function SeedBadge({ seed }: { seed: number | null | undefined }) {
  return <Badge variant="secondary" className="rounded-md px-2 py-1 text-[11px] font-bold">{seed ?? "-"}</Badge>;
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

function GameCard({
  game,
  weights,
  onPick,
}: {
  game: BracketGame;
  weights: StatWeight[];
  onPick: (gameId: string, teamId: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {[game.teamA, game.teamB].map((team, index) => (
          <button
            key={`${game.id}-${index}`}
            disabled={!team || !game.teamA || !game.teamB}
            onClick={() => team && onPick(game.id, team.canonicalId)}
            className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors ${
              index === 0 ? "border-b border-border/60" : ""
            } ${game.winner?.canonicalId === team?.canonicalId ? "bg-primary/15" : "hover:bg-secondary/60"} disabled:opacity-50`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <SeedBadge seed={team?.seed} />
              {team && <img src={team.logo} alt={team.name} className="h-7 w-7 shrink-0 object-contain" loading="lazy" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{team?.name ?? "TBD"}</p>
                <p className="text-xs text-muted-foreground">{team ? `${team.abbreviation} · ${team.record || "Record unavailable"}` : "Waiting on prior result"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums">{team ? calculateAdjustedTeamScore(team, weights).toFixed(1) : "--"}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Power</p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Bracket() {
  usePageSeo({
    title: "2025 NCAA Bracket Builder | Joe Knows Ball",
    description: "Build a polished March Madness bracket with placeholder teams now, save entries locally, compare presets, and review region-by-region breakdowns.",
    canonical: "https://joeknowsball.com/bracket",
  });

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
  const summaryText = useMemo(() => createBracketSummaryText(regions, bracketTree, weights, activePreset?.name ?? "Custom mix"), [regions, bracketTree, weights, activePreset]);

  useEffect(() => {
    if (activePreset) setWeights(activePreset.weights.map((weight) => ({ ...weight })));
  }, [selectedPresetId]);

  const handleWeightChange = (key: string, value: number) => {
    setSelectedPresetId(null);
    setWeights((prev) => prev.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
  };

  const handlePickWinner = (gameId: string, teamId: string) => {
    setPicks((prev) => ({ ...prev, [gameId]: teamId }));
  };

  const handleSavePreset = () => {
    const preset = createCustomPreset(newPresetName.trim(), weights);
    if (!newPresetName.trim()) return;
    setCustomPresets((prev) => [preset, ...prev]);
    setSelectedPresetId(preset.id);
    setNewPresetName("");
    setSavePresetOpen(false);
  };

  const handleSaveBracket = () => {
    const saved = createSavedBracket(newBracketName.trim(), selectedPresetId, weights, picks);
    if (!newBracketName.trim()) return;
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

  const currentRegion = regions.find((region) => region.name === selectedRegion) ?? regions[0];
  const sourceLabel = sourceConfig.mode === "live" ? "Official bracket loaded" : "Placeholder bracket active";

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <div className="container mx-auto space-y-6 px-4 py-6 pb-28">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold text-foreground">March Madness Bracket Builder</h1>
            <p className="mt-1 text-muted-foreground">Build, save, and share brackets now with placeholder teams while the app stays ready to swap to the official field automatically.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This test mode uses a placeholder field based on last year&apos;s bracket structure and current team ratings where the model can resolve them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sourceConfig.mode === "live" ? "default" : "secondary"}>{sourceLabel}</Badge>
            <Badge variant="outline">{sourceConfig.sourceLabel}</Badge>
          </div>
        </div>

        <Tabs defaultValue="builder" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="breakdown">Bracket Breakdown</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>

          <TabsContent value="builder" className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Preset Controls</CardTitle>
                <CardDescription>
                  Apply a built-in model, save your own preset, and update regional rankings and path difficulty dynamically.
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
                <div className="rounded-xl bg-secondary/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Active preset</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{activePreset?.name ?? "Current custom mix"}</p>
                  <p className="text-sm text-muted-foreground">{activePreset?.note ?? "Current slider settings are unsaved and acting as a temporary custom preset."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setShowSliders((prev) => !prev)}>{showSliders ? "Hide Weights" : "Adjust Weights"}</Button>
                  <Button variant="outline" onClick={() => setPicks({})}>
                    <RefreshCw className="h-4 w-4" />
                    Reset Picks
                  </Button>
                </div>
                {showSliders && <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1.45fr,1fr]">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">Bracket Builder</CardTitle>
                  <CardDescription>
                    Tap a team to advance it. The same UI will render the official regions automatically when the live source becomes available.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {BRACKET_REGION_NAMES.map((regionName) => (
                      <Button key={regionName} variant={selectedRegion === regionName ? "default" : "secondary"} className="shrink-0" onClick={() => setSelectedRegion(regionName)}>
                        {regionName}
                      </Button>
                    ))}
                  </div>
                  {currentRegion && (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {[0, 1, 2, 3].map((roundIndex) => (
                        <div key={`${currentRegion.name}-${roundIndex}`} className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{BRACKET_ROUNDS[roundIndex]}</p>
                            <p className="text-sm text-muted-foreground">{currentRegion.name} region</p>
                          </div>
                          {(bracketTree.regionGames[currentRegion.name] ?? [])
                            .filter((game) => game.roundIndex === roundIndex)
                            .map((game) => (
                              <GameCard key={game.id} game={game} weights={weights} onPick={handlePickWinner} />
                            ))}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xl">Final Four Snapshot</CardTitle>
                    <CardDescription>Compact summary built for quick phone screenshots.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {bracketTree.finalFourGames.map((game) => (
                      <div key={game.id} className="rounded-xl border border-border/70 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{game.label}</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{game.teamA?.abbreviation ?? "TBD"} vs {game.teamB?.abbreviation ?? "TBD"}</p>
                        <p className="mt-1 text-sm font-semibold text-primary">{game.winner?.name ?? "Winner not picked yet"}</p>
                      </div>
                    ))}
                    <div className="rounded-xl bg-primary/10 p-4 text-center">
                      <p className="text-xs uppercase tracking-wide text-primary">Champion</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{bracketTree.champion?.name ?? "Choose your champion"}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Bracket Breakdown</h2>
              <p className="mt-1 text-muted-foreground">Dynamic regional power rankings, seed visibility, and difficulty-of-path analysis tied to the active preset.</p>
            </div>
            <div className="grid gap-4">
              {regions.map((region) => {
                const rankedTeams = rankTeamsInRegion(region, weights);
                return (
                  <Card key={region.name}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xl">{region.name} Region</CardTitle>
                      <CardDescription>Rankings update live based on your selected preset and weight assumptions.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {rankedTeams.map(({ team, score, path }, index) => (
                        <div key={team.canonicalId} className="rounded-xl border border-border/70 bg-background/60 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">#{index + 1}</span>
                                <SeedBadge seed={team.seed} />
                                <p className="truncate text-sm font-semibold text-foreground">{team.name}</p>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{team.conference} · {team.record || "Record unavailable"}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold tabular-nums text-foreground">{score.toFixed(1)}</p>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Power</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-secondary/60 p-3">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Path Difficulty</p>
                              <div className="mt-1 flex items-center gap-2">
                                <Badge variant={path.tier === "Brutal" ? "destructive" : path.tier === "Hard" ? "default" : "secondary"}>{path.tier}</Badge>
                                <span className="text-sm font-semibold tabular-nums">{path.score}</span>
                              </div>
                            </div>
                            <div className="rounded-lg bg-secondary/60 p-3">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Likeliest Opponents</p>
                              <div className="mt-2 space-y-1">
                                {path.likelyOpponents.map((opponent) => (
                                  <div key={`${team.canonicalId}-${opponent.round}`} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-muted-foreground">{opponent.round}</span>
                                    <span className="truncate font-medium text-foreground">{opponent.team?.abbreviation ?? "TBD"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="saved" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Saved Brackets</h2>
              <p className="mt-1 text-muted-foreground">Save multiple brackets locally, restore them later, or duplicate a version before lock time.</p>
            </div>
            {savedBrackets.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">No saved brackets yet. Save one from the builder to keep your progress.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {savedBrackets.map((savedBracket) => (
                  <Card key={savedBracket.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-foreground">{savedBracket.name}</p>
                          <p className="text-sm text-muted-foreground">Updated {new Date(savedBracket.updatedAt).toLocaleString()}</p>
                        </div>
                        <Badge variant="outline">{savedBracket.presetId ? (presets.find((preset) => preset.id === savedBracket.presetId)?.name ?? "Saved preset") : "Custom mix"}</Badge>
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
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
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Preset Manager</SheetTitle>
            <SheetDescription>Select, duplicate, rename, or remove presets without leaving the bracket flow.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {presets.map((preset) => (
              <Card key={preset.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{preset.name}</p>
                        {preset.id === "preset-2025-elite" && <>
                          <span className="text-primary">*</span>
                          <PresetNote />
                        </>}
                      </div>
                      <p className="text-sm text-muted-foreground">{preset.note}</p>
                    </div>
                    <Badge variant={preset.source === "built-in" ? "outline" : "secondary"}>{preset.source}</Badge>
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
        <DialogContent>
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
        <DialogContent>
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
        <DialogContent>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bracket Share Summary</DialogTitle>
            <DialogDescription>Screenshot this card on mobile or copy/share the text summary.</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-secondary/40 p-4">
            <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">Joe Knows Ball</p>
            <p className="mt-1 text-center text-xl font-bold text-foreground">{bracketTree.champion?.name ?? "Champion pending"}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {regions.map((region) => {
                const regionChampion = (bracketTree.regionGames[region.name] ?? []).find((game) => game.roundIndex === 3)?.winner;
                return (
                  <div key={region.name} className="rounded-xl bg-background p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{region.name}</p>
                    <p className="mt-1 font-semibold text-foreground">{regionChampion?.abbreviation ?? "TBD"}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
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
