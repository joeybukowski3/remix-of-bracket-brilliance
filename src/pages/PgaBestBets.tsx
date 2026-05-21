import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SportsbookBar from "@/components/SportsbookBar";
import { usePageSeo } from "@/hooks/usePageSeo";
import { FEATURED_PGA_TOURNAMENT } from "@/lib/pga/tournaments";

type BestBetPick = {
  player: string;
  tournamentRank: number;
  powerRank: number;
  topStats: string[];
  bullets: string[];
  odds?: {
    outright?: string | null;
    top5?: string | null;
    top10?: string | null;
    top20?: string | null;
  } | null;
};

type BestBetsPayload = {
  tournament: string;
  course: string;
  generatedAt: string;
  preview?: {
    tournamentOverview: string;
    modelExplainer: string;
    pickApproach: string;
  } | null;
  valueBets?: Array<{
    player: string;
    market: string;
    americanOdds: string;
    modelRank: number;
    impliedProbability: string;
    modelEdge: string;
  }>;
  outrights: BestBetPick[];
  top5: BestBetPick[];
  top10: BestBetPick[];
  top20: BestBetPick[];
};

const EMPTY_MESSAGE = "This week's analysis generates every Monday. Check back after the picks drop.";

const SECTIONS: Array<{
  key: keyof Pick<BestBetsPayload, "outrights" | "top5" | "top10" | "top20">;
  title: string;
  description: string;
  tierNote: string;
}> 
