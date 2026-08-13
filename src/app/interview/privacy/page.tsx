import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = {
  // 레이아웃 template("%s | 7RANDOMS")이 적용되어 "개인정보처리방침 | 7RANDOMS"로 표시됨
  title: "개인정보처리방침",
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

/** 소제목 — 대상별(일반 이용자 / 인터뷰 참여 선수)로 나눠 쓰는 단락 머리 */
function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>
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
          7RANDOMS 인터뷰(이하 &lsquo;본 앱&rsquo;)는 개인정보 보호법 등 관련
          법령을 준수하며, 이용자의 개인정보를 보호하기 위해 다음과 같이
          개인정보처리방침을 수립·공개합니다.
        </p>

        <div className="space-y-8">
          <Section n={1} title="수집하는 개인정보 항목 및 수집 방법">
            <div className="space-y-4">
              <div>
                <SubHead>일반 이용자(팬)</SubHead>
                <p>
                  본 앱은 일반 이용자의 개인정보를 수집하지 않습니다. 회원가입,
                  로그인 절차가 없으며, 이용자의 이름, 연락처, 위치정보 등을
                  수집·저장하지 않습니다.
                </p>
              </div>
              <div>
                <SubHead>인터뷰 참여 선수</SubHead>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    수집 항목: 이름, 소속(훈련지), 등급, 인터뷰 답변 내용, 선수가
                    직접 첨부한 사진
                  </li>
                  <li>
                    수집 방법: 선수가 인터뷰 요청 링크를 통해 직접 입력·제출
                  </li>
                </ul>
                <p className="mt-2">
                  인터뷰 답변 제출은 선수의 자발적 참여로 이루어지며, 제출된
                  내용은 본 앱에 기사 형태로 공개됩니다.
                </p>
              </div>
            </div>
          </Section>

          <Section n={2} title="개인정보의 처리 목적">
            <ul className="list-disc space-y-1 pl-5">
              <li>인터뷰 기사 작성 및 본 앱 내 공개</li>
              <li>선수 소개(팀 페이지) 및 등급 정보 표시</li>
            </ul>
          </Section>

          <Section n={3} title="개인정보의 보관 및 파기">
            <ul className="list-disc space-y-1 pl-5">
              <li>보관 장소: 대한민국 내 서버(Supabase 서울 리전)</li>
              <li>
                보관 기간: 서비스 운영 기간 동안 보관하며, 선수 본인의 삭제 요청
                시 지체 없이 삭제합니다.
              </li>
              <li>
                게시가 종료되거나 삭제 요청이 접수된 정보는 복구 불가능한 방법으로
                파기합니다.
              </li>
            </ul>
          </Section>

          <Section n={4} title="개인정보의 제3자 제공">
            본 앱은 이용자의 개인정보를{" "}
            <strong className="font-semibold text-foreground">
              제3자에게 판매·제공하지 않습니다.
            </strong>
          </Section>

          <Section n={5} title="개인정보 처리의 위탁 및 국외 이전">
            서비스 운영을 위해 아래 서비스를 이용하며, 이 과정에서 일부 데이터가
            처리됩니다.
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="font-semibold text-foreground">
                  Supabase
                </strong>
                (데이터베이스·사진 저장): 대한민국(서울) 리전에 저장
              </li>
              <li>
                <strong className="font-semibold text-foreground">Vercel</strong>
                (웹 호스팅): 서비스 제공 과정에서 접속 기록이 해외 서버를 경유할
                수 있음
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  Anthropic
                </strong>
                (AI 맞춤법 교정): 기사 텍스트가 교정 목적으로 일시 전송되며
                저장되지 않음
              </li>
            </ul>
          </Section>

          <Section n={6} title="정보주체의 권리">
            인터뷰 참여 선수는 언제든지 다음 권리를 행사할 수 있습니다.
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>본인 인터뷰 기사 및 사진의 열람, 수정, 삭제 요청</li>
              <li>요청 방법: 프로경륜선수노동조합(PKRU)을 통해 연락</li>
            </ul>
            <p className="mt-2">요청 접수 시 지체 없이 조치합니다.</p>
          </Section>

          <Section n={7} title="개인정보 보호를 위한 조치">
            <ul className="list-disc space-y-1 pl-5">
              <li>관리자 페이지 접근 제한(인증)</li>
              <li>인터뷰 요청 링크의 추측 불가능한 고유 토큰 사용</li>
              <li>데이터베이스 접근 권한 최소화</li>
            </ul>
          </Section>

          <Section n={8} title="개인정보 보호책임자">
            개인정보 관련 문의 및 요청은 아래로 연락해 주시기 바랍니다.
            <p className="mt-2 rounded-lg bg-muted/60 px-4 py-3 text-foreground">
              운영 주체: 7RANDOMS (프로경륜선수노동조합 지원)
              <br />
              문의: 프로경륜선수노동조합 (PKRU)
            </p>
          </Section>

          <Section n={9} title="방침의 변경">
            본 방침이 변경되는 경우 앱 내 공지를 통해 안내합니다.
          </Section>
        </div>

        <div className="mt-10 space-y-1 border-t border-border pt-5 text-xs text-muted-foreground">
          <p>시행일: 2026년 7월 14일</p>
          <p>최종 개정일: 2026년 8월 13일</p>
        </div>
      </div>
    </div>
  );
}
