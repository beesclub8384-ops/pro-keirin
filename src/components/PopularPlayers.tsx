"use client";

import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const players = [
  {
    id: 1,
    name: "김경륜",
    grade: "SS",
    style: "선행",
    branch: "광명",
    recentRate: "68%",
    trend: "up",
  },
  {
    id: 2,
    name: "이스피드",
    grade: "S1",
    style: "추입",
    branch: "부산",
    recentRate: "55%",
    trend: "up",
  },
  {
    id: 3,
    name: "박질주",
    grade: "S1",
    style: "젖히기",
    branch: "창원",
    recentRate: "52%",
    trend: "down",
  },
  {
    id: 4,
    name: "최번개",
    grade: "S2",
    style: "마크",
    branch: "광명",
    recentRate: "48%",
    trend: "even",
  },
  {
    id: 5,
    name: "정독수리",
    grade: "S2",
    style: "선행",
    branch: "부산",
    recentRate: "45%",
    trend: "up",
  },
  {
    id: 6,
    name: "한폭풍",
    grade: "S3",
    style: "추입",
    branch: "창원",
    recentRate: "42%",
    trend: "down",
  },
];

function getGradeColor(grade: string) {
  if (grade === "SS") return "bg-amber-500 text-white border-amber-500";
  if (grade.startsWith("S")) return "bg-brand text-white border-brand";
  if (grade.startsWith("A")) return "bg-emerald-500 text-white border-emerald-500";
  return "bg-secondary text-secondary-foreground";
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

export default function PopularPlayers() {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">선수 성적 트렌드</h2>
            <p className="mt-1 text-sm text-muted-foreground">최근 성적 기준 주목할 선수</p>
          </div>
          <Link
            href="/players"
            className="hidden sm:flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            전체 선수 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Player Stats Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {players.map((player) => (
            <Card key={player.id} className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-bold text-foreground">{player.name}</span>
                  <Badge className={`${getGradeColor(player.grade)} text-[10px]`}>
                    {player.grade}
                  </Badge>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>전법: {player.style}</p>
                  <p>소속: {player.branch}</p>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm font-semibold text-foreground">{player.recentRate}</span>
                    <div className="flex items-center gap-1">
                      <TrendIcon trend={player.trend} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">최근 연대율</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mobile: View All Link */}
        <div className="mt-4 sm:hidden text-center">
          <Link
            href="/players"
            className="text-sm font-medium text-brand hover:underline"
          >
            전체 선수 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
