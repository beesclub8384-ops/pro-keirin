"use client";

import { TrendingDown, TrendingUp, BarChart3, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  raceData,
  getAverageOddsByGrade,
  getUpsetFrequency,
} from "@/data/odds-data";

export default function OddsSummaryCards() {
  const avgOdds = getAverageOddsByGrade(raceData);
  const upsets = getUpsetFrequency(raceData);

  const special = avgOdds.find((d) => d.등급 === "특선")!;
  const general = avgOdds.find((d) => d.등급 === "선발")!;
  const specialUpset = upsets.find((d) => d.등급 === "특선")!;
  const totalRaces = raceData.length;
  const dates = raceData.map((r) => r.date).sort();
  const periodLabel = dates.length > 0
    ? `${dates[0].slice(0, 7).replace("-", "년 ")}월 ~ ${dates[dates.length - 1].slice(0, 7).replace("-", "년 ")}월`
    : "";

  const summaryCards = [
    {
      label: "특선급 평균 단승 배당",
      value: `${special.단승}배`,
      sub: `선발급 대비 ${Math.round((1 - special.단승 / general.단승) * 100)}% 낮음`,
      icon: TrendingDown,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "선발급 평균 단승 배당",
      value: `${general.단승}배`,
      sub: `특선급 대비 ${Math.round((general.단승 / special.단승 - 1) * 100)}% 높음`,
      icon: TrendingUp,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
    {
      label: "특선급 이변(고배당) 빈도",
      value: `${specialUpset.이변빈도}%`,
      sub: `${specialUpset.총경주수}경주 중 ${specialUpset.이변횟수}회`,
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
