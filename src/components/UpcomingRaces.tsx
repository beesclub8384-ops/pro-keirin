"use client";

import { CalendarDays, MapPin, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const races = [
  {
    id: 1,
    date: "2월 28일 (금)",
    time: "14:00",
    venue: "광명 스피돔",
    grade: "GI",
    name: "왕중왕전 1일차",
    status: "예정",
  },
  {
    id: 2,
    date: "3월 1일 (토)",
    time: "14:00",
    venue: "광명 스피돔",
    grade: "GI",
    name: "왕중왕전 2일차",
    status: "예정",
  },
  {
    id: 3,
    date: "3월 2일 (일)",
    time: "14:00",
    venue: "광명 스피돔",
    grade: "GI",
    name: "왕중왕전 결승",
    status: "예정",
  },
  {
    id: 4,
    date: "3월 7일 (금)",
    time: "14:00",
    venue: "부산 스포원파크",
    grade: "일반",
    name: "일반경주",
    status: "예정",
  },
  {
    id: 5,
    date: "3월 8일 (토)",
    time: "14:00",
    venue: "부산 스포원파크",
    grade: "일반",
    name: "일반경주",
    status: "예정",
  },
];

function getGradeBadgeColor(grade: string) {
  switch (grade) {
    case "GI":
      return "bg-keirin-red text-white border-keirin-red";
    case "GII":
      return "bg-keirin-gold text-keirin-dark border-keirin-gold";
    case "GIII":
      return "bg-blue-500 text-white border-blue-500";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export default function UpcomingRaces() {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">다가오는 경주 일정</h2>
            <p className="mt-1 text-sm text-muted-foreground">이번 주와 다음 주 경주 일정입니다</p>
          </div>
          <Link
            href="/races"
            className="hidden sm:flex items-center gap-1 text-sm font-medium text-keirin-red hover:underline"
          >
            전체 일정 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Horizontal Scroll Cards */}
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {races.map((race) => (
            <Card
              key={race.id}
              className="min-w-[260px] flex-shrink-0 cursor-pointer hover:shadow-lg transition-shadow"
            >
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <Badge className={getGradeBadgeColor(race.grade)}>
                    {race.grade}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{race.status}</span>
                </div>
                <h3 className="mb-3 font-semibold text-foreground">{race.name}</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4 text-keirin-red" />
                    <span>{race.date} {race.time}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-keirin-red" />
                    <span>{race.venue}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mobile: View All Link */}
        <div className="mt-4 sm:hidden text-center">
          <Link
            href="/races"
            className="text-sm font-medium text-keirin-red hover:underline"
          >
            전체 일정 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
