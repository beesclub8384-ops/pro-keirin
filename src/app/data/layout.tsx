"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Trophy,
  ClipboardList,
  UserSearch,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const sidebarItems = [
  { label: "경주결과", href: "/data/race-results", icon: Trophy },
  { label: "출주표", href: "/data/decision-card", icon: ClipboardList },
  { label: "선수 검색", href: "/data/racer-search", icon: UserSearch },
  { label: "통계", href: "/data/statistics", icon: BarChart3 },
];

interface RaceDate {
  date: string;
  round: number;
  day: number;
}

interface QuickResult {
  racerId: string;
  name: string;
  year: number;
  gradeChange: string;
  winRate: number;
  top2Rate: number;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function DataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // --- Calendar state ---
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-indexed
  const [raceDates, setRaceDates] = useState<RaceDate[]>([]);

  // --- Quick search state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<QuickResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Determine current viewing date from page context
  // Pages store year/round/day in search params or we detect from pathname
  const currentViewDate = useMemo(() => {
    // If we're on race-results or decision-card, there's no date param directly
    // but we can use it if passed via URL later
    return null;
  }, []);

  // Load race dates for the calendar month's year
  useEffect(() => {
    fetch(`/api/data/race-dates?year=${calYear}`)
      .then((r) => r.json())
      .then((d) => setRaceDates(d.dates || []))
      .catch(() => setRaceDates([]));
  }, [calYear]);

  // Race dates set for quick lookup
  const raceDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of raceDates) s.add(d.date);
    return s;
  }, [raceDates]);

  // Race date map for navigation
  const raceDateMap = useMemo(() => {
    const m = new Map<string, RaceDate>();
    for (const d of raceDates) m.set(d.date, d);
    return m;
  }, [raceDates]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const handleDateClick = (day: number) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const rd = raceDateMap.get(dateStr);
    if (!rd) return;
    // Navigate to race results for that date
    router.push(
      `/data/race-results?year=${rd.round > 0 ? calYear : calYear}&round=${rd.round}&day=${rd.day}`
    );
  };

  const isToday = (day: number) => {
    return (
      calYear === now.getFullYear() &&
      calMonth === now.getMonth() &&
      day === now.getDate()
    );
  };

  const getDateStr = (day: number) =>
    `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // --- Quick search ---
  const doQuickSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/data/racer-search?q=${encodeURIComponent(q.trim())}&year=${now.getFullYear()}`
      );
      const d = await res.json();
      // Deduplicate by racerId, take first (most recent)
      const seen = new Set<string>();
      const unique: QuickResult[] = [];
      for (const r of d.results || []) {
        if (!seen.has(r.racerId)) {
          seen.add(r.racerId);
          unique.push(r);
        }
        if (unique.length >= 5) break;
      }
      setSearchResults(unique);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doQuickSearch(searchQuery), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, doQuickSearch]);

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
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-32 space-y-5">
            {/* Navigation */}
            <nav className="space-y-1">
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

            {/* Mini Calendar */}
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <button
                  onClick={prevMonth}
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-semibold">
                  {calYear}.{String(calMonth + 1).padStart(2, "0")}
                </span>
                <button
                  onClick={nextMonth}
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
                {DAYS.map((d) => (
                  <div key={d} className="py-0.5 font-medium">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 text-center text-[11px]">
                {calendarDays.map((day, i) => {
                  if (day === null)
                    return <div key={`empty-${i}`} className="py-1" />;
                  const dateStr = getDateStr(day);
                  const hasRace = raceDateSet.has(dateStr);
                  const today = isToday(day);
                  return (
                    <button
                      key={day}
                      onClick={() => hasRace && handleDateClick(day)}
                      disabled={!hasRace}
                      className={cn(
                        "mx-auto flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                        hasRace &&
                          "bg-green-100 text-green-800 font-semibold hover:bg-green-200 cursor-pointer",
                        !hasRace && "text-muted-foreground/50",
                        today && "ring-1 ring-brand"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-100" />
                경주일
              </p>
            </div>

            {/* Quick Racer Search */}
            <div className="space-y-2">
              <h3 className="px-1 text-xs font-semibold text-muted-foreground">
                선수 빠른검색
              </h3>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="선수명"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              {searchQuery.trim() && (
                <div className="rounded-md border bg-card">
                  {searchLoading ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      검색 중...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      결과 없음
                    </div>
                  ) : (
                    searchResults.map((r) => (
                      <Link
                        key={r.racerId}
                        href={`/data/racer-search?q=${encodeURIComponent(r.name)}`}
                        onClick={() => setSearchQuery("")}
                        className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted transition-colors border-b last:border-b-0"
                      >
                        <span className="font-medium">{r.name}</span>
                        <span className="text-muted-foreground">
                          승 {r.winRate}%
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
