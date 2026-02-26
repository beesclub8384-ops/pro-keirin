import { MessageCircle, Heart, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const posts = [
  {
    id: 1,
    category: "분석 토론",
    title: "특선급 배당 패턴, 최근 변화가 보이네요",
    author: "데이터분석러",
    date: "2시간 전",
    comments: 24,
    likes: 56,
  },
  {
    id: 2,
    category: "예측 공유",
    title: "이번 주 왕중왕전 예측 및 배당 분석",
    author: "경륜매니아",
    date: "5시간 전",
    comments: 18,
    likes: 42,
  },
  {
    id: 3,
    category: "초보 질문",
    title: "출주표에서 전법이 배당에 미치는 영향이 궁금합니다",
    author: "경륜입문자",
    date: "어제",
    comments: 31,
    likes: 15,
  },
];

export default function CommunityPreview() {
  return (
    <section className="bg-muted/50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">커뮤니티</h2>
            <p className="mt-1 text-sm text-muted-foreground">분석 토론과 예측 공유</p>
          </div>
          <Link
            href="/community"
            className="hidden sm:flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            더보기 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Community Posts Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.id} href={`/community/${post.id}`}>
              <Card className="h-full cursor-pointer hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <Badge variant="secondary" className="mb-3 text-xs">
                    {post.category}
                  </Badge>
                  <h3 className="mb-3 line-clamp-2 font-semibold text-foreground leading-snug">
                    {post.title}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span>{post.author}</span>
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> {post.comments}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Mobile: View All Link */}
        <div className="mt-4 sm:hidden text-center">
          <Link
            href="/community"
            className="text-sm font-medium text-brand hover:underline"
          >
            커뮤니티 바로가기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
