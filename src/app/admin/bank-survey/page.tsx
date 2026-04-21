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
  // 고급 지표
  marketSize: { total: number; refinancable: number };
  rateScenarios: Record<string, { count: number; amount: number }>;
  gradeRateMatrix: Record<string, Record<string, number>>;
  bankRefinanceMatrix: Record<string, { total: number; positive: number }>;
  regionSessionMatrix: Record<string, { total: number; willing: number }>;
  avgProductsPerPerson: string;
  incomeLoanMatrix: Record<string, { total: number; hasLoan: number }>;
  dailyResponses: Record<string, number>;
  rejectionRate: string;
  rejectionExperienced: number;
};

function formatKRW(amount: number): string {
  if (amount === 0) return '0원';
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return `${eok.toFixed(1)}억원`;
  }
  if (amount >= 10_000) {
    const man = Math.round(amount / 10_000);
    return `${man.toLocaleString('ko-KR')}만원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

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

        {/* 대환 시장 규모 - 초고가치 카드 */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">대환 시장 규모 추정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm opacity-80">응답자 전체 타행 대출 총액</p>
              <p className="text-3xl font-bold mt-1">{formatKRW(stats.marketSize.total)}</p>
              <p className="text-xs opacity-70 mt-1">구간 중간값 기준 추정</p>
            </div>
            <div>
              <p className="text-sm opacity-80">대환 의향자 보유 대출 총액</p>
              <p className="text-3xl font-bold mt-1">{formatKRW(stats.marketSize.refinancable)}</p>
              <p className="text-xs opacity-70 mt-1">&quot;적극적&quot; + &quot;조건 보고 검토&quot; 응답자</p>
            </div>
          </div>
        </div>

        {/* 금리 인하 시나리오 */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">금리 인하 시나리오별 유입 예측</h2>
          <p className="text-xs text-slate-500 mb-4">
            각 금리 인하 수준에 해당하는 응답자 수와 그들이 보유한 대출 총액
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3">금리 인하</th>
                  <th className="text-right py-2 px-3">예상 이동 인원</th>
                  <th className="text-right py-2 px-3">예상 대출 유입액</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.rateScenarios).map(([level, data]) => (
                  <tr key={level} className="border-b border-slate-100">
                    <td className="py-3 px-3 font-medium">{level} 인하</td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-bold text-blue-600">{data.count}명</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-bold text-emerald-600">{formatKRW(data.amount)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 등급별 × 금리 민감도 매트릭스 */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">등급별 × 금리 민감도 매트릭스</h2>
          <p className="text-xs text-slate-500 mb-4">
            각 등급에서 어느 금리 인하 수준에서 이동할지 응답자 수 분포
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3">등급</th>
                  <th className="text-right py-2 px-3">0.3%p</th>
                  <th className="text-right py-2 px-3">0.5%p</th>
                  <th className="text-right py-2 px-3">0.7%p</th>
                  <th className="text-right py-2 px-3">1.0%p</th>
                  <th className="text-right py-2 px-3">1.5%p</th>
                  <th className="text-right py-2 px-3">유지</th>
                </tr>
              </thead>
              <tbody>
                {(['특선', '우수', '선발'] as const).map((grade) => (
                  <tr key={grade} className="border-b border-slate-100">
                    <td className="py-3 px-3 font-medium">{grade}</td>
                    {['0.3%p', '0.5%p', '0.7%p', '1.0%p', '1.5%p', '상관없이 유지'].map((level) => (
                      <td key={level} className="py-3 px-3 text-right">
                        {stats.gradeRateMatrix[grade]?.[level] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 현재 은행별 × 대환 의향 */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">현재 은행별 대환 의향</h2>
          <p className="text-xs text-slate-500 mb-4">
            응답자가 현재 쓰는 은행에서 대환 의향이 있는 비율 (협상 상대 선정용)
          </p>
          <div className="space-y-3">
            {Object.entries(stats.bankRefinanceMatrix)
              .sort(([, a], [, b]) => b.total - a.total)
              .slice(0, 8)
              .map(([bank, data]) => {
                const rate = data.total > 0 ? (data.positive / data.total) * 100 : 0;
                return (
                  <div key={bank}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700 font-medium">{bank}</span>
                      <span className="text-slate-600">
                        {data.positive}/{data.total}명 ({rate.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-amber-500 h-full" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* 권역별 × 설명회 참석 의향 */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">권역별 설명회 참석 의향</h2>
          <div className="space-y-3">
            {Object.entries(stats.regionSessionMatrix).map(([region, data]) => {
              const rate = data.total > 0 ? (data.willing / data.total) * 100 : 0;
              return (
                <div key={region}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700 font-medium">{region.split('(')[0]}</span>
                    <span className="text-slate-600">
                      {data.willing}/{data.total}명 ({rate.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-purple-500 h-full" style={{ width: `${rate}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 기타 카드 3종 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500">다상품 고객 잠재력</p>
            <p className="text-3xl font-bold text-indigo-600 mt-2">
              {stats.avgProductsPerPerson}개
            </p>
            <p className="text-xs text-slate-500 mt-2">
              응답자 1인당 평균 신규 상품 가입 의향 개수
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500">대출 거절 경험률</p>
            <p className="text-3xl font-bold text-rose-600 mt-2">
              {stats.rejectionRate}%
            </p>
            <p className="text-xs text-slate-500 mt-2">
              최근 3년 내 거절/한도축소 경험 ({stats.rejectionExperienced}명)
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500">고소득층 대출 보유율</p>
            {(() => {
              const highIncome = [
                '1억원 초과 ~ 1.5억원 이하',
                '1.5억원 초과 ~ 2억원 이하',
                '2억원 초과 ~ 2억 5천만원 이하',
                '2억 5천만원 초과',
              ];
              let total = 0;
              let hasLoan = 0;
              for (const key of highIncome) {
                const data = stats.incomeLoanMatrix[key];
                if (data) {
                  total += data.total;
                  hasLoan += data.hasLoan;
                }
              }
              const rate = total > 0 ? (hasLoan / total) * 100 : 0;
              return (
                <>
                  <p className="text-3xl font-bold text-teal-600 mt-2">{rate.toFixed(0)}%</p>
                  <p className="text-xs text-slate-500 mt-2">
                    연 상금 1억 초과 응답자 중 ({hasLoan}/{total}명)
                  </p>
                </>
              );
            })()}
          </div>
        </div>

        {/* 일자별 응답 추이 */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">일자별 응답 추이</h2>
          {Object.keys(stats.dailyResponses).length === 0 ? (
            <p className="text-sm text-slate-400">응답 없음</p>
          ) : (
            <div className="flex items-end gap-1 h-40 overflow-x-auto">
              {Object.entries(stats.dailyResponses).map(([date, count]) => {
                const max = Math.max(...Object.values(stats.dailyResponses));
                const height = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={date} className="flex flex-col items-center min-w-[40px]">
                    <div className="text-xs text-slate-600 mb-1">{count}</div>
                    <div
                      className="w-6 bg-blue-500 rounded-t"
                      style={{ height: `${Math.max(height, 5)}%`, minHeight: '4px' }}
                    />
                    <div className="text-[10px] text-slate-400 mt-1 rotate-45 origin-left">
                      {date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
