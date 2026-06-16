"use client";

import { useState } from "react";

// 투표 링크 베이스 URL (검증 요구 형식: https://pro-keirin.vercel.app/vote/[token])
const SITE_URL = "https://pro-keirin.vercel.app";
const MIN_COUNT = 1;
const MAX_COUNT = 20;

function linkFor(token: string): string {
  return `${SITE_URL}/vote/${token}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 폴백으로 진행
  }
  // 구형/비보안 컨텍스트 폴백
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function VoteTokensPage() {
  const [count, setCount] = useState(10);
  const [tokens, setTokens] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setCopiedIdx(null);
    setCopiedAll(false);
    try {
      const res = await fetch("/api/admin/vote-tokens/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "생성에 실패했습니다.");
        return;
      }
      setTokens(Array.isArray(j.tokens) ? j.tokens : []);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(idx: number, token: string) {
    const ok = await copyText(linkFor(token));
    if (ok) {
      setCopiedIdx(idx);
      setCopiedAll(false);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    }
  }

  async function handleCopyAll() {
    const all = tokens.map(linkFor).join("\n");
    const ok = await copyText(all);
    if (ok) {
      setCopiedAll(true);
      setCopiedIdx(null);
      setTimeout(() => setCopiedAll(false), 1500);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
            투표 토큰 생성
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            필요한 개수만큼 고유 투표 링크를 생성합니다. (최대 {MAX_COUNT}개)
          </p>
        </div>

        {/* 생성 폼 */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-600">
                생성 개수 ({MIN_COUNT}~{MAX_COUNT})
              </label>
              <input
                type="number"
                min={MIN_COUNT}
                max={MAX_COUNT}
                value={count}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n)) {
                    setCount(MIN_COUNT);
                  } else {
                    setCount(Math.min(MAX_COUNT, Math.max(MIN_COUNT, n)));
                  }
                }}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="min-h-[44px] rounded-lg bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "생성 중..." : "생성"}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* 결과 목록 */}
        {tokens.length > 0 && (
          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                생성된 링크{" "}
                <span className="text-sm text-slate-400">({tokens.length}개)</span>
              </h2>
              <button
                type="button"
                onClick={handleCopyAll}
                className="min-h-[40px] rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 active:bg-slate-300"
              >
                {copiedAll ? "전체 복사됨 ✓" : "전체 복사"}
              </button>
            </div>
            <ul className="space-y-2">
              {tokens.map((token, idx) => (
                <li
                  key={token}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-400">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">
                    {linkFor(token)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(idx, token)}
                    className="min-h-[40px] shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800"
                  >
                    {copiedIdx === idx ? "복사됨 ✓" : "복사"}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-400">
              ※ 토큰은 저장되지 않습니다. 이 목록을 복사해 보관하세요. 각 링크는 1회만 투표할 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
