import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import LayoutShell from "@/components/LayoutShell";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "7randoms - 경륜 데이터 분석",
  description: "AI 기반 경륜 데이터 분석 플랫폼 - 배당률 분석, 선수 성적 통계, 경주 예측 인사이트",
  keywords: ["경륜", "경륜 분석", "배당률", "경주 예측", "선수 통계", "데이터 분석"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKR.variable} font-sans antialiased`}>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
