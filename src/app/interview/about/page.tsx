"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronDown } from "lucide-react";

const textShadow = "0 2px 4px rgba(0,0,0,0.5)";

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-white/95 shadow-lg backdrop-blur-sm px-5 py-6 sm:px-8 sm:py-8 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold text-foreground mb-4">{children}</h2>
  );
}

const RACE_STEPS = [
  {
    num: "1",
    title: "출발",
    desc: "7명의 선수가 출발선에 섭니다. 유도원이 앞에서 속도를 조절합니다.",
  },
  {
    num: "2",
    title: "유도 구간",
    desc: "유도원을 따라 대열을 형성합니다. 이때 각자의 전략에 맞게 라인을 형성합니다.",
  },
  {
    num: "3",
    title: "잔여 2바퀴 유도원 퇴피",
    desc: "유도원이 빠지고 본격적인 경주가 시작됩니다. (퇴피 시점은 규정 개정에 따라 달라질 수 있습니다)",
  },
  {
    num: "4",
    title: "골인",
    desc: "결승선을 먼저 통과하는 선수가 승리합니다.",
  },
];

const TACTICS = [
  {
    name: "선행",
    desc: "처음부터 앞서 달리는 전법. 지구력과 페이스가 핵심.",
    color: "bg-red-50 border-red-200",
    badge: "text-red-600 bg-red-100",
  },
  {
    name: "젖히기",
    desc: "마지막 주회 2코너에서 추월 시도.",
    color: "bg-orange-50 border-orange-200",
    badge: "text-orange-600 bg-orange-100",
  },
  {
    name: "추입",
    desc: "뒤에서 따라가다 마지막 직선구간에서 추월 시도.",
    color: "bg-blue-50 border-blue-200",
    badge: "text-blue-600 bg-blue-100",
  },
  {
    name: "마크",
    desc: "특정 선수 뒤에 붙어서 따라가며 뒤를 견제함.",
    color: "bg-green-50 border-green-200",
    badge: "text-green-600 bg-green-100",
  },
];

const BETTING_TYPES = [
  {
    name: "단승",
    stars: 1,
    probability: "1/7",
    short: "1등 맞추기",
    desc: "7명 중 1등을 맞추는 가장 단순한 방식!",
  },
  {
    name: "연승",
    stars: 1,
    probability: "2/7",
    short: "1~2등 안에 들면 OK",
    desc: "내가 고른 선수가 1등 또는 2등이면 적중.",
  },
  {
    name: "복승",
    stars: 2,
    probability: "1/21",
    short: "1,2등 2명 맞추기 (순서 무관)",
    desc: "",
  },
  {
    name: "쌍승",
    stars: 3,
    probability: "1/42",
    short: "1,2등 순서까지 맞추기",
    desc: "",
  },
  {
    name: "삼복승",
    stars: 2,
    probability: "1/35",
    short: "1,2,3등 3명 맞추기 (순서 무관)",
    desc: "3명을 고르지만 순서가 없어서, 순서까지 맞춰야 하는 쌍승보다 적중확률이 오히려 높습니다.",
  },
  {
    name: "쌍복승",
    stars: 4,
    probability: "1/105",
    short: "1~3등 중 1등 1명(정확히), 2,3등(순서 무관) 2명 맞추기",
    desc: "",
  },
  {
    name: "삼쌍승",
    stars: 5,
    probability: "1/210",
    short: "1,2,3등 순서까지 정확히!",
    desc: "가장 어렵지만 배당이 가장 높습니다. 로또급!",
  },
];

const GRADES = [
  {
    name: "특선 (S급)",
    desc: "최상위 등급. 가장 강한 선수들.",
    ranks: ["SS", "S1", "S2", "S3"],
    card: "bg-amber-100 border-amber-300",
    title: "text-amber-700",
    text: "text-amber-600",
    badge: "bg-amber-200 text-amber-800",
  },
  {
    name: "우수 (A급)",
    desc: "중상위 등급. 특선 승급을 노리는 선수들.",
    ranks: ["A1", "A2", "A3"],
    card: "bg-blue-50 border-blue-200",
    title: "text-blue-700",
    text: "text-blue-600",
    badge: "bg-blue-100 text-blue-800",
  },
  {
    name: "선발 (B급)",
    desc: "기본 등급. 보통 신인 선수들이 데뷔하는 곳.",
    ranks: ["B1", "B2", "B3"],
    card: "bg-green-50 border-green-200",
    title: "text-green-700",
    text: "text-green-600",
    badge: "bg-green-100 text-green-800",
  },
];

