import type { ReactNode } from "react";

import { BottomNav } from "@/components/bottom-nav";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 pb-24 pt-6">
      {children}
      <BottomNav />
    </div>
  );
}

