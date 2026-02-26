"use client";

import { Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  raceData,
  isRealData,
  getAverageOddsByBetType,
  getAverageOddsByVenue,
  getUpsetFrequencyByVenue,
} from "@/data/odds-data";

export default function AiInsight() {
  const avgByBet = getAverageOddsByBetType(raceData);
  const avgByVenue = getAverageOddsByVenue(raceData);
  const upsets = getUpsetFrequencyByVenue(raceData);

  const danseung = avgByBet.find((d) => d.승식 === "단승")!;
  const ssangseung = avgByBet.find((d) => d.승식 === "쌍승")!;
  const samssangseung = avgByBet.find((d) => d.승식 === "삼쌍승")!;

  const overallUpset = upsets.find((d) => d.경륜장 === "전체")!;
  const venueUpsets = upsets.filter((d) => d.경륜장 !== "전체");
  const highestUpsetVenue = venueUpsets.sort((a, b) => b.이변빈도 - a.이변빈도)[0];
  const lowestUpsetVenue = venueUpsets.sort((a, b) => a.이변빈도 - b.이변빈도)[0];

  const highestOddsVenue = avgByVenue.sort((a, b) => b.단승 - a.단승)[0];
  const lowestOddsVenue = avgByVenue.sort((a, b) => a.단승 - b.단승)[0];

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-5 w-5 text-blue-600" />
          데이터 분석 결과 요약
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed text-foreground/80">
        <div>
          <h4 className="font-bold text-foreground mb-1">1. 승식별 평균 배당률</h4>
          <p>
            2024년 경주결과 {raceData.length.toLocaleString()}건 분석 결과,
            평균 단승 배당은 <strong>{danseung.평균}배</strong>,
            쌍승 <strong>{ssangseung.평균}배</strong>,
            삼쌍승 <strong>{samssangseung.평균}배</strong>입니다.
            단승 최고 배당은 <strong>{danseung.최대}배</strong>로 기록되었습니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">2. 경륜장별 배당 차이</h4>
          <p>
            단승 평균 배당이 가장 높은 경륜장은{" "}
            <strong className="text-blue-600">{highestOddsVenue.경륜장}({highestOddsVenue.단승}배)</strong>이며,
            가장 낮은 곳은{" "}
            <strong>{lowestOddsVenue.경륜장}({lowestOddsVenue.단승}배)</strong>입니다.
            삼쌍승 기준으로도 경륜장 간 배당 차이가 존재하며,
            이는 각 경륜장의 선수 구성과 경주 특성에 따른 차이로 볼 수 있습니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">3. 이변 발생 빈도</h4>
          <p>
            단승 10배 이상의 이변은 전체 경주의{" "}
            <strong>{overallUpset.이변빈도}%</strong>에서 발생합니다.
            경륜장별로는 {highestUpsetVenue.경륜장}이{" "}
            <strong>{highestUpsetVenue.이변빈도}%</strong>로 가장 높고,{" "}
            {lowestUpsetVenue.경륜장}이{" "}
            <strong>{lowestUpsetVenue.이변빈도}%</strong>로 가장 낮습니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">4. 팬을 위한 시사점</h4>
          <p>
            단승은 평균 {danseung.평균}배로 비교적 안정적이지만,
            쌍승·삼쌍승은 변동 폭이 크므로 리스크 관리가 중요합니다.
            경륜장별 배당 특성을 파악하고, 본인의 투표 성향에 맞는
            경륜장과 승식을 선택하는 것이 효과적입니다.
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          {isRealData
            ? "* 본 분석은 공공데이터포털(data.go.kr) 경륜 경주결과 API의 실제 데이터를 기반으로 합니다. 등급별 분석은 정확한 데이터 확보 후 제공 예정입니다."
            : "* 데이터가 로드되지 않았습니다. API 키 설정 후 npm run fetch-data를 실행해 주세요."}
        </div>
      </CardContent>
    </Card>
  );
}
