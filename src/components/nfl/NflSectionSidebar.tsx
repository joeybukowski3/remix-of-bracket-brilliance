import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu } from "lucide-react";
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
  getActiveNflSectionCategoryId,
  getActiveNflSectionLabel,
  isNflSectionPathActive,
  type NflSectionNavCategory,
} from "@/lib/nfl/sectionNav";
import { cn } from "@/lib/utils";

type NflSectionSidebarProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

/**
 * The NFL platform sitemap, rendered once for desktop (persistent rail) and
 * once inside the mobile drawer. There is exactly one navigation component for
 * the section — the guide previously carried a second, unrelated pill row.
 */
export default function NflSectionSidebar({ mobile = false, onNavigate }: NflSectionSidebarProps) {
  const location = useLocation();
  const activeCategoryId = getActiveNflSectionCategoryId(location.pathname);
  // All categories start expanded so every destination is immediately visible;
  // users may still collapse individual categories from there.
  const [openCategories, setOpenCategories] = useState<string[]>(() =>
    NFL_SECTION_NAV_CATEGORIES.map((category) => category.id)
  );

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
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-950 px-3 py-3 text-white">
            <Link
              to="/nfl"
              onClick={onNavigate}
              className="flex min-w-0 items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <img src="/logos/nfl.svg" alt="NFL" className="h-8 w-auto shrink-0 object-contain" loading="eager" />
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight">NFL</span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Data &amp; Intelligence
                </span>
              </span>
            </Link>
          </div>

          <nav className="divide-y divide-slate-100" aria-label="NFL sitemap">
            {NFL_SECTION_NAV_CATEGORIES.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                pathname={location.pathname}
                open={openCategories.includes(category.id)}
                onToggle={() => toggleCategory(category.id)}
                onNavigate={onNavigate}
              />
            ))}
          </nav>
        </div>
      </div>
    </aside>
  );
}

/**
 * Mobile / tablet entry point to the sitemap.
 *
 * Doubles as the "you are here" indicator: below `xl` there is no persistent
 * rail, so the trigger states the current destination rather than the generic
 * "NFL Menu / Sections" it used to. Radix's Sheet supplies the focus trap,
 * Escape handling, body-scroll lock and focus restore.
 */
export function NflMobileMenu() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const activeLabel = getActiveNflSectionLabel(location.pathname);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="mb-4 xl:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label="Open NFL menu"
          >
            <Menu className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                NFL Menu
              </span>
              <span className="block truncate text-sm font-semibold text-slate-900">
                {activeLabel ?? "All sections"}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          </button>
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
  onToggle,
  onNavigate,
}: {
  category: NflSectionNavCategory;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const panelId = useMemo(() => `nfl-nav-${category.id}`, [category.id]);

  return (
    <section>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {category.label}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <ul id={panelId} className="pb-1.5">
          {category.items.map((item) => {
            const active = isNflSectionPathActive(pathname, item.to);
            return (
              <li key={`${category.id}-${item.to}`}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // The active state is a left rule plus weight, not a tinted
                    // card — so it reads at a glance without adding a colour.
                    "flex items-baseline gap-2 border-l-2 py-1.5 pl-2.5 pr-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500",
                    active
                      ? "border-sky-600 bg-sky-50/60 font-semibold text-slate-900"
                      : "border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <span className="shrink-0 text-[11px] leading-5" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="min-w-0">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
