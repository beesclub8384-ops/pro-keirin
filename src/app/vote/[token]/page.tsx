"use client";

import { use, useMemo, useState } from "react";
import {
  VOTE_ITEMS,
  VOTE_ROLES,
  VOTE_TITLE,
  VOTE_TOTAL,
  type VoteItem,
} from "@/lib/vote-config";

type Choice = boolean; // true = 찬성, false = 반대
type Selections = Record<string, Choice>;

export default function VotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [selections, setSelections] = useState<Selections>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = Object.keys(selections).length;
  const allAnswered = answeredCount === VOTE_TOTAL;

  // 직위별 그룹핑
  const grouped = useMemo(() => {
    return VOTE_ROLES.map((role) => ({
      role,
      items: VOTE_ITEMS.filter((v) => v.role === role),
    }));
  }, []);

  function choose(id: string, choice: Choice) {
    setSelections((prev) => ({ ...prev, [id]: choice }));
    setError(null);
  }

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, votes: selections }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(j.error ?? "이미 투표하셨습니다.");
      } else {
        setError(j.error ?? "제출에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
            ✓
          </div>
          <h1 className="text-xl font-bold text-slate-900">투표가 완료되었습니다</h1>
          <p className="mt-2 text-base text-slate-500">
            소중한 의견 감사합니다. 이 창은 닫으셔도 됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen scroll-smooth bg-slate-50 px-4 py-5 md:p-8">
      <div className="mx-auto w-full max-w-2xl">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold leading-snug text-slate-900 md:text-2xl">
            {VOTE_TITLE}
          </h1>
          <p className="mt-1.5 text-base text-slate-500">
            각 후보에 대해 찬성 또는 반대를 선택해 주세요. ({answeredCount}/
            {VOTE_TOTAL} 선택됨)
          </p>
        </div>

        {/* 항목 그룹 */}
        <div className="space-y-5">
          {grouped.map(({ role, items }) => (
            <div key={role} className="rounded-2xl bg-white p-4 shadow sm:p-5">
              <h2 className="mb-3 text-base font-semibold text-slate-500">
                {role} <span className="text-slate-400">({items.length}명)</span>
              </h2>
              <div className="space-y-1">
                {items.map((item) => (
                  <VoteRow
                    key={item.id}
                    item={item}
                    choice={selections[item.id]}
                    onChoose={(c) => choose(item.id, c)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 에러 */}
        {error && (
          <p className="mt-4 text-center text-base text-red-600">{error}</p>
        )}

        {/* 제출 */}
        <div className="sticky bottom-0 mt-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="min-h-[52px] w-full touch-manipulation rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting
              ? "제출 중..."
              : allAnswered
                ? "투표 제출하기"
                : `모든 항목을 선택해 주세요 (${answeredCount}/${VOTE_TOTAL})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function VoteRow({
  item,
  choice,
  onChoose,
}: {
  item: VoteItem;
  choice: boolean | undefined;
  onChoose: (choice: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-base font-medium text-slate-800">{item.name}</span>
      <div className="flex shrink-0 gap-3">
        <button
          type="button"
          onClick={() => onChoose(true)}
          className={`min-h-[44px] min-w-[72px] touch-manipulation rounded-lg px-5 text-base font-semibold transition ${
            choice === true
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300"
          }`}
        >
          찬성
        </button>
        <button
          type="button"
          onClick={() => onChoose(false)}
          className={`min-h-[44px] min-w-[72px] touch-manipulation rounded-lg px-5 text-base font-semibold transition ${
            choice === false
              ? "bg-red-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300"
          }`}
        >
          반대
        </button>
      </div>
    </div>
  );
}
