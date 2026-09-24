import { useEffect, useState } from "react";
import { loadSleeperTeams, type SleeperTeam, type SleeperPlayer, type SleeperUser } from "@/lib/fantasy/startSit/sleeper";

const KEY = "jkb:sleeper-username:v1";
export function useSleeperConnection(season: number) {
  const [username, setUsername] = useState(() => { try { return window.localStorage.getItem(KEY) ?? ""; } catch { return ""; } });
  const [state, setState] = useState<{ loading: boolean; error: string | null; user: SleeperUser | null; teams: SleeperTeam[]; players: Record<string, SleeperPlayer> }>({ loading: false, error: null, user: null, teams: [], players: {} });
  useEffect(() => {
    if (!username) { setState({ loading: false, error: null, user: null, teams: [], players: {} }); return; }
    let active = true;
    setState((prior) => ({ ...prior, loading: true, error: null }));
    void loadSleeperTeams(username, season).then(({ user, teams, players }) => {
      if (active) setState({ loading: false, error: null, user, teams, players });
    }).catch((error: Error) => {
      if (active) setState({ loading: false, error: error.message, user: null, teams: [], players: {} });
    });
    return () => { active = false; };
  }, [username, season]);
  const connect = (value: string) => { const clean = value.trim().replace(/^@/, ""); if (!clean) return; try { window.localStorage.setItem(KEY, clean); } catch { /* private browsing */ } setUsername(clean); };
  const disconnect = () => { try { window.localStorage.removeItem(KEY); } catch { /* private browsing */ } setUsername(""); };
  return { username, ...state, connect, disconnect };
}
