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
    desc: "유도원이 빠지고 본격적인 경주가 시작됩니다.",
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
    desc: "특정 선수 뒤에 붙어서 따라가며 뒤를 견재함.",
    color: "bg-green-50 border-green-200",
    badge: "text-green-600 bg-green-100",
  },
];

const BETTING_TYPES = [
  {
    name: "단승",
    stars: 1,
    short: "1등 맞추기",
    desc: "7명 중 1등을 맞추는 가장 단순한 방식!",
  },
  {
    name: "연승",
    stars: 1,
    short: "1~2등 안에 들면 OK",
    desc: "내가 고른 선수가 1등 또는 2등이면 적중.",
  },
  {
    name: "복승",
    stars: 2,
    short: "1,2등 2명 맞추기 (순서 무관)",
    desc: "",
  },
  {
    name: "쌍승",
    stars: 3,
    short: "1,2등 순서까지 맞추기",
    desc: "",
  },
  {
    name: "삼복승",
    stars: 3,
    short: "1,2,3등 3명 맞추기 (순서 무관)",
    desc: "",
  },
  {
    name: "쌍복승",
    stars: 4,
    short: "1~3등 중 1등 1명(정확히), 2,3등(순서 무관) 2명 맞추기",
    desc: "",
  },
  {
    name: "삼쌍승",
    stars: 5,
    short: "1,2,3등 순서까지 정확히!",
    desc: "가장 어렵지만 배당이 가장 높습니다. 로또급!",
  },
];

const GLOSSARY = [
  { term: "유도원", def: "경주 초반 속도를 올려주는 역할. 잔여 2바퀴에서 퇴피합니다." },
  { term: "착순", def: "결승선 통과 순서. 1착, 2착, 3착 등으로 표기합니다." },
  { term: "착차", def: "선수 간 도착 시간 차이. 타이어 1개 차이를 '1차신'이라 합니다." },
  { term: "낙차", def: "경주 중 넘어지는 사고. 낙차 시 해당 선수는 실격 또는 순위 변동될 수 있습니다." },
  { term: "회차", def: "경주가 열리는 단위 기간. 보통 금~일 3일간 진행됩니다." },
  { term: "일차", def: "회차 내 몇째 날인지. 1일차(금), 2일차(토), 3일차(일)." },
  { term: "경주번호", def: "하루에 열리는 여러 경주의 순서 번호. 보통 하루 5~14경주까지 진행." },
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
              7명의 선수가 약 333m 트랙을 5바퀴 달리며 우열을 가립니다.
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
          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="w-[40%] rounded-lg bg-amber-100 border border-amber-300 px-4 py-3 text-center">
              <p className="text-sm font-bold text-amber-700">특선</p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                최상위 등급. 가장 강한 선수들.
              </p>
            </div>
            <div className="w-[60%] rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-center">
              <p className="text-sm font-bold text-blue-700">우수</p>
              <p className="text-[11px] text-blue-600 mt-0.5">
                중상위 등급. 특선 승급을 노리는 선수들.
              </p>
            </div>
            <div className="w-[80%] rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-center">
              <p className="text-sm font-bold text-green-700">선발</p>
              <p className="text-[11px] text-green-600 mt-0.5">
                기본 등급. 보통 신인 선수들이 데뷔하는 곳.
              </p>
            </div>
          </div>
          <p className="text-xs text-center text-foreground/60">
            등급은 반기(6개월)마다 성적에 따라 변동됩니다.
          </p>
        </Section>

        {/* 섹션 5: 승식 가이드 */}
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

        {/* 섹션 6: 용어 사전 */}
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

        {/* 섹션 7: 어디서 볼 수 있나요? */}
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