const CARD_METRICS = [
  {
    name: "평균득점",
    short: "선수 기량의 기본 지표",
    desc: "등급·급반별 기준점수(선발 B3 84점 ~ 특선 SS 102점)에서 경주 순위에 따라 점수를 더하고 빼서 계산됩니다. 같은 급 안에서 득점이 높다면 그 급에서 강한 선수라는 뜻입니다.",
    tip: "주의: 3·4착이 많은 꾸준한 선수는 실력보다 득점이 높게, 1착 아니면 하위권인 기복형 선수는 낮게 나올 수 있어 득점만 믿으면 안 됩니다.",
  },
  {
    name: "승률·연대율·삼연대율",
    short: "1착률 / 1~2착률 / 1~3착률",
    desc: "승률은 1착 비율, 연대율은 1·2착 비율, 삼연대율은 1~3착 비율입니다.",
    tip: "팁: 사려는 승식에 맞는 지표를 보세요. 쌍승·복승이면 연대율, 삼복승이면 삼연대율이 핵심입니다.",
  },
  {
    name: "기어배수",
    short: "가속형이냐, 유지형이냐",
    desc: "앞 대기어 톱니 수를 뒤 소기어 톱니 수로 나눈 값(2.75~3.93)으로, 실전에서는 3.85, 3.92, 3.93이 가장 많이 쓰입니다. 높을수록 속도를 내기까지는 오래 걸리지만 한번 올린 속도를 유지하기 좋습니다.",
    tip: "팁: 평소와 다른 기어배수를 신고했다면 작전 변화의 신호일 수 있습니다. 전법과 함께 보세요.",
  },
  {
    name: "승부수 (전법)",
    short: "이 선수는 어떻게 이기는 선수인가",
    desc: "선행·젖히기·추입·마크 중 그 선수가 주로 쓰는 승부 방식입니다. 위 전법 섹션에서 본 것처럼, 같은 득점이라도 전법에 따라 경주에서의 역할이 완전히 달라집니다.",
    tip: "팁: 한 경주에 선행형이 여럿이면 초반 소모전이, 없으면 눈치싸움이 벌어지기 쉽습니다.",
  },
];

const GLOSSARY = [
  { term: "유도원", def: "경주 초반 속도를 올려주는 역할. 잔여 2바퀴에서 퇴피합니다." },
  { term: "착순", def: "결승선 통과 순서. 1착, 2착, 3착 등으로 표기합니다." },
  { term: "착차", def: "결승선 통과 시 선수 간 거리 차이. 자전거 한 대 길이 차이를 '1차신', 그보다 작은 타이어 폭 정도의 차이를 '타이어차'라고 합니다." },
  { term: "낙차", def: "경주 중 넘어지는 사고. 넘어진 선수도 자전거와 몸에 이상이 없으면 다시 타고 경주를 완주해야 하며, 다른 선수를 낙차시킨 가해 선수는 실격될 수 있습니다." },
  { term: "회차", def: "경주가 열리는 단위 기간. 보통 금~일 3일간 진행됩니다." },
  { term: "일차", def: "회차 내 몇째 날인지. 1일차(금), 2일차(토), 3일차(일)." },
  { term: "경주번호", def: "하루에 열리는 여러 경주의 순서 번호. 광명은 통상 하루 12~16경주, 창원·부산은 각 6~9경주 내외로 진행됩니다." },
  { term: "출주표", def: "각 경주에 출전하는 선수 명단과 정보를 담은 표." },
];

function StarRating({ count }: { count: number }) {
  return (
    <span className="text-amber-400 text-xs tracking-tight">
      {"★".repeat(count)}
      {"☆".repeat(5 - count)}
    </span>
  );
}

