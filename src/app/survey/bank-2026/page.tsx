'use client';

import { useState, useEffect } from 'react';
import { BANK_SURVEY_SECTIONS, type Question } from '@/lib/survey/bank-survey-questions';

// UUID 생성 (crypto API)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 쿠키 관리
const COOKIE_NAME = 'bank_survey_2026_submitted';
const ANON_ID_KEY = 'bank_survey_2026_anon_id';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

type Answers = Record<string, string | string[]>;

export default function BankSurveyPage() {
  const [started, setStarted] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [otherInputs, setOtherInputs] = useState<Record<string, string>>({});
  const [anonymousId, setAnonymousId] = useState<string>('');
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 마운트 시 쿠키 확인 + anonymous_id 생성
  useEffect(() => {
    const submittedCookie = getCookie(COOKIE_NAME);
    if (submittedCookie === 'true') {
      setAlreadySubmitted(true);
      return;
    }

    let anonId = localStorage.getItem(ANON_ID_KEY);
    if (!anonId) {
      anonId = generateUUID();
      localStorage.setItem(ANON_ID_KEY, anonId);
    }
    setAnonymousId(anonId);
  }, []);

  // 이미 응답한 경우
  if (alreadySubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold mb-2">이미 응답이 완료되었습니다</h1>
          <p className="text-slate-600 text-sm">
            본 설문은 조합원 1인당 1회만 응답 가능합니다.<br />
            참여해 주셔서 감사합니다.
          </p>
        </div>
      </div>
    );
  }

  // 제출 완료
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="text-5xl mb-4">🙏</div>
          <h1 className="text-xl font-bold mb-4">설문 응답을 완료해 주셔서 진심으로 감사드립니다</h1>
          <p className="text-slate-600 text-sm leading-relaxed">
            여러분의 응답은 은행과의 협상 테이블에서<br />
            조합원 여러분을 위한 더 나은 조건을 만드는 데<br />
            직접 활용됩니다.
          </p>
          <p className="mt-6 text-slate-500 text-xs">프로경륜선수노동조합 사무국 드림</p>
        </div>
      </div>
    );
  }

  // 시작 전 안내 화면
  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-4">
        <div className="max-w-2xl mx-auto mt-8 bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
            프로경륜선수노동조합 × 은행 금융협약 수요조사
          </h1>
          <p className="text-sm text-slate-500 mb-6">응답 마감일: 2026년 5월 8일(금)</p>

          <div className="space-y-4 text-slate-700 text-sm md:text-base leading-relaxed">
            <p>조합원 여러분 안녕하십니까. 프로경륜선수노동조합 사무국입니다.</p>
            <p>
              노조가 은행과 조합원 전용 금융협약을 체결하기 위한 사전 수요조사입니다.
              만약 협약이 체결된다면 조합원 여러분은 대출 금리 인하, 마이너스통장 한도 우대,
              심사 간소화 등의 혜택을 받으실 수도 있습니다. 단, 은행에서 협약을 거절할 수도 있습니다.
            </p>
            <p>
              은행과 유리한 조건으로 협상하기 위해서는 조합원 여러분의 실제 수요와 현황 데이터가
              반드시 필요합니다. 본 설문 결과는 은행과의 협상 자료로 활용됩니다.
            </p>
          </div>

          <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 rounded-lg p-4">
            <p className="font-semibold text-blue-900 mb-2">📌 꼭 알아주세요</p>
            <ul className="text-sm text-blue-900 space-y-1">
              <li>• 본 설문은 <strong>완전 익명</strong>으로 진행됩니다.</li>
              <li>• 소득·대출 관련 질문은 모두 <strong>구간(범위)으로만</strong> 묻습니다.</li>
              <li>• 집계된 통계만 은행 협상 자료로 활용됩니다.</li>
              <li>• 총 <strong>30문항</strong>, 응답 소요 시간 약 <strong>7~10분</strong></li>
            </ul>
          </div>

          <p className="mt-6 text-slate-700 text-sm md:text-base">
            여러분의 한 분 한 분의 응답이 협약 조건을 결정합니다.<br />
            바쁘시겠지만 꼭 끝까지 응답해 주시면 감사하겠습니다.
          </p>

          <button
            onClick={() => setStarted(true)}
            className="mt-8 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-colors text-base shadow-lg"
          >
            설문 시작하기
          </button>
        </div>
      </div>
    );
  }

  const section = BANK_SURVEY_SECTIONS[currentSection];
  const totalSections = BANK_SURVEY_SECTIONS.length;
  const progress = ((currentSection + 1) / totalSections) * 100;

  // 조건부 문항 필터
  function shouldShowQuestion(q: Question): boolean {
    if (!q.condition) return true;
    const dependAnswer = answers[q.condition.dependsOn];
    if (!dependAnswer) return false;
    if (Array.isArray(dependAnswer)) {
      return q.condition.includesAny.some((v) => dependAnswer.includes(v));
    }
    return q.condition.includesAny.includes(dependAnswer);
  }

  const visibleQuestions = section.questions.filter(shouldShowQuestion);

  // 필수 문항 답변 확인
  function canProceed(): boolean {
    for (const q of visibleQuestions) {
      if (!q.required) continue;
      const ans = answers[q.id];
      if (!ans) return false;
      if (Array.isArray(ans) && ans.length === 0) return false;
    }
    return true;
  }

  function handleSingle(qId: string, value: string) {
    setAnswers({ ...answers, [qId]: value });
  }

  function handleMulti(qId: string, value: string, maxSelect?: number) {
    const current = (answers[qId] as string[]) || [];
    if (current.includes(value)) {
      setAnswers({ ...answers, [qId]: current.filter((v) => v !== value) });
    } else {
      if (maxSelect && current.length >= maxSelect) {
        alert(`최대 ${maxSelect}개까지만 선택 가능합니다.`);
        return;
      }
      setAnswers({ ...answers, [qId]: [...current, value] });
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = { anonymous_id: anonymousId };

      for (const sec of BANK_SURVEY_SECTIONS) {
        for (const q of sec.questions) {
          const ans = answers[q.id];
          if (ans !== undefined) {
            payload[q.dbColumn] = ans;
          }
          if (q.otherColumn && otherInputs[q.id]) {
            payload[q.otherColumn] = otherInputs[q.id];
          }
        }
      }

      const res = await fetch('/api/survey/bank-2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '제출에 실패했습니다.');
      }

      setCookie(COOKIE_NAME, 'true', 365);
      setSubmitted(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const isLastSection = currentSection === totalSections - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        {/* 프로그레스 바 */}
        <div className="bg-white rounded-full h-2 mb-6 overflow-hidden shadow-sm">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-xs text-slate-500 mb-4">
          {currentSection + 1} / {totalSections} 섹션
        </p>

        {/* 섹션 카드 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-2">{section.title}</h2>
          {section.description && (
            <p className="text-sm text-slate-600 mb-6">{section.description}</p>
          )}

          <div className="space-y-8">
            {visibleQuestions.map((q) => (
              <div key={q.id} className="border-t pt-6 first:border-t-0 first:pt-0">
                <div className="flex gap-2 mb-3">
                  <span className="text-blue-600 font-bold text-sm">{q.id.toUpperCase()}.</span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">
                      {q.title}
                      {q.required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    {q.description && (
                      <p className="text-xs text-slate-500 mt-1">{q.description}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  {q.options.map((opt) => {
                    const isSelected =
                      q.type === 'single' || q.type === 'single_with_other'
                        ? answers[q.id] === opt
                        : ((answers[q.id] as string[]) || []).includes(opt);

                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (q.type === 'single' || q.type === 'single_with_other') {
                            handleSingle(q.id, opt);
                          } else {
                            handleMulti(q.id, opt, q.maxSelect);
                          }
                        }}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                        }`}
                      >
                        <span className="text-sm">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 기타 주관식 입력 */}
                {q.otherColumn &&
                  ((q.type === 'single_with_other' && answers[q.id] === '기타') ||
                    (q.type !== 'single_with_other' &&
                      ((answers[q.id] as string[]) || []).includes('기타'))) && (
                    <input
                      type="text"
                      placeholder="기타 내용을 입력해 주세요"
                      value={otherInputs[q.id] || ''}
                      onChange={(e) =>
                        setOtherInputs({ ...otherInputs, [q.id]: e.target.value })
                      }
                      className="mt-3 w-full px-4 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-blue-600 focus:outline-none"
                    />
                  )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* 네비게이션 */}
          <div className="mt-8 flex gap-3">
            {currentSection > 0 && (
              <button
                onClick={() => setCurrentSection(currentSection - 1)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-colors"
              >
                이전
              </button>
            )}
            {!isLastSection ? (
              <button
                onClick={() => {
                  if (!canProceed()) {
                    alert('필수 항목을 모두 선택해 주세요.');
                    return;
                  }
                  setCurrentSection(currentSection + 1);
                  window.scrollTo(0, 0);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg"
              >
                다음
              </button>
            ) : (
              <button
                onClick={() => {
                  if (!canProceed()) {
                    alert('필수 항목을 모두 선택해 주세요.');
                    return;
                  }
                  handleSubmit();
                }}
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg"
              >
                {submitting ? '제출 중...' : '설문 제출하기'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
