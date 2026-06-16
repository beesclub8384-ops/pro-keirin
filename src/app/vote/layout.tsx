import type { Metadata } from "next";

// 투표 전용 레이아웃.
// - 기본 사이트 네비게이션/헤더/푸터는 LayoutShell 에서 /vote 경로를 제외하여 제거됨
// - 이 레이아웃은 다른 카테고리/링크 없이 투표 화면만 깨끗한 배경으로 표시한다
// - 공개 색인 방지(noindex): 투표 링크는 비공개 토큰 링크이므로 검색 노출 차단

export const metadata: Metadata = {
  title: "투표",
  robots: { index: false, follow: false },
};

export default function VoteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
