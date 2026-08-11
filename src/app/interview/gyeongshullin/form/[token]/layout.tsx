import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "7randoms 맛집 추천",
  description: "경륜 선수가 추천하는 진짜 맛집 - 륜슐랭",
  openGraph: {
    title: "7randoms 맛집 추천",
    description: "경륜 선수가 추천하는 진짜 맛집 - 륜슐랭",
    type: "website",
  },
};

export default function GyeongshullinFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
