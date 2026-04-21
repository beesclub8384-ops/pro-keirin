'use client';

import { useEffect, useState } from 'react';

type Stats = {
  total: number;
  target: number;
  progressRate: string;
  latestAt: string | null;
  byGrade: Record<string, number>;
  byAge: Record<string, number>;
  byCareer: Record<string, number>;
  byRegion: Record<string, number>;
  byPrizeBank: Record<string, number>;
  byTransferIntent: Record<string, number>;
  transferIntentRate: string;
  rateSensitivity: Record<string, number>;
  byConcerns: Record<string, number>;
  byRefinanceIntent: Record<string, number>;
  byNewLoanIntent: Record<string, number>;
};

export default function BankSurveyDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/bank-survey/stats', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setStats(data);
        setLastFetch(new Date());
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '알 수 없는 오류';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-600">불러오는 중...</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-600">오류: {error}</div>;
  }
  if (!stats) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            은행 금융협약 수요조사 대시보드
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            30초마다 자동 새로고침 · 마지막 조회: {lastFetch?.toLocaleTimeString('ko-KR')}
          </p>
        </div>

        {/* 응답 수 카드 */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">현재 응답 수</p>
              <p className="text-4xl font-bold text-blue-600 mt-1">
                {stats.total} <span className="text-lg text-slate-400">/ {stats.target}</span>
              </p>
              <p className="text-sm text-slate-600 mt-1">진행률 {stats.progressRate}%</p>
            </div>
            <div className="w-full md:w-64">
              <div className="bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all"
                  style={{ width: `${Math.min(parseFloat(stats.progressRate), 100)}%` }}
                />
              </div>
            </div>
          </div>
          {stats.latestAt && (
            <p className="text-xs text-slate-400 mt-3">
              최근 응답: {new Date(stats.latestAt).toLocaleString('ko-KR')}
            </p>
          )}
        </div>

        {/* 핵심 협상 지표 */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">핵심 협상 지표</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm opacity-80">상금 계좌 이전 긍정률</p>
              <p className="text-4xl font-bold mt-1">{stats.transferIntentRate}%</p>
              <p className="text-xs opacity-70 mt-1">
                &quot;바로 옮김&quot; + &quot;조건 보고 검토&quot; 합산
              </p>
            </div>
            <div>
              <p className="text-sm opacity-80 mb-2">금리 인하 시 대환 예상 인원</p>
              <div className="text-sm space-y-1">
                <div>0.5%p 인하 → <strong>{stats.rateSensitivity['0.5%p']}명</strong></div>
                <div>0.7%p 인하 → <strong>{stats.rateSensitivity['0.7%p']}명</strong></div>
                <div>1.0%p 인하 → <strong>{stats.rateSensitivity['1.0%p']}명</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* 분포 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DistributionCard title="등급별 분포" data={stats.byGrade} />
          <DistributionCard title="권역별 분포" data={stats.byRegion} />
          <DistributionCard title="연령대별 분포" data={stats.byAge} />
          <DistributionCard title="경력별 분포" data={stats.byCareer} />
          <DistributionCard title="현재 상금 계좌 은행 TOP" data={stats.byPrizeBank} limit={8} />
          <DistributionCard title="계좌 이전 의향 분포" data={stats.byTransferIntent} />
          <DistributionCard title="조합원 최대 걱정거리 TOP" data={stats.byConcerns} limit={5} />
          <DistributionCard title="대환 의향 분포" data={stats.byRefinanceIntent} />
        </div>
      </div>
    </div>
  );
}

function DistributionCard({
  title,
  data,
  limit,
}: {
  title: string;
  data: Record<string, number>;
  limit?: number;
}) {
  const entries = Object.entries(data);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const displayed = limit ? entries.slice(0, limit) : entries;

  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <h3 className="font-semibold text-slate-900 mb-3">{title}</h3>
      {displayed.length === 0 ? (
        <p className="text-sm text-slate-400">응답 없음</p>
      ) : (
        <div className="space-y-2">
          {displayed.map(([key, value]) => {
            const pct = total > 0 ? (value / total) * 100 : 0;
            return (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 truncate mr-2">{key}</span>
                  <span className="text-slate-500 shrink-0">
                    {value}명 ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
