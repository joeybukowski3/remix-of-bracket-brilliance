import type { ReactNode } from "react";

export default function MlbMatchupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="space-y-6 lg:space-y-8">{children}</div>
      </div>
    </div>
  );
}
