"use client";

import { Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  raceData,
  isRealData,
  getAverageOddsByBetType,
  getAverageOddsByGrade,
  getUpsetFrequencyByGrade,
} from "@/data/odds-data";

export default function AiInsight() {
  const avgByBet = getAverageOddsByBetType(raceData);
  const avgByGrade = getAverageOddsByGrade(raceData);
  const upsets = getUpsetFrequencyByGrade(raceData);

  const danseung = avgByBet.find((d) => d.승식 === "단승")!;
  const ssangseung = avgByBet.find((d) => d.승식 === "쌍승")!;
  const bokseung = avgByBet.find((d) => d.승식 === "복승")!;
  const samssangseung = avgByBet.find((d) => d.승식 === "삼쌍승")!;

  const special = avgByGrade.find((d) => d.등급 === "특선")!;
  const excellent = avgByGrade.find((d) => d.등급 === "우수")!;
  const general = avgByGrade.find((d) => d.등급 === "선발")!;

  const overallUpset = upsets.find((d) => d.등급 === "전체")!;
  const specialUpset = upsets.find((d) => d.등급 === "특선")!;
  const generalUpset = upsets.find((d) => d.등급 === "선발")!;

  const diffPercent = Math.round((1 - special.단승 / general.단승) * 100);

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
          <h4 className="font-bold text-foreground mb-1">1. 특선급은 정말 배당이 낮은가?</h4>
          <p>
            <strong className="text-blue-600">결론: 맞습니다.</strong>{" "}
            광명 경륜장 {raceData.length.toLocaleString()}경주 실데이터 분석 결과,
            특선급 평균 단승 배당은 <strong>{special.단승}배</strong>로
            선발급 <strong>{general.단승}배</strong> 대비 약 <strong>{diffPercent}%</strong> 낮습니다.
            쌍승 기준으로도 특선급 {special.쌍승}배 vs 선발급 {general.쌍승}배로
            동일한 패턴을 보입니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">2. 승식별 평균 배당률</h4>
          <p>
            단승 <strong>{danseung.평균}배</strong>,
            쌍승 <strong>{ssangseung.평균}배</strong>,
            복승 <strong>{bokseung.평균}배</strong>,
            삼쌍승 <strong>{samssangseung.평균}배</strong>.
            단승 최고 배당은 <strong>{danseung.최대}배</strong>로 기록되었습니다.
            승식이 복잡할수록 배당과 리스크 모두 높아집니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">3. 이변 발생 빈도</h4>
          <p>
            단승 10배 이상의 이변은 전체 경주의{" "}
            <strong>{overallUpset.이변빈도}%</strong>에서 발생합니다.
            등급별로는 선발급이{" "}
            <strong>{generalUpset.이변빈도}%</strong>로 가장 높고,
            특선급이{" "}
            <strong>{specialUpset.이변빈도}%</strong>로 가장 낮습니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">4. 팬을 위한 시사점</h4>
          <p>
            특선급은 평균 {special.단승}배로 안정적이지만 수익성이 제한적입니다.
            선발급은 이변이 잦아 고배당 기회가 있지만 리스크도 높습니다.
            우수급({excellent.단승}배)은 두 그룹의 중간 성격으로,
            배당과 예측 가능성의 균형을 찾을 수 있는 등급입니다.
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          {isRealData
            ? "* 본 분석은 공공데이터포털(data.go.kr) 경주결과·출주표 API의 실제 데이터를 기반으로 합니다. 등급 정보는 출주표 API의 racer_grd_cd 값을 사용합니다."
            : "* 데이터가 로드되지 않았습니다. API 키 설정 후 npm run fetch-data를 실행해 주세요."}
        </div>
      </CardContent>
    </Card>
  );
}
