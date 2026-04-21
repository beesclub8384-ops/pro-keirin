import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '프로경륜선수노동조합 × 은행 금융협약 수요조사',
  description: '조합원 전용 익명 설문',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
