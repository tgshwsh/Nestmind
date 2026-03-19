"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, NotebookPen, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/calendar", label: "日历/日程", Icon: CalendarDays },
  { href: "/notes", label: "记事/日记", Icon: NotebookPen },
  { href: "/resources", label: "资料库/资源", Icon: BookOpen },
  { href: "/me", label: "我的/里程碑", Icon: Trophy },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md",
        "border-t border-border/70 bg-background/70 backdrop-blur-md",
        "supports-[backdrop-filter]:bg-background/55"
      )}
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-4">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-2.5",
                "transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={1.5} />
              <span className="text-[11px] leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

