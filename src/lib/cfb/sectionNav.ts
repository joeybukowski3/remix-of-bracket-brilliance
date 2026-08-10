import {
  CFB_BASE_PATH,
  CFB_RANKINGS_PATH,
  CFB_SCHEDULE_PATH,
} from "./routes";

export type CfbNavItem = {
  to: string;
  label: string;
  shortLabel: string;
  match?: "exact" | "prefix";
};

export const CFB_SECTION_NAV: CfbNavItem[] = [
  {
    to: CFB_BASE_PATH,
    label: "Top 25 & Conferences",
    shortLabel: "Home",
    match: "exact",
  },
  {
    to: CFB_RANKINGS_PATH,
    label: "FBS Rankings",
    shortLabel: "Rankings",
    match: "prefix",
  },
  {
    to: CFB_SCHEDULE_PATH,
    label: "Schedule",
    shortLabel: "Schedule",
    match: "prefix",
  },
];

export function isCfbNavActive(pathname: string, item: CfbNavItem): boolean {
  if (item.match === "exact") return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
