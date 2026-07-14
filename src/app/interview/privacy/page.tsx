import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = {
  title: "개인정보처리방침 | 7RANDOMS 인터뷰",
  description: "7RANDOMS 인터뷰 앱 개인정보처리방침",
};

const textShadow = "0 2px 4px rgba(0,0,0,0.5)";
const textShadowSm = "0 1px 3px rgba(0,0,0,0.5)";

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-2 text-base font-bold text-foreground">
        <span className="text-brand">{n}.</span>
        {title}
      </h2>
      <div className="text-sm leading-relaxed text-foreground/80">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* 뒤로가기 */}
      <div className="mb-6">
        <Link
          href="/interview"
          className="inline-flex items-center gap-1 text-sm font-medium text-white/70 transition-colors hover:text-white"
          style={{ textShadow }}
        >
          <ChevronLeft className="h-4 w-4" />
          돌아가기
        </Link>
      </div>

      <h1
        className="mb-2 text-2xl font-bold text-white sm:text-3xl"
        style={{ textShadow }}
      >
        개인정보처리방침
      </h1>
      <p className="mb-8 text-sm text-white/70" style={{ textShadow: textShadowSm }}>
        7RANDOMS 인터뷰
      </p>

      <div className="rounded-xl bg-white/95 px-5 py-6 shadow-lg backdrop-blur-sm sm:px-8 sm:py-9">
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          7RANDOMS 인터뷰 앱(이하 &lsquo;서비스&rsquo;)은 이용자의 개인정보를
          중요하게 생각하며, 관련 법령에 따라 개인정보를 안전하게 처리하기 위해
          아래와 같이 개인정보처리방침을 수립·공개합니다.
        </p>

        <div className="space-y-8">
          <Section n={1} title="수집하는 개인정보 항목">
            서비스는 인터뷰 진행을 위해 다음의 개인정보를 수집합니다.
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>선수 이름</li>
              <li>등급</li>
              <li>소속(훈련지)</li>
              <li>인터뷰 답변(텍스트)</li>
              <li>사진</li>
            </ul>
          </Section>

          <Section n={2} title="개인정보의 수집 및 이용 목적">
            수집한 개인정보는 <strong className="font-semibold text-foreground">인터뷰
            기사 작성 및 앱 내 공개</strong>를 위한 목적으로만 이용합니다.
          </Section>

          <Section n={3} title="개인정보의 보관 및 파기">
            수집한 개인정보는 서비스 운영 기간 동안 보관합니다. 이용자가 삭제를
            요청하는 경우 지체 없이 파기합니다.
          </Section>

          <Section n={4} title="개인정보의 제3자 제공">
            서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다.
          </Section>

          <Section n={5} title="이용자의 권리">
            이용자는 언제든지 본인의 개인정보에 대해 열람, 수정, 삭제를 요청할 수
            있습니다. 요청은 아래 연락처를 통해 접수하며, 서비스는 관련 법령에 따라
            지체 없이 처리합니다.
          </Section>

          <Section n={6} title="개인정보 보호책임자 및 연락처">
            개인정보 관련 문의 및 요청은 아래로 연락해 주시기 바랍니다.
            <p className="mt-2 rounded-lg bg-muted/60 px-4 py-3 text-foreground">
              프로경륜선수노동조합 (PKRU)
            </p>
          </Section>
        </div>

        <p className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
          시행일: 2026년 7월 14일
        </p>
      </div>
    </div>
  );
}
