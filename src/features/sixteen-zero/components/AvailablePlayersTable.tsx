import { memo, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NflTeamLogo } from "./NflTeamLogo";
import type { FantasyPosition, SimulationPlayer } from "../types";

type SortKey = "blended" | "consensus" | "projection" | "position";

type AvailablePlayersTableProps = {
  players: readonly SimulationPlayer[];
  legalPlayerIds: ReadonlySet<string>;
  canDraft: boolean;
  onDraft: (playerId: string) => void;
};

const ALL_POSITIONS: FantasyPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];

const POSITION_SINGULAR_LABEL: Record<FantasyPosition, string> = {
  QB: "quarterback",
  RB: "running back",
  WR: "wide receiver",
  TE: "tight end",
  K: "kicker",
  DST: "defense",
};

function describeForcedPositions(positions: readonly FantasyPosition[]): string {
  if (positions.length === 1) {
    return `a ${POSITION_SINGULAR_LABEL[positions[0]]}`;
  }
  if (positions.length === 2) {
    return `${positions[0]} or ${positions[1]}`;
  }
  return `${positions.slice(0, -1).join(", ")}, or ${positions[positions.length - 1]}`;
}

function AvailablePlayersTableComponent({
  players,
  legalPlayerIds,
  canDraft,
  onDraft,
}: AvailablePlayersTableProps) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<"ALL" | FantasyPosition>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("blended");

  const legalPositions = useMemo(() => {
    const set = new Set<FantasyPosition>();
    for (const player of players) {
      if (legalPlayerIds.has(player.id)) set.add(player.position);
    }
    return set;
  }, [players, legalPlayerIds]);

  const forcedPositions = useMemo(
    () => ALL_POSITIONS.filter((candidate) => legalPositions.has(candidate)),
    [legalPositions],
  );

  const isForced = canDraft && forcedPositions.length > 0 && forcedPositions.length < ALL_POSITIONS.length;

  useEffect(() => {
    setPosition("ALL");
  }, [isForced]);

  const visiblePlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return players
      .filter(
        (player) =>
          (isForced
            ? forcedPositions.includes(player.position)
            : position === "ALL" || player.position === position) &&
          (!normalizedSearch ||
            player.name.toLowerCase().includes(normalizedSearch) ||
            player.team.toLowerCase().includes(normalizedSearch)),
      )
      .sort((first, second) => {
        if (sortKey === "projection") {
          return second.projectedPPG - first.projectedPPG || first.consensusOverallRank - second.consensusOverallRank;
        }
        if (sortKey === "consensus") {
          return first.consensusOverallRank - second.consensusOverallRank;
        }
        if (sortKey === "position") {
          return (
            first.position.localeCompare(second.position) ||
            first.consensusPositionRank - second.consensusPositionRank
          );
        }
        return (
          first.consensusOverallRank * 0.6 +
          first.blendedPositionRank * 0.4 -
          (second.consensusOverallRank * 0.6 + second.blendedPositionRank * 0.4)
        );
      });
  }, [players, position, search, sortKey, isForced, forcedPositions]);

  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/90 shadow-xl shadow-black/10">
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-[clamp(0.9375rem,0.85rem+0.3vw,1.125rem)] font-black text-white">
              Available players
            </h1>
            <p className="text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] text-slate-400">
              {players.length} players remain
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_120px_150px]">
            <label className="relative">
              <span className="sr-only">Search players</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search player or team"
                className="h-9 border-slate-700 bg-slate-950 pl-9 text-sm text-white placeholder:text-slate-600"
              />
            </label>
            <label>
              <span className="sr-only">Filter by position</span>
              <select
                value={position}
                onChange={(event) => setPosition(event.target.value as typeof position)}
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
              >
                <option value="ALL">All positions</option>
                {(isForced ? forcedPositions : ALL_POSITIONS).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Sort available players</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
              >
                <option value="blended">Best available</option>
                <option value="consensus">Consensus rank</option>
                <option value="projection">Projected PPG</option>
                <option value="position">Position rank</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {isForced ? (
        <p
          data-forced-position-notice
          className="border-b border-amber-300/20 bg-amber-300/10 px-4 py-2.5 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-bold text-amber-200"
        >
          Roster requirement active: select {describeForcedPositions(forcedPositions)}.
        </p>
      ) : null}

      <div className="max-h-[calc(100vh-250px)] overflow-y-auto md:hidden">
        <ul className="divide-y divide-white/[0.06]">
          {visiblePlayers.map((player) => {
            const legal = canDraft && legalPlayerIds.has(player.id);
            return (
              <li key={player.id} className="p-3">
                <div className="flex items-center gap-3">
                  <span className="w-7 shrink-0 text-center font-mono text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                    {player.consensusOverallRank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-bold text-white">
                      <NflTeamLogo team={player.team} size={18} />
                      <span className="truncate">{player.name}</span>
                    </p>
                    <p className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                      {player.team} · {player.position}{player.consensusPositionRank} · Bye {player.byeWeek} · {player.blendedPPG.toFixed(1)} PPG
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!legal}
                    onClick={() => onDraft(player.id)}
                    className="min-h-10 min-w-16 bg-cyan-400 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-black text-slate-950 hover:bg-cyan-300"
                  >
                    Draft
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hidden max-h-[calc(100vh-250px)] overflow-x-auto overflow-y-auto md:block">
        <table className="w-full min-w-[560px] border-collapse text-left text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)]">
          <thead className="sticky top-0 z-10 bg-slate-950 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-3 text-center">Rank</th>
              <th scope="col" className="px-3 py-3">Player</th>
              <th scope="col" className="px-3 py-3">Pos.</th>
              <th scope="col" className="px-3 py-3 text-right">Proj. PPG</th>
              <th scope="col" className="hidden px-3 py-3 text-right lg:table-cell">Bye</th>
              <th scope="col" className="hidden px-3 py-3 text-right xl:table-cell">Blend</th>
              <th scope="col" className="hidden px-3 py-3 text-right 2xl:table-cell">SOS</th>
              <th scope="col" className="px-3 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.055]">
            {visiblePlayers.map((player) => {
              const legal = canDraft && legalPlayerIds.has(player.id);
              return (
                <tr key={player.id} className="group hover:bg-cyan-400/[0.045]">
                  <td className="px-3 py-3 text-center font-mono text-slate-500">
                    {player.consensusOverallRank}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex max-w-48 items-center gap-1.5 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-bold text-slate-100">
                      <NflTeamLogo team={player.team} size={20} />
                      <span className="truncate">{player.name}</span>
                    </span>
                    <span className="text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-500">
                      {player.team}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-white/[0.06] px-1.5 py-1 text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] font-bold text-cyan-300">
                      {player.position}{player.consensusPositionRank}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-200">
                    {player.projectedPPG.toFixed(1)}
                  </td>
                  <td className="hidden px-3 py-3 text-right text-slate-400 lg:table-cell">
                    {player.byeWeek}
                  </td>
                  <td className="hidden px-3 py-3 text-right font-semibold text-amber-300 xl:table-cell">
                    {player.blendedPPG.toFixed(1)}
                  </td>
                  <td className="hidden px-3 py-3 text-right text-slate-400 2xl:table-cell">
                    {player.fullSeasonSOSRank ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      size="sm"
                      disabled={!legal}
                      onClick={() => onDraft(player.id)}
                      className="h-8 bg-cyan-400 px-3 text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-black text-slate-950 hover:bg-cyan-300"
                    >
                      Draft
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const AvailablePlayersTable = memo(AvailablePlayersTableComponent);

