import Link from "next/link";
import { ChevronLeft, User, MapPin, Award } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchInterviewsByDate } from "@/lib/interview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return {
    title: `${date} 선수 인터뷰 | 7randoms`,
    description: `${date} 경륜 선수 인터뷰 기사`,
  };
}

export default async function InterviewDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const articles = await fetchInterviewsByDate(date);

  const displayDate = date.replace(
    /(\d{4})-(\d{2})-(\d{2})/,
    "$1년 $2월 $3일",
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          href="/interview"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}
        >
          <ChevronLeft className="h-4 w-4" />
          달력으로 돌아가기
        </Link>
      </div>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          {displayDate} 인터뷰
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {articles.length}건의 인터뷰 기사
        </p>
      </div>

      {/* Articles */}
      {articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              해당 날짜에 게시된 인터뷰가 없습니다
            </p>
            <Link
              href="/interview"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}
            >
              달력으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {articles.map((article, i) => (
            <Card key={`${article.playerName}-${i}`}>
              <CardContent className="p-6 sm:p-8">
                {/* Player info header */}
                <div className="mb-6 flex flex-wrap items-center gap-3 border-b pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-lg">{article.playerName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="gap-1">
                        <Award className="h-3 w-3" />
                        {article.grade}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {article.region}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Article content */}
                <article className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-a:text-brand">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {article.article}
                  </Markdown>
                </article>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
