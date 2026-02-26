"use client";

import { TrendingUp, BarChart3, Zap, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  raceData,
  getAverageOddsByBetType,
  getUpsetFrequencyByGrade,
} from "@/data/odds-data";

export default function OddsSummaryCards() {
  const avgOdds = getAverageOddsByBetType(raceData);
  const upsets = getUpsetFrequencyByGrade(raceData);

  const danseung = avgOdds.find((d) => d.승식 === "단승")!;
  const ssangseung = avgOdds.find((d) => d.승식 === "쌍승")!;
  const overall = upsets.find((d) => d.등급 === "전체")!;
  const totalRaces = raceData.length;

  const dates = raceData.map((r) => r.date).sort();
  const periodLabel = dates.length > 0
    ? `${dates[0].slice(0, 7).replace("-", "년 ")}월 ~ ${dates[dates.length - 1].slice(0, 7).replace("-", "년 ")}월`
    : "";

  const summaryCards = [
    {
      label: "평균 단승 배당",
      value: `${danseung.평균}배`,
      sub: `최소 ${danseung.최소}배 ~ 최대 ${danseung.최대}배`,
      icon: Target,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "평균 쌍승 배당",
      value: `${ssangseung.평균}배`,
      sub: `최소 ${ssangseung.최소}배 ~ 최대 ${ssangseung.최대}배`,
      icon: TrendingUp,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
    {
      label: "이변(고배당) 빈도",
      value: `${overall.이변빈도}%`,
      sub: `${overall.총경주수.toLocaleString()}경주 중 ${overall.이변횟수}회`,
      icon: Zap,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "분석 대상 경주 수",
      value: `${totalRaces.toLocaleString()}경주`,
      sub: periodLabel,
      icon: BarChart3,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {summaryCards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs sm:text-sm text-muted-foreground leading-tight">
                {card.label}
              </span>
              <div className={`${card.bg} rounded-lg p-1.5`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className={`text-xl sm:text-2xl font-bold ${card.color}`}>
              {card.value}
            </p>
            <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
              {card.sub}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
