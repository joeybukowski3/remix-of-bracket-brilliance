import type { ReactNode } from "react";
import SiteHeader from "@/components/layout/SiteHeader";

export default function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      {children}
    </div>
  );
}
