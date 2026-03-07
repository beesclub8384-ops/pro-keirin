"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RaceDate {
  date: string;
  round: number;
  day: number;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function DataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // --- Calendar state ---
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-indexed
  const [raceDates, setRaceDates] = useState<RaceDate[]>([]);

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-32 space-y-5">
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
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
