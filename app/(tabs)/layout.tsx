import type { ReactNode } from "react";

import { BottomNav } from "@/components/bottom-nav";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto min-h-full w-full max-w-md px-4 pt-6"
      style={{
        paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
      }}
    >
      {children}
      <BottomNav />
    </div>
  );
}

