import { Badge } from "@/components/ui/badge";
import OddsSummaryCards from "@/components/analysis/OddsSummaryCards";
import OddsBarChart from "@/components/analysis/OddsBarChart";
import OddsDistribution from "@/components/analysis/OddsDistribution";
import OddsUpsetFrequency from "@/components/analysis/OddsUpsetFrequency";
import OddsTrend from "@/components/analysis/OddsTrend";
import AiInsight from "@/components/analysis/AiInsight";
import { isRealData, raceData } from "@/data/odds-data";

export const metadata = {
  title: "등급별 배당률 분석 | 7randoms",
  description: "경륜 등급별 배당률 데이터 분석 — 특선급이 정말 배당이 낮은가?",
};

export default function OddsAnalysisPage() {
  // 데이터 기간 자동 계산
  const dates = raceData.map((r) => r.date).sort();
  const periodStart = dates[0]?.substring(0, 7).replace("-", ".") ?? "2024.03";
  const periodEnd = dates[dates.length - 1]?.substring(0, 7).replace("-", ".") ?? "2025.02";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      {/* Page Header */}
      <div className="mb-8 sm:mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-brand text-white border-brand">데이터 분석</Badge>
          <Badge variant="outline">1차 과제</Badge>
          {!isRealData && (
            <Badge variant="outline" className="border-amber-400 text-amber-600">샘플 데이터</Badge>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          등급별 배당률 분석
        </h1>
        <p className="mt-2 text-base sm:text-lg text-muted-foreground">
          &ldquo;특선급이 정말 배당이 낮은가?&rdquo; — 1년치 경주 데이터로 검증합니다
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">분석 기간: {periodStart} ~ {periodEnd}</span>
          <span className="rounded-full bg-muted px-3 py-1">경륜장: 광명 / 부산 / 창원</span>
          <span className="rounded-full bg-muted px-3 py-1">등급: 특선(SS~S3) / 우수(A1~A3) / 선발(B1~B3)</span>
          <span className="rounded-full bg-muted px-3 py-1">총 {raceData.length.toLocaleString()}경주</span>
        </div>
      </div>

      {/* Summary Cards */}
      <section className="mb-8">
        <OddsSummaryCards />
      </section>

      {/* Charts Section */}
      <section className="mb-8 grid gap-6 lg:grid-cols-2">
        <OddsBarChart />
        <OddsDistribution />
      </section>

      <section className="mb-8 grid gap-6 lg:grid-cols-2">
        <OddsUpsetFrequency />
        <OddsTrend />
      </section>

      {/* AI Insight */}
      <section className="mb-8">
        <AiInsight />
      </section>

      {/* Data Methodology */}
      <section className="rounded-xl border bg-muted/30 p-5 sm:p-6 text-sm text-muted-foreground">
        <h3 className="mb-3 font-bold text-foreground">분석 방법론</h3>
        <ul className="space-y-2 list-disc list-inside">
          <li>
            <strong>데이터 출처:</strong>{" "}
            {isRealData
              ? "공공데이터포털(data.go.kr) 경륜 경주결과 API"
              : "한국 경륜 통계 패턴 기반 샘플 데이터 (API 연동 시 실데이터로 교체됨)"}
          </li>
          <li>
            <strong>분석 기간:</strong> {periodStart} ~ {periodEnd}
          </li>
          <li>
            <strong>등급 분류:</strong> 특선(SS, S1~S3), 우수(A1~A3), 선발(B1~B3)의 3개 그룹
          </li>
          <li>
            <strong>배당 구간:</strong> 단승 기준 저배당(~5배) / 중배당(5~20배) / 고배당(20배~)
          </li>
          <li>
            <strong>이변 정의:</strong> 단승 배당 10배 이상인 경우
          </li>
        </ul>
      </section>
    </div>
  );
}
