import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PickOutcome } from "../engine/draftPickValue";
import { buildShareMessage, SHARE_TITLE, SHARE_URL } from "../lib/shareResult";
import type { SeasonResult } from "../types";

const COPIED_LABEL_DURATION_MS = 2000;

function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function ShareResultsButton({
  result,
  bestPick,
}: {
  result: SeasonResult;
  bestPick?: PickOutcome | null;
}) {
  const [isSharing, setIsSharing] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    const text = buildShareMessage(result, bestPick);

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: SHARE_TITLE, text, url: SHARE_URL });
        return;
      }
      await copyToClipboard(`${text}\n${SHARE_URL}`);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), COPIED_LABEL_DURATION_MS);
    } catch (error) {
      if (isCancellation(error)) return;
      try {
        await copyToClipboard(`${text}\n${SHARE_URL}`);
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), COPIED_LABEL_DURATION_MS);
      } catch {
        // Clipboard also unavailable; nothing more we can do without an error UI.
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleShare}
      disabled={isSharing}
      size="sm"
      aria-label="Share your 16-0 results"
      className="border border-slate-950/20 bg-white/40 font-black text-slate-950 backdrop-blur hover:bg-white/70"
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      {justCopied ? "Copied!" : "Share Results"}
    </Button>
  );
}
