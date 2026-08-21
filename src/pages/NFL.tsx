import { useLocation, useNavigate } from "react-router-dom";
import WeeklyCommandCenter from "@/components/nfl/weekly-dashboard/WeeklyCommandCenter";
import { useNflWeeklyDashboard } from "@/hooks/useNflWeeklyDashboard";
import { usePageSeo } from "@/hooks/usePageSeo";

export default function NFL() {
  const location = useLocation();
  const navigate = useNavigate();
  const data = useNflWeeklyDashboard(location.search);

  usePageSeo({
    title: "NFL Weekly Command Center | Joe Knows Ball",
    description: "Weekly NFL schedule and model intelligence from Joe Knows Ball.",
    path: "/nfl",
  });

  if (data.season.loading) return <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">Loading the NFL command center…</p>;
  if (data.season.error) return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-sm font-semibold text-red-800">The NFL schedule is unavailable. Other NFL pages remain accessible from the section navigation.</div>;
  if (!data.dashboard) return <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">No regular-season schedule is available yet.</p>;

  const artifactErrors = [data.market.error, data.projections.error, data.ratings.error, ...data.fantasy.contextErrors]
    .filter((error): error is string => Boolean(error));
  return (
    <WeeklyCommandCenter
      dashboard={data.dashboard}
      weeks={data.weekSelection.availableWeeks}
      scheduleMeta={data.season.data?.gamesMeta}
      invalidQuery={data.weekSelection.invalidQuery}
      artifactErrors={artifactErrors}
      onWeekChange={(week) => {
        const params = new URLSearchParams(location.search);
        params.set("week", String(week));
        navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
      }}
    />
  );
}
