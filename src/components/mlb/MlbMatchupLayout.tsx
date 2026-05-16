import type { ReactNode } from "react";

export default function MlbMatchupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
        <div className="space-y-4 lg:space-y-5">{children}</div>
      </div>
    </div>
  );
}
