import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { getMatchupBySlug, type NflMatchupTeam } from "@/lib/n