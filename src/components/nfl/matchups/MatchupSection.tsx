import { type ReactNode } from "react";
import NflSection from "@/components/nfl/ui/NflSection";
import {
  MATCHUP_CARD_EYEBROW,
  MATCHUP_CARD_SURFACE,
  MATCHUP_CARD_TITLE,
} from "@/components/nfl/matchups/MatchupSectionCard";
import {
  MATCHUP_SECTION_SCROLL_MT,
  getMatchupSection,
  type NflMatchupSectionId,
} from "@/lib/nfl/matchupSections";

/**
 * Standard shell for every analyzer section.
 *
 * The analyzer's own concerns live here — the stable anchor id used by the Jump
 * To control, the registry label lookup, and the scroll offset that keeps an
 * anchored heading clear of whichever bars are sticky at the current breakpoint
 * (the site header plus the Jump To bar on mobile, the site header alone on
 * desktop).
 *
 * Everything else — the header layout, the mobile-only collapse affordance and
 * its accessible wiring — is delegated to the shared `NflSection`, so the
 * analyzer and the rest of the NFL platform expand and collapse identically
 * instead of maintaining two accordion implementations.
 *
 * Every analyzer section is `focusable`, because every one of them is a Jump To
 * destination.
 */
export default function MatchupSection({
  id,
  title,
  eyebrow,
  subtitle,
  headerAside,
  collapsible = true,
  defaultOpen = true,
  className = "",
  bodyClassName = "",
  children,
}: {
  id: NflMatchupSectionId;
  /** Overrides the registry label when a section needs a more specific heading. */
  title?: string;
  /** Small coloured label above the title, matching MatchupCard's header. */
  eyebrow?: string;
  subtitle?: string;
  /** Right-aligned header slot (legend, sample note, segmented control). */
  headerAside?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const section = getMatchupSection(id);

  return (
    <NflSection
      id={id}
      title={title ?? section.label}
      eyebrow={eyebrow}
      // Same card surface and header typography MatchupCard renders, so the
      // sections that route through NflSection and the ones that do not read as
      // one family. Other NflSection callers keep the platform defaults.
      eyebrowClassName={MATCHUP_CARD_EYEBROW}
      titleClassName={MATCHUP_CARD_TITLE}
      subtitle={subtitle}
      // Sub-group controls get their own full-width row: at 375px they do not
      // fit beside the heading without squeezing it to two or three lines.
      headerExtra={headerAside}
      collapse={collapsible ? "mobile" : "never"}
      defaultOpen={defaultOpen}
      focusable
      className={`${MATCHUP_SECTION_SCROLL_MT} ${MATCHUP_CARD_SURFACE} ${className}`}
      bodyClassName={bodyClassName}
    >
      {children}
    </NflSection>
  );
}
