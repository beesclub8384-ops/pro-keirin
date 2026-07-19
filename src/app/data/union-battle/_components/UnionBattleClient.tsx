"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Swords, Flag, Table2, ChevronDown } from "lucide-react";
import { MatchupMatrix } from "./MatchupMatrix";
import { TrendChart } from "./TrendChart";
import { FinalStandingsChart } from "./FinalStandingsChart";
import { InsightCard } from "./InsightCard";
import {
  UnionBattleData,
  PRO_COLOR,
  LABOR_COLOR,
  VENUES,
  GRADES,
} from "../types";

export function UnionBattleClient() {
  const [data, setData] = useState<UnionBattleData | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data/union-battle")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.error || !d?.matrix) setErrored(true);
        else setData(d as UnionBattleData);
      })
      .catch(() => !cancelled && setErrored(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (errored) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        데이터를 불러오지 못했습니다
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
      </div>
    );
  }

  return <UnionBattleView data={data} />;
}

function UnionBattleView({ data }: { data: UnionBattleData }) {
  // 결승 진출률 바 차트 데이터
  const advanceData = useMemo(
    () =>
      data.finalsAdvance
        .filter((a) => a.finalStarts > 0)
        .map((a) => ({
          name: `${a.venue}·${a.grade}`,
          프로: a.proRate ?? 0,
          노동: a.laborRate ?? 0,
        })),
    [data.finalsAdvance],
  );

  // 동적 인사이트
  const insights = useMemo(() => {
    const gmSpecialFinal = data.finalsStandings.find(
      (s) => s.venue === "광명" && s.grade === "특선",
    );
    const overallMatrix = data.matrix.reduce(
      (acc, m) => {
        acc.pro += m.proWin;
        acc.labor += m.laborWin;
        return acc;
      },
      { pro: 0, labor: 0 },
    );
    const overallRate =
      overallMatrix.pro + overallMatrix.labor > 0
        ? (100 * overallMatrix.pro) / (overallMatrix.pro + overallMatrix.labor)
        : 0;
    // 최고 진출률 배율 (프로/노동, 표본 충분한 선발/우수 평균)
    const advBig = data.finalsAdvance.filter(
      (a) => a.grade !== "특선" && a.proRate && a.laborRate,
    );
    const ratioAvg =
      advBig.length > 0
        ? advBig.reduce((s, a) => s + a.proRate! / a.laborRate!, 0) / advBig.length
        : 0;
    return { gmSpecialFinal, overallRate, ratioAvg };
  }, [data]);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600/10 to-brand/5 p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-2">
          <Swords className="h-5 w-5 text-brand" />
          <span className="text-xs font-bold tracking-wider text-brand">
            7RANDOMS · 진영 대결
          </span>
        </div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          프로연합 <span className="text-blue-600">vs</span> 노동자연합
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
          광명·창원·부산 3개 경기장 · {data.meta.period} · 등급별 맞대결 성적 분석
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRO_COLOR }} />
            프로연합 = PKRU + 한국노조(파란세모)
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LABOR_COLOR }} />
            노동자연합 = 그 외 전체
          </span>
        </div>
      </div>

      <Tabs defaultValue="matchup" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="matchup">
            <Swords className="mr-1 h-4 w-4" /> 맞대결
          </TabsTrigger>
          <TabsTrigger value="finals">
            <Flag className="mr-1 h-4 w-4" /> 결승 무대
          </TabsTrigger>
          <TabsTrigger value="detail">
            <Table2 className="mr-1 h-4 w-4" /> 상세
          </TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: 맞대결 ===== */}
        <TabsContent value="matchup" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InsightCard label="종합 프로 승률" value={`${insights.overallRate.toFixed(1)}%`} sub="일반+준결 통합" accent="blue" />
            <InsightCard label="대상 기간" value={data.meta.period} sub="노조 확립 후" accent="gray" />
            <InsightCard label="대립 정의" value="양 진영 2명↑" sub="일반·준결 (결승 제외)" accent="gray" />
            <InsightCard label="분류 기준" value="최신 소속" sub="선수명 기준 union_type" accent="gray" />
          </div>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                경기장 × 등급 맞대결 승률
              </h2>
              <MatchupMatrix cells={data.matrix} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-1 text-sm font-semibold text-foreground">연도별 추이</h2>
              <TrendChart trend={data.trend} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 2: 결승 무대 ===== */}
        <TabsContent value="finals" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {insights.gmSpecialFinal && (
              <InsightCard
                label="광명 특선 결승"
                value={`프로 ${insights.gmSpecialFinal.winProPct ?? "-"}% 우승 독점`}
                sub={`우승 ${insights.gmSpecialFinal.winPro}/${insights.gmSpecialFinal.win}회`}
                accent="blue"
              />
            )}
            <InsightCard
              label="결승 진출률 격차"
              value={`프로 ${insights.ratioAvg.toFixed(1)}배`}
              sub="노동자 대비 (선발·우수 평균)"
              accent="blue"
            />
            <InsightCard
              label="등급 효과"
              value="높을수록 독점 ↑"
              sub="선발→특선 프로 지배 강화"
              accent="amber"
            />
          </div>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                결승 진출률 (경기장·등급별)
              </h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={advanceData} margin={{ top: 8, right: 8, left: -14, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" fontSize={10} angle={-40} textAnchor="end" interval={0} height={50} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Legend />
                    <Bar dataKey="프로" fill={PRO_COLOR} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="노동" fill={LABOR_COLOR} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                각 진영의 해당 등급 출전 대비 결승 진출 비율
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                결승 성적 분포 (진영별 상위권 점유)
              </h2>
              <FinalStandingsChart rows={data.finalsStandings} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab 3: 상세 ===== */}
        <TabsContent value="detail" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                등급별 전통 지표 (3개장 합산, 대립경주)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 text-left">등급 / 진영</th>
                      <th className="py-2 text-right">n</th>
                      <th className="py-2 text-right">승률</th>
                      <th className="py-2 text-right">연대율</th>
                      <th className="py-2 text-right">삼연대율</th>
                      <th className="py-2 text-right">평균착순</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GRADES.map((g) =>
                      (["pro", "labor"] as const).map((camp) => {
                        const r = data.traditional.find((t) => t.grade === g && t.camp === camp);
                        if (!r) return null;
                        return (
                          <tr key={`${g}-${camp}`} className="border-b border-border/50">
                            <td className="py-1.5">
                              <span className="font-medium">{g}</span>{" "}
                              <span
                                className="text-xs"
                                style={{ color: camp === "pro" ? PRO_COLOR : LABOR_COLOR }}
                              >
                                {camp === "pro" ? "프로" : "노동"}
                              </span>
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.n.toLocaleString()}</td>
                            <td className="py-1.5 text-right font-semibold tabular-nums">{r.winRate}%</td>
                            <td className="py-1.5 text-right tabular-nums">{r.top2Rate}%</td>
                            <td className="py-1.5 text-right tabular-nums">{r.top3Rate}%</td>
                            <td className="py-1.5 text-right tabular-nums">{r.avgRank}</td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">맞대결 상세 수치</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 text-left">경기장·등급</th>
                      <th className="py-2 text-right">프로 승률</th>
                      <th className="py-2 text-right">프로 승</th>
                      <th className="py-2 text-right">노동 승</th>
                      <th className="py-2 text-right">동착</th>
                      <th className="py-2 text-right">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VENUES.flatMap((v) =>
                      GRADES.map((g) => {
                        const c = data.matrix.find((m) => m.venue === v && m.grade === g);
                        if (!c) return null;
                        return (
                          <tr key={`${v}-${g}`} className="border-b border-border/50">
                            <td className="py-1.5">
                              {v} {g}
                              {c.small && <span className="ml-1 text-amber-500">⚠️</span>}
                            </td>
                            <td className="py-1.5 text-right font-semibold tabular-nums text-brand">{c.proWinrate ?? "-"}%</td>
                            <td className="py-1.5 text-right tabular-nums">{c.proWin.toLocaleString()}</td>
                            <td className="py-1.5 text-right tabular-nums">{c.laborWin.toLocaleString()}</td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{c.tie}</td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{c.decisive.toLocaleString()}</td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">⚠️ = 표본 극소(n&lt;300), 참고용</p>
            </CardContent>
          </Card>

          {/* 방법론 (접힘) */}
          <details className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-foreground">
              <ChevronDown className="h-4 w-4" /> 방법론 · 데이터 출처
            </summary>
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>· <b>분석 기간</b>: 2023~2025 (2022 제외 — 노조 확립 후 기간만)</li>
              <li>· <b>대립 경주 정의</b>: 양 진영 최소 2명씩 출전한 경주(B 기준). 대상은 일반·준결승.</li>
              <li>· <b>결승</b>: 성적순 편성이라 대립분석에서 제외하고, 진출률·성적 배분만 집계.</li>
              <li>· <b>진영 분류</b>: 프로연합 = PKRU(2노조) + 한국경륜노조(1노조·파란세모) / 노동자연합 = 그 외 전체. 선수명(공백 정규화) 기준 최신 union_type.</li>
              <li>· <b>맞대결 승률</b>: 혼합 경주의 (프로×노동) 모든 쌍대결에서 착순 빠른 쪽 승. 동착 제외.</li>
              <li>· <b>정상 착순</b>: 낙차·실격·기권 제외(rank 있는 기록만).</li>
              <li>· <b>데이터 소스</b>: kcycle(광명)·lepopark(창원)·spo1(부산) 경주결과 + PKRU 명단 기반 분류. 등급/결승은 races.grade·grade_raw(SSOT).</li>
              <li>· <b>표본 유의</b>: 창원·부산 특선과 준결승은 경주 수가 적어(n&lt;300) 참고용입니다.</li>
            </ul>
          </details>
        </TabsContent>
      </Tabs>
    </div>
  );
}