export default function InterviewAboutPage() {
  const [openGlossary, setOpenGlossary] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/interview"
          className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white transition-colors"
          style={{ textShadow }}
        >
          <ChevronLeft className="h-4 w-4" />
          돌아가기
        </Link>
      </div>

      <h1
        className="text-2xl sm:text-3xl font-bold text-white mb-8"
        style={{ textShadow }}
      >
        경륜 가이드
      </h1>

      <div className="space-y-6">
        {/* 섹션 1: 경륜이란? */}
        <Section>
          <SectionTitle>경륜이란?</SectionTitle>
          <p className="text-sm leading-relaxed text-foreground/80 mb-3">
            경륜은 자전거를 타고 333m 트랙을 돌며 순위를 겨루는 프로 스포츠입니다.
          </p>
          <ul className="space-y-2 text-sm text-foreground/70">
            <li className="flex gap-2">
              <span className="shrink-0 text-brand">•</span>
              <div>
                7명의 선수가 약 333m 트랙을 5바퀴 달리며 우열을 가립니다.
                <p className="mt-1 text-xs text-muted-foreground">
                  * 주회 수 등 경주 방식은 규정 개정에 따라 변경될 수 있습니다. (과거에는 6바퀴로 진행)
                </p>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-brand">•</span>
              전략, 체력, 순간 판단력이 핵심인 스프린트 레이스입니다.
            </li>
          </ul>
        </Section>

        {/* 섹션 2: 경주 진행 */}
        <Section>
          <SectionTitle>경주는 이렇게 진행돼요</SectionTitle>
          <div className="space-y-3">
            {RACE_STEPS.map((s) => (
              <div key={s.num} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white text-sm font-bold">
                  {s.num}
                </div>
                <div className="pt-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {s.title}
                  </p>
                  <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 섹션 3: 전법 */}
        <Section>
          <SectionTitle>전법을 알면 10배 재밌어요</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {TACTICS.map((t) => (
              <div
                key={t.name}
                className={`rounded-lg border p-3.5 ${t.color}`}
              >
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold mb-2 ${t.badge}`}
                >
                  {t.name}
                </span>
                <p className="text-xs text-foreground/70 leading-relaxed">
                  {t.desc}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* 섹션 4: 등급 시스템 */}
        <Section>
          <SectionTitle>등급 시스템</SectionTitle>
          <div className="flex flex-col gap-2 mb-4">
            {GRADES.map((g) => (
              <div
                key={g.name}
                className={`w-full rounded-lg border px-4 py-3 text-center ${g.card}`}
              >
                <p className={`text-sm font-bold ${g.title}`}>{g.name}</p>
                <p className={`text-[11px] mt-0.5 ${g.text}`}>{g.desc}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-1">
                  {g.ranks.map((r) => (
                    <span
                      key={r}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${g.badge}`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-foreground/60">
            등급은 반기(6개월)마다 등급심사를 통해 조정되며, 같은 등급 안의
            급반(예: S1↔S2)은 매회차 변경될 수 있습니다.
          </p>
          <p className="text-xs text-center text-foreground/60 mt-1.5">
            3회 연속 1·2위를 기록하면 특별승급, 2회 연속 6·7위를 기록하면
            특별강급됩니다. (기준은 규정 개정에 따라 변경될 수 있습니다)
          </p>
        </Section>

        {/* 섹션 5: 출주표 읽는 법 */}
        <Section>
          <SectionTitle>출주표, 이렇게 읽어요</SectionTitle>
          <p className="text-sm leading-relaxed text-foreground/80 mb-4">
            출주표는 선수의 이력서입니다. 이 네 가지만 읽을 줄 알면 경주가 다르게
            보입니다.
          </p>
          <div className="space-y-3">
            {CARD_METRICS.map((m) => (
              <div
                key={m.name}
                className="rounded-lg border border-border bg-slate-50 p-4"
              >
                <p className="text-sm font-bold text-foreground">{m.name}</p>
                <p className="text-xs font-medium text-brand mt-0.5">
                  {m.short}
                </p>
                <p className="text-xs text-foreground/70 mt-2 leading-relaxed">
                  {m.desc}
                </p>
                <p className="mt-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-medium text-foreground/80 leading-relaxed">
                  {m.tip}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-center text-foreground/50 leading-relaxed">
            * 산출 기준은 국민체육진흥공단 공식 규정을 따르며, 규정 개정에 따라
            변경될 수 있습니다.
          </p>
          <Link
            href="/data/decision-card"
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            실제 출주표에서 확인해보기 →
          </Link>
        </Section>

        {/* 섹션 6: 승식 가이드 */}
        <Section>
          <SectionTitle>승식 가이드</SectionTitle>
          <div className="space-y-2.5">
            {BETTING_TYPES.map((b, i) => (
              <div
                key={b.name}
                className="rounded-lg border border-border bg-white p-3.5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground/60">
                    {i + 1}
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {b.name}
                  </span>
                  <StarRating count={b.stars} />
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground/60">
                    적중확률 {b.probability}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground/80">
                  {b.short}
                </p>
                {b.desc && (
                  <p className="text-[11px] text-foreground/50 mt-0.5">
                    {b.desc}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 섹션 7: 용어 사전 */}
        <Section>
          <SectionTitle>경륜 용어 사전</SectionTitle>
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {GLOSSARY.map((g) => {
              const isOpen = openGlossary === g.term;
              return (
                <button
                  key={g.term}
                  type="button"
                  onClick={() =>
                    setOpenGlossary(isOpen ? null : g.term)
                  }
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-foreground">
                      {g.term}
                    </span>
                    {isOpen && (
                      <p className="text-xs text-foreground/70 mt-1 leading-relaxed">
                        {g.def}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
              );
            })}
          </div>
        </Section>

        {/* 섹션 8: 어디서 볼 수 있나요? */}
        <Section>
          <SectionTitle>어디서 볼 수 있나요?</SectionTitle>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                경륜장 방문
              </p>
              <p className="text-xs text-foreground/70 leading-relaxed">
                광명 경륜장 (서울 근교), 창원 경륜장, 부산 경륜장
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                온라인 시청
              </p>
              <p className="text-xs text-foreground/70 leading-relaxed">
                kcycle.or.kr에서 실시간 중계 시청 가능
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm font-semibold text-foreground mb-1">
                경주 일정
              </p>
              <p className="text-xs text-foreground/70 leading-relaxed">
                매주 금/토/일 경주 진행 (4일 경륜 등 예외 있음)
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
