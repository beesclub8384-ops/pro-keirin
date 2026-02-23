"use client";

import { Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  raceData,
  getAverageOddsByGrade,
  getUpsetFrequency,
  getOddsDistribution,
} from "@/data/odds-data";

export default function AiInsight() {
  const avgOdds = getAverageOddsByGrade(raceData);
  const upsets = getUpsetFrequency(raceData);
  const dist = getOddsDistribution(raceData, "단승");

  const special = avgOdds.find((d) => d.등급 === "특선")!;
  const excellent = avgOdds.find((d) => d.등급 === "우수")!;
  const general = avgOdds.find((d) => d.등급 === "선발")!;

  const specialUpset = upsets.find((d) => d.등급 === "특선")!;
  const generalUpset = upsets.find((d) => d.등급 === "선발")!;

  const specialDist = dist.find((d) => d.등급 === "특선")!;
  const generalDist = dist.find((d) => d.등급 === "선발")!;

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
            <strong className="text-blue-600">결론: 맞습니다.</strong> 데이터 분석 결과, 특선급
            경주의 평균 단승 배당은 <strong>{special.단승}배</strong>로 선발급의{" "}
            <strong>{general.단승}배</strong> 대비 약 <strong>{diffPercent}%</strong> 낮은 것으로
            확인됩니다. 쌍승 기준으로도 특선급 {special.쌍승}배 vs 선발급 {general.쌍승}배로
            유사한 패턴을 보입니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">2. 배당 분포의 차이</h4>
          <p>
            특선급은 저배당(~5배) 비율이 <strong>{specialDist.저배당}%</strong>로 가장 높고,
            고배당(20배~) 비율은 <strong>{specialDist.고배당}%</strong>에 불과합니다. 반면
            선발급은 저배당 비율이 <strong>{generalDist.저배당}%</strong>, 고배당 비율이{" "}
            <strong>{generalDist.고배당}%</strong>로, 이변이 상대적으로 자주 발생합니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">3. 이변 발생 빈도</h4>
          <p>
            단승 10배 이상의 이변은 특선급에서{" "}
            <strong>{specialUpset.이변빈도}%</strong>, 선발급에서{" "}
            <strong>{generalUpset.이변빈도}%</strong>의 빈도로 발생합니다. 특선급도 약{" "}
            {specialUpset.이변횟수}회의 이변이 있었으며, 특선급이라고 해서 항상 예측
            가능한 것은 아닙니다.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-foreground mb-1">4. 팬을 위한 시사점</h4>
          <p>
            특선급 경주는 상위 선수 간 실력 격차가 작아 예측이 비교적 쉽지만, 배당이 낮은
            만큼 수익성도 제한적입니다. 선발급 경주는 이변이 잦아 고배당 기회가 있지만
            리스크도 높습니다. 우수급({excellent.단승}배)은 두 그룹의 중간 성격으로,
            적절한 배당과 예측 가능성의 균형을 찾을 수 있는 등급입니다.
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          * 본 분석은 실제 경륜 통계 패턴을 기반으로 구성한 샘플 데이터입니다.
          향후 kcycle.or.kr 실제 데이터 연동 시 더 정확한 분석이 가능합니다.
        </div>
      </CardContent>
    </Card>
  );
}
