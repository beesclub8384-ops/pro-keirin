import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const analyses = [
  {
    id: 1,
    category: "배당률",
    title: "특선급 배당률이 정말 낮을까? 1년 데이터 분석 결과",
    date: "2026.02.25",
    categoryColor: "bg-brand text-white border-brand",
  },
  {
    id: 2,
    category: "이변",
    title: "고배당 이변은 언제 터지나 - 등급별 이변 빈도 분석",
    date: "2026.02.22",
    categoryColor: "bg-amber-500 text-white border-amber-500",
  },
  {
    id: 3,
    category: "선수",
    title: "2026 상반기 선행 vs 추입 전법별 성적 비교",
    date: "2026.02.20",
    categoryColor: "bg-emerald-500 text-white border-emerald-500",
  },
  {
    id: 4,
    category: "배당률",
    title: "삼쌍승 고배당 패턴 - 경륜장별 차이 분석",
    date: "2026.02.18",
    categoryColor: "bg-brand text-white border-brand",
  },
  {
    id: 5,
    category: "트렌드",
    title: "월별 배당률 추이로 본 경륜 시즌 패턴",
    date: "2026.02.15",
    categoryColor: "bg-violet-500 text-white border-violet-500",
  },
];

export default function LatestNews() {
  return (
    <section className="bg-muted/50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">최신 분석</h2>
            <p className="mt-1 text-sm text-muted-foreground">AI 기반 경륜 데이터 분석 리포트</p>
          </div>
          <Link
            href="/analysis/odds"
            className="hidden sm:flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            전체 보기 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Analysis List */}
        <div className="rounded-xl border bg-card">
          {analyses.map((item, index) => (
            <Link
              key={item.id}
              href="/analysis/odds"
              className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors ${
                index !== analyses.length - 1 ? "border-b" : ""
              }`}
            >
              <Badge className={`${item.categoryColor} shrink-0 text-xs`}>
                {item.category}
              </Badge>
              <span className="flex-1 truncate text-sm font-medium text-foreground">
                {item.title}
              </span>
              <span className="hidden sm:block shrink-0 text-xs text-muted-foreground">
                {item.date}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>

        {/* Mobile: View All Link */}
        <div className="mt-4 sm:hidden text-center">
          <Link
            href="/analysis/odds"
            className="text-sm font-medium text-brand hover:underline"
          >
            전체 분석 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
