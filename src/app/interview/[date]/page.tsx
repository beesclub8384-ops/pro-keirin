"use client";

import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ChevronLeft, MapPin, Play, RefreshCw } from "lucide-react";
import {
  extractRaceInfo,
  buildRaceVideoUrl,
  type RaceInfo,
} from "@/lib/race-video";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import GradeBadge from "@/components/GradeBadge";
import type { InterviewArticle } from "@/lib/interview";
import { fetchArticlesByDate, lookupRaceDate } from "@/lib/interview-client";

/** 본문 시작이 "# 헤드라인" 형식이면 제거 (헤드라인은 카드 헤더의 선수 정보와 중복) */
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

interface QABlock {
  question: string;
  answer: string;
}

/**
 * 본문을 Q+A 블록 단위로 파싱.
 * - "Q." 으로 시작하는 줄에서 새 블록 시작
 * - "A." 등장 후 다음 "Q." 직전까지의 모든 라인(사진/공백 포함)은 직전 블록의 answer에 귀속
 * - 첫 Q. 이전 라인(preamble)은 버린다 — stripLeadingHeadline 후엔 보통 비어 있음
 */
function parseQABlocks(text: string): QABlock[] {
  const lines = text.split("\n");
  const blocks: QABlock[] = [];
  let qLines: string[] = [];
  let aLines: string[] = [];
  let mode: "q" | "a" | null = null;
  let inBlock = false;

  const flush = () => {
    if (!inBlock) return;
    blocks.push({
      question: qLines.join("\n").trim(),
      answer: aLines.join("\n").trim(),
    });
    qLines = [];
    aLines = [];
    mode = null;
    inBlock = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Q\.\s/.test(trimmed)) {
      flush();
      inBlock = true;
      mode = "q";
      qLines.push(line);
    } else if (/^A\.\s/.test(trimmed) && inBlock) {
      mode = "a";
      aLines.push(line);
    } else if (inBlock) {
      if (mode === "q") qLines.push(line);
      else aLines.push(line);
    }
  }
  flush();
  return blocks;
}

const dateKey = (info: Pick<RaceInfo, "year" | "round" | "day">) =>
  `${info.year}-${info.round}-${info.day}`;

/**
 * Q. 단락 사전 스캔 — 본문에 날짜가 빠진 창원 경주만 (year, round, day) 키로 모아
 * decision_card_pages에서 일괄 조회. URL 빌드 시 fallbackDate로 주입한다.
 */
async function resolveChangwonDates(
  articles: InterviewArticle[],
): Promise<Map<string, string>> {
  const needed = new Set<string>();
  for (const article of articles) {
    const blocks = parseQABlocks(
      replacePhotoTags(stripLeadingHeadline(article.article), article.photos),
    );
    for (const block of blocks) {
      const info = extractRaceInfo(block.question);
      if (!info || info.venue !== "창원") continue;
      if (info.month !== null && info.dayOfMonth !== null) continue;
      needed.add(dateKey(info));
    }
  }
  const result = new Map<string, string>();
  await Promise.all(
    Array.from(needed).map(async (key) => {
      const [y, r, d] = key.split("-").map(Number);
      const date = await lookupRaceDate(y, r, d);
      if (date) result.set(key, date);
    }),
  );
  return result;
}

/** 블록 내부용 — Q/A 감지 로직 없이 단순 마크다운 렌더 (색상은 부모 div에서 상속) */
const blockMdComponents: Components = {
  p: (props) => (
    <p className="text-[15px] sm:text-base leading-[1.85] mb-3 last:mb-0">
      {props.children}
    </p>
  ),
  img: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src}
      alt={props.alt || ""}
      loading="lazy"
      decoding="async"
      className="block mx-auto my-4 w-[87%] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)]"
    />
  ),
  strong: (props) => <strong className="font-bold">{props.children}</strong>,
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

/** 상세 페이지 로딩 스켈레톤 (회색 박스 펄스) */
function InterviewDateSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12 animate-pulse">
      <div className="mb-6 h-8 w-40 rounded bg-muted" />
      <div className="mb-8">
        <div className="h-8 w-56 rounded bg-muted" />
        <div className="mt-2 h-4 w-32 rounded bg-muted/70" />
      </div>
      <div className="space-y-10">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-white px-6 py-8 shadow-sm"
          >
            <div className="mb-8 flex items-center gap-3 border-b pb-5">
              <div className="h-11 w-11 rounded-full bg-muted" />
              <div>
                <div className="h-5 w-24 rounded bg-muted" />
                <div className="mt-2 h-4 w-32 rounded bg-muted/70" />
              </div>
            </div>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="rounded-xl border border-border/50 bg-white px-5 py-4"
                >
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="mt-3 h-4 w-full rounded bg-muted/60" />
                  <div className="mt-2 h-4 w-5/6 rounded bg-muted/60" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const swrOpts = { revalidateOnFocus: false, dedupingInterval: 60000 } as const;

