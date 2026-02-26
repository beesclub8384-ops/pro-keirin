import { Badge } from "@/components/ui/badge";
import OddsSummaryCards from "@/components/analysis/OddsSummaryCards";
import OddsBarChart from "@/components/analysis/OddsBarChart";
import OddsDistribution from "@/components/analysis/OddsDistribution";
import OddsUpsetFrequency from "@/components/analysis/OddsUpsetFrequency";
import OddsTrend from "@/components/analysis/OddsTrend";
import AiInsight from "@/components/analysis/AiInsight";
import { isRealData, raceData } from "@/data/odds-data";

export const metadata = {
  title: "배당률 분석 | 7randoms",
  description: "경륜 배당률 데이터 분석 — 경륜장별·승식별 배당 패턴 분석",
};

export default function OddsAnalysisPage() {
  const dates = raceData.map((r) => r.date).sort();
  const periodStart = dates[0]?.substring(0, 7).replace("-", ".") ?? "";
  const periodEnd = dates[dates.length - 1]?.substring(0, 7).replace("-", ".") ?? "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      {/* Page Header */}
      <div className="mb-8 sm:mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-brand text-white border-brand">데이터 분석</Badge>
          <Badge variant="outline">1차 과제</Badge>
          {!isRealData && (
            <Badge variant="outline" className="border-amber-400 text-amber-600">데이터 없음</Badge>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          배당률 분석
        </h1>
        <p className="mt-2 text-base sm:text-lg text-muted-foreground">
          경륜장별·승식별 배당 패턴을 실제 경주결과 데이터로 분석합니다
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">분석 기간: {periodStart} ~ {periodEnd}</span>
          <span className="rounded-full bg-muted px-3 py-1">경륜장: 광명 / 부산 / 창원</span>
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
            <strong>데이터 출처:</strong> data.go.kr 공공 API 기반 2024년 실제 경주결과 {raceData.length.toLocaleString()}건
          </li>
          <li>
            <strong>분석 기간:</strong> {periodStart} ~ {periodEnd}
          </li>
          <li>
            <strong>분석 축:</strong> 경륜장별(광명/부산/창원), 승식별(단승/쌍승/삼쌍승)
          </li>
          <li>
            <strong>배당 구간:</strong> 단승 기준 저배당(~5배) / 중배당(5~20배) / 고배당(20배~)
          </li>
          <li>
            <strong>이변 정의:</strong> 단승 배당 10배 이상인 경우
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground/70">
          * 등급별 분석(특선/우수/선발)은 정확한 등급 데이터 확보 후 제공 예정입니다.
        </p>
      </section>
    </div>
  );
}
