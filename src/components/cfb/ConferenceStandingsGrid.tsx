import {
  CFB_CONFERENCE_ORDER,
  CFB_CONFERENCES,
  getAllTeams,
} from "@/data/cfb";
import type { CfbConferenceId, CfbTeam } from "@/data/cfb/types";
import ConferenceStandingsCard from "./ConferenceStandingsCard";

type Props = {
  teams?: CfbTeam[];
};

export default function ConferenceStandingsGrid({ teams }: Props) {
  const all = teams ?? getAllTeams();
  const byConf = new Map<CfbConferenceId, CfbTeam[]>();
  for (const team of all) {
    const list = byConf.get(team.conference) ?? [];
    list.push(team);
    byConf.set(team.conference, list);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {CFB_CONFERENCE_ORDER.filter((id) => (byConf.get(id)?.length ?? 0) > 0).map((id) => (
        <ConferenceStandingsCard
          key={id}
          conference={CFB_CONFERENCES[id]}
          teams={byConf.get(id)!}
        />
      ))}
    </div>
  );
}
