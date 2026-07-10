import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  NFL_SECTION_NAV_CATEGORIES,
  NFL_SECTION_THEMES,
  getActiveNflSectionCategoryId,
  isNflSectionPathActive,
  type NflSectionNavCategory,
} from "@/lib/nfl/sectionNav";

type NflSectionSidebarProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export default function NflSectionSidebar({ mobile = false, onNavigate }: NflSectionSidebarProps) {
  const location = useLocation();
  const activeCategoryId = getActiveNflSectionCategoryId(location.pathname);
  const [openCategories, setOpenCategories] = useState<string[]>(() => [activeCategoryId].filter(Boolean) as string[]);

  useEffect(() => {
    if (!activeCategoryId) return;
    setOpenCategories((current) => current.includes(activeCategoryId) ? current : [...current, activeCategoryId]);
  }, [activeCategoryId]);

  const toggleCategory = (categoryId: string) => {
    setOpenCategories((current) =>
      current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]
    );
  };

  return (
    <aside className={mobile ? "" : "hidden xl:block"} aria-label="NFL platform navigation">
      <div className={mobile ? "" : "sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto"}>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950 px-5 py-4 text-white">
            <Link to="/nfl" onClick={onNavigate} className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-950">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10">
                <img src="/logos/nfl.svg" alt="NFL" className="h-12 w-auto object-contain" loading="eager" />
              </span>
              <span>
                <span className="block text-lg font-black leading-none">NFL</span>
                <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Data & Intelligence</span>
              </span>
            </Link>
            <p className="mt-3 text-xs leading-5 text-slate-300">Power ratings, season context, markets and team dashboards in one NFL workspace.</p>
          </div>

          <nav className="space-y-3 p-3" aria-label="NFL sitemap">
            {NFL_SECTION_NAV_CATEGORIES.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                pathname={location.pathname}
                open={openCategories.includes(category.id)}
                active={category.id === activeCategoryId}
                onToggle={() => toggleCategory(category.id)}
                onNavigate={onNavigate}
              />
            ))}
          </nav>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
            More NFL intelligence tools will plug into this navigation as they go live. 🚀
          </div>
        </div>
      </div>
    </aside>
  );
}

export function NflMobileMenu() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="mb-4 xl:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between border-slate-200 bg-white font-black text-slate-900 shadow-sm" aria-label="Open NFL menu">
            <span className="inline-flex items-center gap-2">
              <Menu className="h-4 w-4" aria-hidden />
              NFL Menu
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Sections</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="top-[73px] h-[calc(100vh-73px)] w-[88vw] max-w-sm overflow-y-auto bg-slate-50 p-4">
          <SheetHeader className="sr-only">
            <SheetTitle>NFL Menu</SheetTitle>
            <SheetDescription>Navigate Joe Knows Ball NFL pages.</SheetDescription>
          </SheetHeader>
          <NflSectionSidebar mobile onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CategorySection({
  category,
  pathname,
  open,
  active,
  onToggle,
  onNavigate,
}: {
  category: NflSectionNavCategory;
  pathname: string;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const panelId = useMemo(() => `nfl-nav-${category.id}`, [category.id]);
  const theme = NFL_SECTION_THEMES[category.themeId];

  return (
    <section
      className={`rounded-xl border transition-shadow ${active ? `${theme.activeBorder} ${theme.activeBackground} shadow-sm` : `${theme.border} ${theme.background}`}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="min-w-0">
          <span className={`block text-xs font-black uppercase tracking-[0.14em] ${theme.heading}`}>{category.label}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{category.description}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="space-y-1 px-2 pb-2">
          {category.items.map((item) => {
            const activeItem = isNflSectionPathActive(pathname, item.to);
            return (
              <Link
                key={`${category.id}-${item.to}`}
                to={item.to}
                onClick={onNavigate}
                aria-current={activeItem ? "page" : undefined}
                className={`group flex items-start gap-3 rounded-lg border p-2.5 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  activeItem
                    ? `${theme.linkActiveBorder} ${theme.linkActiveBackground} ${theme.linkActiveText} shadow-sm`
                    : "border-transparent text-slate-700 hover:border-white hover:bg-white/60"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none ${
                    activeItem ? theme.iconBackground : "bg-white/70 group-hover:bg-white"
                  }`}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm leading-5 ${activeItem ? "font-black" : "font-bold"}`}>{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
