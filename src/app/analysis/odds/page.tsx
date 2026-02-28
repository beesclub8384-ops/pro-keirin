import { Badge } from "@/components/ui/badge";
import OddsBarChart from "@/components/analysis/OddsBarChart";
import { isRealData, raceData } from "@/data/odds-data";

export const metadata = {
  title: "배당률 분석 | 7randoms",
  description: "경륜 등급별 배당률 데이터 분석 — 특선급이 정말 배당이 낮은가?",
};

export default function OddsAnalysisPage() {
  const dates = raceData.map((r) => r.date).sort();
  const periodStart = dates[0]?.substring(0, 7).replace("-", ".") ?? "";
  const periodEnd = dates[dates.length - 1]?.substring(0, 7).replace("-", ".") ?? "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      {/* Page Header */}
      <div className="mb-8 sm:mb-10">
        {!isRealData && (
          <div className="mb-3">
            <Badge variant="outline" className="border-amber-400 text-amber-600">데이터 없음</Badge>
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          등급별 배당률 분석
        </h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1">분석 기간: {periodStart} ~ {periodEnd}</span>
          <span className="rounded-full bg-muted px-3 py-1">경륜장: 광명</span>
          <span className="rounded-full bg-muted px-3 py-1">등급: 선발 / 우수 / 특선</span>
          <span className="rounded-full bg-muted px-3 py-1">총 {raceData.length.toLocaleString()}경주</span>
        </div>
      </div>

      {/* Chart */}
      <section className="mb-8">
        <OddsBarChart />
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
            <strong>분석 축:</strong> 등급별(선발/우수/특선), 승식별(단승/연승1착/연승2착/복승/쌍승/삼복승/쌍복승/삼쌍승)
          </li>
          <li>
            <strong>등급 출처:</strong> 출주표 API(racer_grd_cd) 실제 값 사용
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground/70">
          * 현재 광명 경륜장 데이터만 포함되어 있습니다. 부산/창원 데이터는 출주표 API 제공 범위 확대 시 추가 예정입니다.
        </p>
      </section>
    </div>
  );
}
