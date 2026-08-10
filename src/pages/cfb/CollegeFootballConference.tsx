import { Link, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  getConferenceBySlug,
  getTeamsByConference,
  CFB_PROVENANCE,
} from "@/data/cfb";
import { CFB_BASE_PATH } from "@/lib/cfb/routes";
import CollegeFootballPageHeader from "@/components/cfb/CollegeFootballPageHeader";
import ConferenceStandingsCard from "@/components/cfb/ConferenceStandingsCard";

export default function CollegeFootballConference() {
  const { conferenceSlug = "" } = useParams();
  const conference = getConferenceBySlug(conferenceSlug);
  const teams = conference ? getTeamsByConference(conference.id) : [];

  usePageSeo({
    title: conference
      ? `${conference.name} Standings | College Football | Joe Knows Ball`
      : "Conference | College Football",
    description: conference
      ? `${conference.name} college football standings and JKB power ratings.`
      : "College Football conference page.",
    path: `/college-football/conference/${conferenceSlug}`,
  });

  if (!conference) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-800">Conference not found</p>
        <Link to={CFB_BASE_PATH} className="mt-4 inline-block text-sm font-semibold text-sky-800 hover:underline">
          Back to College Football
        </Link>
      </div>
    );
  }

  return (
    <>
      <CollegeFootballPageHeader
        eyebrow="College Football · Conference"
        title={`${conference.name} · ${CFB_PROVENANCE.label}`}
        description="Conference standings with JKB power context. Full conference hubs expand in a later phase."
        actions={
          <Link to={CFB_BASE_PATH} className="text-sm font-semibold text-sky-800 hover:underline">
            ← All conferences
          </Link>
        }
      />
      <div className="max-w-2xl">
        <ConferenceStandingsCard conference={conference} teams={teams} />
      </div>
    </>
  );
}
