"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // 기본 사이트 네비/헤더/푸터를 제거하고 독립 화면으로 표시할 경로
  const isChromeless =
    pathname.startsWith("/interview") || pathname.startsWith("/vote");

  if (isChromeless) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <Header />
      <main className="min-h-screen">{children}</main>
      <Footer />
    </>
  );
}
