"use client";

import { useEffect, useState } from "react";
import { VOTE_ROLES, VOTE_TITLE, type VoteRole } from "@/lib/vote-config";

type ItemResult = {
  id: string;
  name: string;
  role: VoteRole;
  approve: number;
  reject: number;
  approveRate: number;
};

type Results = {
  total: number;
  latestAt: string | null;
  results: ItemResult[];
};

export default function VoteResultsDashboard() {
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchResults() {
      try {
        const res = await fetch("/api/admin/vote-results", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setLastFetch(new Date());
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchResults();
    const id = setInterval(fetchResults, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-600">불러오는 중...</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-600">오류: {error}</div>;
  }
  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            {VOTE_TITLE} — 결과
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            30초마다 자동 새로고침 · 마지막 조회:{" "}
            {lastFetch?.toLocaleTimeString("ko-KR")}
          </p>
        </div>

        {/* 총 투표 수 */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <p className="text-sm text-slate-500">총 투표 수</p>
          <p className="text-4xl font-bold text-blue-600 mt-1">
            {data.total}
            <span className="text-lg text-slate-400"> 명 제출</span>
          </p>
          {data.latestAt && (
            <p className="text-xs text-slate-400 mt-2">
              최근 투표: {new Date(data.latestAt).toLocaleString("ko-KR")}
            </p>
          )}
        </div>

        {/* 직위별 결과 */}
        {VOTE_ROLES.map((role) => {
          const items = data.results.filter((r) => r.role === role);
          return (
            <div key={role} className="bg-white rounded-2xl shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                {role}{" "}
                <span className="text-sm text-slate-400">({items.length}명)</span>
              </h2>
              <div className="space-y-4">
                {items.map((item) => {
                  const counted = item.approve + item.reject;
                  return (
                    <div key={item.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-slate-800">
                          {item.name}
                        </span>
                        <span className="text-slate-600">
                          찬성 {item.approve} · 반대 {item.reject}{" "}
                          <span className="text-slate-400">
                            (찬성률 {item.approveRate}%)
                          </span>
                        </span>
                      </div>
                      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="bg-emerald-500 h-full"
                          style={{
                            width:
                              counted > 0
                                ? `${(item.approve / counted) * 100}%`
                                : "0%",
                          }}
                        />
                        <div
                          className="bg-red-500 h-full"
                          style={{
                            width:
                              counted > 0
                                ? `${(item.reject / counted) * 100}%`
                                : "0%",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
