"use client";

import useSWR from "swr";
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

export default function InterviewPage() {
  const { data, error } = useSWR("interview-articles", fetchPublishedArticles, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1분간 동일 키 재요청 방지
  });

  // 최초 로딩(데이터 없음 + 에러 없음) → 스켈레톤
  if (!data && !error) return <InterviewSkeleton />;

  // 성공 시 기존 UI 그대로. 에러 시에도 빈 배열로 안전 렌더링.
  return <InterviewListClient articles={data ?? []} />;
}
