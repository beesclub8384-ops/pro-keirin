"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, ClipboardList, UserSearch, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { label: "경주결과", href: "/data/race-results", icon: Trophy },
  { label: "출주표", href: "/data/decision-card", icon: ClipboardList },
  { label: "선수 검색", href: "/data/racer-search", icon: UserSearch },
  { label: "통계", href: "/data/statistics", icon: BarChart3 },
];

export default function DataLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Mobile Tab Bar */}
      <div className="flex gap-1 overflow-x-auto pb-4 lg:hidden scrollbar-hide">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand text-white"
                  : "bg-muted text-foreground/70 hover:bg-muted/80"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-48 shrink-0">
          <nav className="sticky top-32 space-y-1">
            <h2 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              데이터 조회
            </h2>
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
