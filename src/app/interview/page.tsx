"use client";

import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import InterviewListClient from "./_components/interview-list-client";
import { fetchPublishedArticles } from "@/lib/interview-client";

// 로딩 중 스켈레톤 (회색 박스 펄스 애니메이션)
function InterviewSkeleton() {
  return (
    <div className="animate-pulse">
      {/* 탭/검색 바 자리 */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-7 w-12 rounded bg-white/30" />
        <div className="h-7 w-12 rounded bg-white/20" />
        <div className="flex-1" />
        <div className="h-7 w-16 rounded bg-white/20" />
      </div>
      {/* 제목 자리 */}
      <div className="mb-8">
        <div className="h-8 w-40 rounded bg-white/30" />
        <div className="mt-3 h-4 w-64 rounded bg-white/20" />
      </div>
      {/* 카드 자리 */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-white/80 p-5 shadow-lg backdrop-blur-sm"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="h-5 w-24 rounded bg-muted" />
              <div className="h-5 w-10 rounded bg-muted/70" />
            </div>
            <div className="mb-2 h-4 w-3/4 rounded bg-muted/70" />
            <div className="h-3 w-20 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

// 로드 실패 시 에러 메시지 + 다시 시도 버튼 (무음 실패 방지)
function InterviewLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-white/95 py-16 text-center shadow-lg backdrop-blur-sm">
      <p className="mb-4 text-sm text-red-500">
        데이터를 불러오지 못했습니다. 다시 시도해주세요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
      >
        <RefreshCw className="h-4 w-4" />
        다시 시도
      </button>
    </div>
  );
}

export default function InterviewPage() {
  const { data, error, mutate } = useSWR(
    "interview-articles",
    fetchPublishedArticles,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1분간 동일 키 재요청 방지
    },
  );

  // 로드 실패 → 에러 메시지 + 다시 시도
  if (error) return <InterviewLoadError onRetry={() => mutate()} />;

  // 최초 로딩(데이터 없음 + 에러 없음) → 스켈레톤
  if (!data) return <InterviewSkeleton />;

  return <InterviewListClient articles={data} />;
}