export default function InterviewDatePage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ player?: string }>;
}) {
  const { date } = use(params);
  const { player } = use(searchParams);

  const { data: allArticles, error: articlesError, mutate } = useSWR(
    ["interview-by-date", date],
    () => fetchArticlesByDate(date),
    swrOpts,
  );

  const filtered = allArticles
    ? player
      ? allArticles.filter((a) => a.playerName === player)
      : allArticles
    : undefined;

  // 창원 경주(본문 날짜 누락) 영상 URL 보정용 날짜맵 — 기사 로드 후 조회
  const { data: dateMapData, error: dateMapError } = useSWR(
    filtered ? ["interview-changwon-dates", date, player ?? ""] : null,
    () => resolveChangwonDates(filtered as InterviewArticle[]),
    swrOpts,
  );

  // 로드 실패 → 에러 메시지 + 다시 시도 (무음 실패 방지)
  if (articlesError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
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
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-red-500">
              데이터를 불러오지 못했습니다. 다시 시도해주세요.
            </p>
            <button
              type="button"
              onClick={() => mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 기사 로딩 중 → 스켈레톤
  if (!allArticles && !articlesError) return <InterviewDateSkeleton />;
  // 기사는 있으나 날짜맵 조회 중 → 스켈레톤 (서버 렌더와 동일 결과 보장)
  if (filtered && filtered.length > 0 && !dateMapData && !dateMapError) {
    return <InterviewDateSkeleton />;
  }

  const articles = filtered ?? [];
  const dateMap = dateMapData ?? new Map<string, string>();

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
            const blocks = parseQABlocks(main);

            return (
              <Card
                key={`${article.playerName}-${i}`}
                className="overflow-hidden"
              >
                <CardContent className="px-6 py-8 sm:px-10 sm:py-10">
                  {/* Player info header */}
                  <div className="mb-8 flex flex-wrap items-center gap-3 border-b pb-5">
                    <div>
                      <p className="flex items-center gap-1.5 font-bold text-lg">
                        <GradeBadge grade={article.grade} size={22} />
                        {article.playerName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {article.region}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Q&A blocks */}
                  <article className="space-y-4">
                    {blocks.map((block, bi) => {
                      const info = extractRaceInfo(block.question);
                      const fallback =
                        info && info.venue === "창원"
                          ? dateMap.get(dateKey(info)) ?? null
                          : null;
                      const fullUrl = info
                        ? buildRaceVideoUrl(info, fallback, "F")
                        : null;
                      const halfUrl = info
                        ? buildRaceVideoUrl(info, fallback, "M")
                        : null;

                      return (
                        <div
                          key={bi}
                          className="rounded-xl border border-border/50 bg-white px-5 py-4 shadow-sm"
                        >
                          <div className="font-semibold text-foreground">
                            <Markdown
                              remarkPlugins={[remarkGfm]}
                              components={blockMdComponents}
                            >
                              {block.question}
                            </Markdown>
                          </div>
                          {block.answer && (
                            <div className="mt-3 text-blue-700">
                              <Markdown
                                remarkPlugins={[remarkGfm]}
                                components={blockMdComponents}
                              >
                                {block.answer}
                              </Markdown>
                            </div>
                          )}
                          {info && fullUrl && (
                            <div className="not-prose mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3">
                              <div className="mb-3 flex items-center gap-3">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white">
                                  <Play className="h-4 w-4 fill-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium text-muted-foreground">
                                    해당 경주 영상
                                  </div>
                                  <div className="truncate text-sm font-semibold text-foreground">
                                    {info.venue} {info.round}회 {info.day}일차{" "}
                                    {info.raceNo}경주
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <a
                                  href={fullUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
                                >
                                  <Play className="h-3.5 w-3.5 fill-white" />
                                  전체재생
                                </a>
                                {halfUrl && (
                                  <a
                                    href={halfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand/40 bg-white px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                    유도원 퇴피후
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
