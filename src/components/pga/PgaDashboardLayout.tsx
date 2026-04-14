import type { ReactNode } from "react";

type Props = {
  sidebar: ReactNode;
  main: ReactNode;
  panel: ReactNode;
};

export default function PgaDashboardLayout({ sidebar, main, panel }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
          <section className="order-1 min-w-0 xl:order-2">{main}</section>
          <aside className="order-2 xl:order-1 xl:sticky xl:top-24 xl:self-start">{sidebar}</aside>
          <aside className="order-3 min-w-0">{panel}</aside>
        </div>
      </div>
    </div>
  );
}
