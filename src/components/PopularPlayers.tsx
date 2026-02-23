"use client";

import { ChevronRight, Trophy } from "lucide-react";
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
    wins: 245,
    color: "bg-gradient-to-br from-yellow-400 to-amber-600",
    initial: "김",
  },
  {
    id: 2,
    name: "이스피드",
    grade: "S1",
    style: "추입",
    branch: "부산",
    wins: 198,
    color: "bg-gradient-to-br from-red-500 to-red-700",
    initial: "이",
  },
  {
    id: 3,
    name: "박질주",
    grade: "S1",
    style: "젖히기",
    branch: "창원",
    wins: 176,
    color: "bg-gradient-to-br from-blue-500 to-blue-700",
    initial: "박",
  },
  {
    id: 4,
    name: "최번개",
    grade: "S2",
    style: "마크",
    branch: "동서울",
    wins: 154,
    color: "bg-gradient-to-br from-green-500 to-green-700",
    initial: "최",
  },
  {
    id: 5,
    name: "정독수리",
    grade: "S2",
    style: "선행",
    branch: "김포",
    wins: 142,
    color: "bg-gradient-to-br from-purple-500 to-purple-700",
    initial: "정",
  },
  {
    id: 6,
    name: "한폭풍",
    grade: "S3",
    style: "추입",
    branch: "수성",
    wins: 128,
    color: "bg-gradient-to-br from-pink-500 to-pink-700",
    initial: "한",
  },
];

function getGradeColor(grade: string) {
  if (grade === "SS") return "bg-amber-500 text-white border-amber-500";
  if (grade.startsWith("S")) return "bg-keirin-red text-white border-keirin-red";
  if (grade.startsWith("A")) return "bg-blue-500 text-white border-blue-500";
  return "bg-secondary text-secondary-foreground";
}

export default function PopularPlayers() {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">인기 선수 하이라이트</h2>
            <p className="mt-1 text-sm text-muted-foreground">팬들이 주목하는 선수들</p>
          </div>
          <Link
            href="/players"
            className="hidden sm:flex items-center gap-1 text-sm font-medium text-keirin-red hover:underline"
          >
            전체 선수 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Horizontal Scroll Player Cards */}
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {players.map((player) => (
            <Link key={player.id} href={`/players/${player.id}`}>
              <Card className="min-w-[180px] flex-shrink-0 cursor-pointer hover:shadow-lg transition-shadow overflow-hidden">
                {/* Player Avatar Area */}
                <div className={`${player.color} flex items-center justify-center py-8`}>
                  <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold">
                    {player.initial}
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold text-foreground">{player.name}</span>
                    <Badge className={`${getGradeColor(player.grade)} text-[10px]`}>
                      {player.grade}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>전법: {player.style}</p>
                    <p>소속: {player.branch}지부</p>
                    <div className="flex items-center gap-1 text-keirin-gold">
                      <Trophy className="h-3 w-3" />
                      <span className="font-medium">{player.wins}승</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Mobile: View All Link */}
        <div className="mt-4 sm:hidden text-center">
          <Link
            href="/players"
            className="text-sm font-medium text-keirin-red hover:underline"
          >
            전체 선수 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
