import Link from "next/link";
import { ChevronLeft, MapPin, Award } from "lucide-react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import RacerAvatar from "@/components/RacerAvatar";
import { fetchInterviewsByDate } from "@/lib/interview";

/** 본문 시작이 "# 헤드라인" 형식이면 제거 (헤드라인은 별도 필드에서 표시) */
function stripLeadingHeadline(article: string): string {
  return article.replace(/^#\s+.+\n+/, "");
}

/** [PHOTO_1]~[PHOTO_N]을 photos 배열의 실제 이미지 마크다운으로 치환 */
function replacePhotoTags(article: string, photos?: string[]): string {
  return article.replace(/\[PHOTO_(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (photos && photos[idx]) {
      return `![인터뷰 사진 ${num}](${photos[idx]})`;
    }
    return "";
  });
}

/** 📊 분석 노트 섹션을 본문에서 분리 */
function splitAnalysisNote(md: string): {
  main: string;
  analysis: string | null;
} {
  const hrIdx = md.lastIndexOf("\n---\n");
  if (hrIdx === -1) return { main: md, analysis: null };
  const after = md.slice(hrIdx + 5).trim();
  if (after.includes("📊")) {
    return { main: md.slice(0, hrIdx), analysis: after };
  }
  return { main: md, analysis: null };
}

/** 본문 마크다운 컴포넌트 — 매거진 스타일 */
const mdComponents: Components = {
  h1: (props) => (
    <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight text-foreground mt-1 mb-5">
      {props.children}
    </h1>
  ),
  h2: (props) => (
    <h2 className="text-lg sm:text-xl font-semibold text-muted-foreground mt-10 mb-3 leading-snug">
      {props.children}
    </h2>
  ),
  h3: (props) => (
    <h3 className="text-base sm:text-lg font-semibold text-foreground mt-8 mb-2">
      {props.children}
    </h3>
  ),
  p: (props) => {
    const children = props.children;
    let firstText = "";
    if (typeof children === "string") {
      firstText = children;
    } else if (Array.isArray(children) && typeof children[0] === "string") {
      firstText = children[0];
    }
    const isAnswer = /^A\.\s/.test(firstText.trim());
    return (
      <p
        className={
          isAnswer
            ? "text-[15px] sm:text-base leading-[1.85] text-blue-700 mb-5"
            : "text-[15px] sm:text-base leading-[1.85] text-foreground/85 mb-5"
        }
      >
        {props.children}
      </p>
    );
  },
  img: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src}
      alt={props.alt || ""}
      className="block mx-auto my-10 w-[87%] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)]"
    />
  ),
  strong: (props) => (
    <strong className="font-bold text-foreground">{props.children}</strong>
  ),
  hr: () => <hr className="my-10 border-border" />,
  blockquote: (props) => (
    <blockquote className="border-l-4 border-brand/30 pl-4 my-6 italic text-muted-foreground">
      {props.children}
    </blockquote>
  ),
  a: (props) => (
    <a
      href={props.href}
      className="text-brand hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  ),
};

/** 📊 분석 노트용 컴포넌트 — 작고 밀도 있는 스타일 */
const analysisComponents: Components = {
  p: (props) => (
    <p className="text-sm leading-relaxed text-muted-foreground mb-2 last:mb-0">
      {props.children}
    </p>
  ),
  strong: (props) => (
    <strong className="font-semibold text-foreground">{props.children}</strong>
  ),
};

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
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ player?: string }>;
}) {
  const { date } = await params;
  const { player } = await searchParams;
  const allArticles = await fetchInterviewsByDate(date);
  const articles = player
    ? allArticles.filter((a) => a.playerName === player)
    : allArticles;

  const displayDate = date.replace(
    /(\d{4})-(\d{2})-(\d{2})/,
    "$1년 $2월 $3일",
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          href="/interview"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          달력으로 돌아가기
        </Link>
      </div>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          {player ? `${player} 인터뷰` : `${displayDate} 인터뷰`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {player ? displayDate : `${articles.length}건의 인터뷰 기사`}
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
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-4",
              )}
            >
              달력으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {articles.map((article, i) => {
            const processed = replacePhotoTags(
              stripLeadingHeadline(article.article),
              article.photos,
            );
            const { main, analysis } = splitAnalysisNote(processed);

            return (
              <Card
                key={`${article.playerName}-${i}`}
                className="overflow-hidden"
              >
                <CardContent className="px-6 py-8 sm:px-10 sm:py-10">
                  {/* Player info header */}
                  <div className="mb-8 flex flex-wrap items-center gap-3 border-b pb-5">
                    <RacerAvatar name={article.playerName} photoUrl={article.photoUrl} size={44} />
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

                  {/* Article body */}
                  <article>
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={mdComponents}
                    >
                      {main}
                    </Markdown>
                  </article>

                  {/* 📊 Analysis note */}
                  {analysis && (
                    <div className="mt-8 rounded-xl bg-slate-50 border border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={analysisComponents}
                      >
                        {analysis}
                      </Markdown>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
