import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const news = [
  {
    id: 1,
    category: "공지",
    title: "2026년 상반기 경주 일정 안내",
    date: "2026.02.20",
    categoryColor: "bg-keirin-red text-white border-keirin-red",
  },
  {
    id: 2,
    category: "뉴스",
    title: "프로경륜선수노동조합, 선수 복지 개선안 발표",
    date: "2026.02.18",
    categoryColor: "bg-blue-500 text-white border-blue-500",
  },
  {
    id: 3,
    category: "이벤트",
    title: "경륜 팬 감사 이벤트 - 스피돔 관람 초대권 증정",
    date: "2026.02.15",
    categoryColor: "bg-keirin-gold text-keirin-dark border-keirin-gold",
  },
  {
    id: 4,
    category: "뉴스",
    title: "SS급 김선수, 통산 200승 달성 기념 인터뷰",
    date: "2026.02.12",
    categoryColor: "bg-blue-500 text-white border-blue-500",
  },
  {
    id: 5,
    category: "공지",
    title: "경륜장 주차장 이용 안내 변경 사항",
    date: "2026.02.10",
    categoryColor: "bg-keirin-red text-white border-keirin-red",
  },
];

export default function LatestNews() {
  return (
    <section className="bg-muted/50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">최신 소식</h2>
            <p className="mt-1 text-sm text-muted-foreground">조합 공지사항과 경륜 뉴스</p>
          </div>
          <Link
            href="/news"
            className="hidden sm:flex items-center gap-1 text-sm font-medium text-keirin-red hover:underline"
          >
            전체 보기 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* News List */}
        <div className="rounded-xl border bg-card">
          {news.map((item, index) => (
            <Link
              key={item.id}
              href={`/news/${item.id}`}
              className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors ${
                index !== news.length - 1 ? "border-b" : ""
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
            href="/news"
            className="text-sm font-medium text-keirin-red hover:underline"
          >
            전체 소식 보기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
