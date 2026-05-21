import type { ReactNode } from "react";

export default function MlbMatchupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-page">
      <div className="site-container py-4 lg:py-6">
        <div className="space-y-4 lg:space-y-5">{children}</div>
      </div>
    </div>
  );
}
