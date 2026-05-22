import type { ReactNode } from "react";

export default function MlbMatchupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-page">
      <div className="site-container px-3 py-3 lg:px-4 lg:py-4">
        <div className="space-y-3 lg:space-y-4">{children}</div>
      </div>
    </div>
  );
}
