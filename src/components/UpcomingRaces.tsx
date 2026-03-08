"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MapPin, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface UpcomingRace {
  year: number;
  round: number;
  day: number;
  date: string;
  label: string | null;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAYS[d.getDay()];
  return `${month}월 ${day}일 (${dow})`;
}

function getGradeBadge(label: string | null) {
  if (!label) return { grade: "일반", className: "bg-secondary text-secondary-foreground" };
  return { grade: "특별", className: "bg-brand text-white border-brand" };
}

export default function UpcomingRaces() {
  const [races, setRaces] = useState<UpcomingRace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/upcoming-races")
      .then((r) => r.json())
      .then((d) => setRaces(d.races || []))
      .catch(() => setRaces([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">다가오는 경주</h2>
            <p className="mt-1 text-sm text-muted-foreground">이번 주와 다음 주 경주 일정입니다</p>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="min-w-[260px] h-[140px] rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (races.length === 0) {
    return (
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">다가오는 경주</h2>
            <p className="mt-1 text-sm text-muted-foreground">이번 주와 다음 주 경주 일정입니다</p>
          </div>
          <p className="text-sm text-muted-foreground">예정된 경주가 없습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">다가오는 경주</h2>
            <p className="mt-1 text-sm text-muted-foreground">이번 주와 다음 주 경주 일정입니다</p>
          </div>
          <Link
            href="/data/decision-card"
            className="hidden sm:flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            전체 출주표 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Horizontal Scroll Cards */}
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {races.map((race) => {
            const badge = getGradeBadge(race.label);
            const name = race.label
              ? `${race.label} ${race.day}일차`
              : `${race.round}회차 ${race.day}일차`;
            return (
              <Link
                key={`${race.round}-${race.day}`}
                href={`/data/decision-card?year=${race.year}&round=${race.round}&day=${race.day}`}
                className="min-w-[260px] flex-shrink-0"
              >
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <Badge className={badge.className}>
                        {badge.grade}
                      </Badge>
                      <span className="text-xs text-muted-foreground">예정</span>
                    </div>
                    <h3 className="mb-3 font-semibold text-foreground">{name}</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4 text-brand" />
                        <span>{formatDate(race.date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 text-brand" />
                        <span>광명 스피돔</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Mobile: View All Link */}
        <div className="mt-4 sm:hidden text-center">
          <Link
            href="/data/decision-card"
            className="text-sm font-medium text-brand hover:underline"
          >
            전체 출주표 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
