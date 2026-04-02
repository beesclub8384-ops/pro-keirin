"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LineChart, Line, ComposedChart,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ── 타입 ── */
interface YearlyRow {
  year: number; performance_prize: number; entry_prize: number;
  safety_prize: number; prep_prize: number; total_prize: number;
  unmatched_count: number; has_performance_data: boolean;
}
interface ByGradeRow {
  out_year: number; out_grade: string; out_total_prize: number | null;
  out_avg_per_race: number | null; out_race_count: number;
}
interface ParticipationRow {
  out_year: number; out_player_count: number; out_race_count: number;
  out_entry_count: number; out_avg_entries: string; out_fall_count: number;
  out_fall_rate: string; out_total_sales: number;
}
interface AllowanceRow {
  year: number; grade: string; entry_fee_per_day: number;
  safety_fee_per_day: number; prep_fee: number;
}
interface GradeGapRow {
  year: number; day: number; grade: string; rank: number; amount: number;
}
interface SpecialRoundRow {
  year: number; round: number; race_type: string; grade_scope: string;
}
interface ParticipationByGradeRow {
  year: number; grade: string; player_count: number;
  round_count: number; avg_rounds_per_player: string;
}

interface ApiData {
  yearly: YearlyRow[]; byGrade: ByGradeRow[];
  participation: ParticipationRow[]; byGradeParticipation: ParticipationByGradeRow[];
  allowances: AllowanceRow[];
  gradeGap: GradeGapRow[]; specialRounds: SpecialRoundRow[];
}

/* ── 유틸 ── */
const toEok = (w: number) => (w / 1_0000_0000).toFixed(1);
const toMan = (w: number) => Math.round(w / 10000).toLocaleString();
const COVID = new Set([2020, 2021]);
const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i);
const COLORS = { 성적: "#3B82F6", 출전: "#22C55E", 안전: "#EAB308", 준비: "#9CA3AF" };
const GRADE_COLORS: Record<string, string> = { 선발: "#60A5FA", 우수: "#34D399", 특선: "#F87171" };

/* ── 메인 ── */
export default function PrizeStatsPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prize-stats")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><p className="text-muted-foreground">데이터 로딩 중...</p></div>;
  if (error || !data) return <div className="flex items-center justify-center min-h-[400px]"><p className="text-red-500">에러: {error}</p></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">경륜선수 상금 지급 통계</h1>
        <p className="text-muted-foreground mt-1">한국경륜선수노동조합 단체교섭 자료</p>
        <p className="text-xs text-muted-foreground mt-0.5">2015~2025년 광명경기장 기준 | 협약서 수집 완료: 2024~2025년</p>
      </div>
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        <strong>안내:</strong> 성적상금은 2025년만 계산 완료. 2015~2024년은 협약서 수집 후 업데이트 예정.
      </div>

      <Tabs defaultValue="yearly" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="yearly">연도별 총상금</TabsTrigger>
          <TabsTrigger value="grade">등급별 분석</TabsTrigger>
          <TabsTrigger value="non-perf">비성적상금</TabsTrigger>
          <TabsTrigger value="safety">낙차·안전</TabsTrigger>
          <TabsTrigger value="sales">매출 대비</TabsTrigger>
          <TabsTrigger value="event">경주유형별</TabsTrigger>
          <TabsTrigger value="status">수집 현황</TabsTrigger>
        </TabsList>

        <TabsContent value="yearly"><Tab1Yearly data={data} /></TabsContent>
        <TabsContent value="grade"><Tab2Grade data={data} /></TabsContent>
        <TabsContent value="non-perf"><Tab3NonPerf data={data} /></TabsContent>
        <TabsContent value="safety"><Tab4Safety data={data} /></TabsContent>
        <TabsContent value="sales"><Tab5Sales data={data} /></TabsContent>
        <TabsContent value="event"><Tab6Event data={data} /></TabsContent>
        <TabsContent value="status"><Tab7Status data={data} /></TabsContent>
      </Tabs>

      {/* 공통 하단 주석 */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>출전상금: 1일당 300,000원 × 출전일수 (2015~2025년 동결)</p>
        <p>안전상금: 1일당 60,000원(~2020) / 80,000원(2021~) × 낙차없이 완주한 일수</p>
        <p>출전준비금: 회차당 100,000원 × 출전 선수-회차 조합 수</p>
        <p>성적상금: 등급·착순·일차별 기준 (2025년 협약서 기반)</p>
        <p>유도상금·대기상금·기타상금·후보상금·소급분은 현재 0원 처리 (추후 조사 후 반영 예정)</p>
        <p className="pt-1 border-t border-muted">본 통계는 kcycle.or.kr 데이터 기반으로 실제 지급액과 차이가 있을 수 있음</p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   탭 1: 연도별 총상금 현황
   ════════════════════════════════════════════════════ */
function Tab1Yearly({ data }: { data: ApiData }) {
  const y25 = data.yearly.find((r) => r.year === 2025);
  const p25 = data.participation.find((r) => r.out_year === 2025);
  const gradeStats25 = data.byGradeParticipation.filter((r) => r.year === 2025);
  const gs = (g: string) => gradeStats25.find((r) => r.grade === g);

  const chartData = data.yearly.map((r) => ({
    year: r.year,
    성적상금: r.has_performance_data ? r.performance_prize : 0,
    출전상금: r.entry_prize, 안전상금: r.safety_prize, 출전준비금: r.prep_prize,
    _raw: r,
  }));

  // 등급별 평균 출전 회차 추이
  const gradePartLine = useMemo(() => {
    const m = new Map<number, Record<string, string>>();
    for (const r of data.byGradeParticipation) {
      if (!m.has(r.year)) m.set(r.year, {});
      m.get(r.year)![r.grade] = r.avg_rounds_per_player;
    }
    return YEARS.map((y) => {
      const g = m.get(y);
      return {
        year: y,
        선발: g?.["선발"] ? parseFloat(g["선발"]) : null,
        우수: g?.["우수"] ? parseFloat(g["우수"]) : null,
        특선: g?.["특선"] ? parseFloat(g["특선"]) : null,
      };
    }).filter((r) => r.선발 !== null);
  }, [data.byGradeParticipation]);

  return (
    <div className="space-y-4">
      {/* KPI 카드 */}
      {y25 && p25 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="연간 총 지급 상금" value={`${toEok(y25.total_prize)}억원`} sub="2025년" />
          <KpiCard label="출전 선수 수" value={`${p25.out_player_count}명`} sub="2025년" />
          <KpiCard label="총 경주 수" value={`${p25.out_race_count.toLocaleString()}경주`} sub="2025년" />
          <KpiCard label="선발 평균 출전" value={`${gs("선발")?.avg_rounds_per_player || "-"}회차`} sub={`${gs("선발")?.player_count || 0}명 / 광명 기준 / 2025년`} />
          <KpiCard label="우수 평균 출전" value={`${gs("우수")?.avg_rounds_per_player || "-"}회차`} sub={`${gs("우수")?.player_count || 0}명 / 광명 기준 / 2025년`} />
          <KpiCard label="특선 평균 출전" value={`${gs("특선")?.avg_rounds_per_player || "-"}회차`} sub={`${gs("특선")?.player_count || 0}명 / 광명 기준 / 2025년`} />
        </div>
      )}

      {/* 스택 차트 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">연도별 상금 지급액 구성</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#6B7280" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} tickFormatter={(v) => v === 0 ? "0" : `${toEok(v)}억`} />
                <Tooltip content={<StackTooltip />} />
                <Legend wrapperStyle={{ fontSize: "13px" }} iconType="square" />
                <Bar dataKey="성적상금" stackId="a" fill={COLORS.성적} />
                <Bar dataKey="출전상금" stackId="a" fill={COLORS.출전} />
                <Bar dataKey="안전상금" stackId="a" fill={COLORS.안전} />
                <Bar dataKey="출전준비금" stackId="a" fill={COLORS.준비} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 상세 테이블 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">연도별 상금 지급 상세</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">연도</TableHead>
                  <TableHead className="text-right">성적상금</TableHead>
                  <TableHead className="text-right">출전상금</TableHead>
                  <TableHead className="text-right">안전상금</TableHead>
                  <TableHead className="text-right">출전준비금</TableHead>
                  <TableHead className="text-right font-bold">합계</TableHead>
                  <TableHead className="text-right">전년대비</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.yearly.map((row, i) => {
                  const prev = data.yearly[i - 1];
                  const diff = prev ? row.total_prize - prev.total_prize : null;
                  return (
                    <TableRow key={row.year} className={COVID.has(row.year) ? "bg-orange-50" : ""}>
                      <TableCell className="font-medium">{row.year}{COVID.has(row.year) && <span className="text-[10px] text-orange-500 ml-0.5">*</span>}</TableCell>
                      <TableCell className={`text-right ${!row.has_performance_data ? "text-muted-foreground" : ""}`}>
                        {row.has_performance_data ? `${toEok(row.performance_prize)}억` : "-"}
                      </TableCell>
                      <TableCell className="text-right">{toEok(row.entry_prize)}억</TableCell>
                      <TableCell className="text-right">{toEok(row.safety_prize)}억</TableCell>
                      <TableCell className="text-right">{toEok(row.prep_prize)}억</TableCell>
                      <TableCell className="text-right font-bold">
                        {toEok(row.total_prize)}억
                        {!row.has_performance_data && <span className="text-[10px] text-muted-foreground font-normal block">(성적상금 미포함)</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {diff !== null ? (
                          <span className={diff > 0 ? "text-red-500" : diff < 0 ? "text-blue-500" : ""}>
                            {diff > 0 ? "↑" : diff < 0 ? "▼" : "-"}{diff !== 0 ? `${toEok(Math.abs(diff))}억` : ""}
                          </span>
                        ) : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">* 2020~2021년은 코로나19로 경주 축소</p>
        </CardContent>
      </Card>

      {/* 등급별 평균 출전 회차 추이 */}
      {gradePartLine.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">등급별 평균 출전 회차 추이</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gradePartLine} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: "회차", angle: -90, position: "insideLeft", fontSize: 12 }} />
                  <Tooltip formatter={(v: number | undefined) => [`${v}회차`]} />
                  <Legend />
                  <Line type="monotone" dataKey="선발" stroke={GRADE_COLORS.선발} strokeWidth={2} connectNulls={false} />
                  <Line type="monotone" dataKey="우수" stroke={GRADE_COLORS.우수} strokeWidth={2} connectNulls={false} />
                  <Line type="monotone" dataKey="특선" stroke={GRADE_COLORS.특선} strokeWidth={2} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2">광명 경기장 기준. 특선이 가장 많은 회차에 출전합니다.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   탭 2: 등급별 상금 분석
   ════════════════════════════════════════════════════ */
function Tab2Grade({ data }: { data: ApiData }) {
  // 등급별 데이터 가공
  const gradeMap = useMemo(() => {
    const m = new Map<number, Record<string, { total: number | null; avg: number | null; count: number }>>();
    for (const r of data.byGrade) {
      if (!m.has(r.out_year)) m.set(r.out_year, {});
      m.get(r.out_year)![r.out_grade] = { total: r.out_total_prize, avg: r.out_avg_per_race, count: r.out_race_count };
    }
    return m;
  }, [data.byGrade]);

  const barData = YEARS.filter((y) => {
    const g = gradeMap.get(y);
    return g && Object.values(g).some((v) => v.total && v.total > 0);
  }).map((y) => {
    const g = gradeMap.get(y)!;
    return { year: y, 선발: g["선발"]?.total || 0, 우수: g["우수"]?.total || 0, 특선: g["특선"]?.total || 0 };
  });

  const lineData = YEARS.filter((y) => {
    const g = gradeMap.get(y);
    return g && Object.values(g).some((v) => v.avg && v.avg > 0);
  }).map((y) => {
    const g = gradeMap.get(y)!;
    return { year: y, 선발: g["선발"]?.avg || null, 우수: g["우수"]?.avg || null, 특선: g["특선"]?.avg || null };
  });

  // 등급간 격차
  const gapMap = useMemo(() => {
    const m = new Map<number, Record<string, Record<number, number>>>();
    for (const r of data.gradeGap) {
      if (!m.has(r.year)) m.set(r.year, {});
      if (!m.get(r.year)![r.grade]) m.get(r.year)![r.grade] = {};
      m.get(r.year)![r.grade][r.rank] = r.amount;
    }
    return m;
  }, [data.gradeGap]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">등급별 상금 격차와 연도별 인상률을 분석합니다. 협약서가 수집된 연도(2024~2025년)는 실제 데이터, 나머지는 수집 예정입니다.</p>

      {/* A: 등급별 성적상금 총액 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">등급별 성적상금 총액 비교</CardTitle></CardHeader>
        <CardContent>
          {barData.length === 0 ? <p className="text-muted-foreground text-center py-8">수집된 데이터 없음</p> : (
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${toEok(v)}억`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number | undefined) => [`${toEok(v || 0)}억`, undefined]} />
                  <Legend />
                  <Bar dataKey="선발" fill={GRADE_COLORS.선발} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="우수" fill={GRADE_COLORS.우수} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="특선" fill={GRADE_COLORS.특선} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B: 1경주 평균 상금 */}
      {lineData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">등급별 1경주 평균 상금</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${toMan(v)}만`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number | undefined) => [`${toMan(v || 0)}만원`, undefined]} />
                  <Legend />
                  <Line type="monotone" dataKey="선발" stroke={GRADE_COLORS.선발} strokeWidth={2} connectNulls={false} />
                  <Line type="monotone" dataKey="우수" stroke={GRADE_COLORS.우수} strokeWidth={2} connectNulls={false} />
                  <Line type="monotone" dataKey="특선" stroke={GRADE_COLORS.특선} strokeWidth={2} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* C: 등급간 상금 격차 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">등급간 상금 격차 (1일차 기준)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead className="text-right">선발1위</TableHead>
                  <TableHead className="text-right">우수1위</TableHead>
                  <TableHead className="text-right">특선1위</TableHead>
                  <TableHead className="text-right">우수/선발</TableHead>
                  <TableHead className="text-right">특선/선발</TableHead>
                  <TableHead className="text-right">특선7위/선발1위</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {YEARS.map((y) => {
                  const g = gapMap.get(y);
                  if (!g) return <TableRow key={y}><TableCell className="font-medium">{y}</TableCell>{Array(6).fill(0).map((_, i) => <TableCell key={i} className="text-right text-muted-foreground">-</TableCell>)}</TableRow>;
                  const s1 = g["선발"]?.[1], u1 = g["우수"]?.[1], t1 = g["특선"]?.[1], t7 = g["특선"]?.[7];
                  return (
                    <TableRow key={y}>
                      <TableCell className="font-medium">{y}</TableCell>
                      <TableCell className="text-right">{s1 ? `${s1}천원` : "-"}</TableCell>
                      <TableCell className="text-right">{u1 ? `${u1}천원` : "-"}</TableCell>
                      <TableCell className="text-right">{t1 ? `${t1}천원` : "-"}</TableCell>
                      <TableCell className="text-right">{s1 && u1 ? `${(u1 / s1).toFixed(2)}배` : "-"}</TableCell>
                      <TableCell className="text-right">{s1 && t1 ? `${(t1 / s1).toFixed(2)}배` : "-"}</TableCell>
                      <TableCell className="text-right font-bold">{s1 && t7 ? `${(t7 / s1).toFixed(2)}배` : "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">특선7위/선발1위 배율이 낮을수록 선발에게 불리한 협약 구조</p>
        </CardContent>
      </Card>

      {/* D: 인상률 비교 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">연도별 인상률 비교</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead className="text-right">공단발표</TableHead>
                  <TableHead className="text-right">선발1위</TableHead>
                  <TableHead className="text-right">우수1위</TableHead>
                  <TableHead className="text-right">특선1위</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {YEARS.map((y) => {
                  const g = gapMap.get(y);
                  const gPrev = gapMap.get(y - 1);
                  const hasData = g && gPrev;
                  const announced = (y === 2025 || y === 2024) ? "2.35%" : "-";
                  const calcDiff = (grade: string) => {
                    if (!hasData) return "-";
                    const cur = g[grade]?.[1], prev = gPrev[grade]?.[1];
                    if (!cur || !prev) return "-";
                    const diff = cur - prev;
                    return `${diff > 0 ? "+" : ""}${diff}천 (${((diff / prev) * 100).toFixed(1)}%)`;
                  };
                  return (
                    <TableRow key={y}>
                      <TableCell className="font-medium">{y}</TableCell>
                      <TableCell className="text-right">{announced}</TableCell>
                      <TableCell className="text-right">{calcDiff("선발")}</TableCell>
                      <TableCell className="text-right">{calcDiff("우수")}</TableCell>
                      <TableCell className="text-right">{calcDiff("특선")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">인상률이 동일해도 절대 금액 차이로 고액 선수가 더 많이 올라감</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   탭 3: 비성적상금 분석
   ════════════════════════════════════════════════════ */
function Tab3NonPerf({ data }: { data: ApiData }) {
  const allowMap = useMemo(() => {
    const m = new Map<number, AllowanceRow>();
    for (const r of data.allowances) if (r.grade === "특선") m.set(r.year, r);
    return m;
  }, [data.allowances]);

  const entryLine = YEARS.map((y) => ({ year: y, value: allowMap.get(y)?.entry_fee_per_day || 300000 }));
  const safetyLine = YEARS.map((y) => ({ year: y, value: allowMap.get(y)?.safety_fee_per_day || 0 }));

  return (
    <div className="space-y-4">
      {/* 출전상금 동결 배너 */}
      <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        <strong>출전상금은 2015년부터 2025년까지 11년간 1일당 300,000원으로 동결되었습니다</strong>
      </div>

      {/* A: 출전상금 추이 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">출전상금 1일당 금액 추이</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={entryLine} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis domain={[200000, 400000]} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 12 }} />
                <ReferenceLine y={300000} stroke="#EF4444" strokeDasharray="6 4" label={{ value: "300,000원 (11년 동결)", fill: "#EF4444", fontSize: 11 }} />
                <ReferenceLine y={364000} stroke="#9CA3AF" strokeDasharray="3 3" label={{ value: "물가반영 시 ~364,000원", fill: "#9CA3AF", fontSize: 10 }} />
                <Tooltip formatter={(v: number | undefined) => [`${(v || 0).toLocaleString()}원`]} />
                <Line type="monotone" dataKey="value" stroke={COLORS.출전} strokeWidth={2} name="출전상금" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* B: 안전상금 변화 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">안전상금 1일당 금액 추이</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={safetyLine} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 120000]} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 12 }} />
                <ReferenceLine x={2021} stroke="#F59E0B" strokeDasharray="6 4" label={{ value: "2021년 인상 (6→8만원, +33.3%)", fill: "#F59E0B", fontSize: 11 }} />
                <Tooltip formatter={(v: number | undefined) => [`${(v || 0).toLocaleString()}원`]} />
                <Line type="stepAfter" dataKey="value" stroke={COLORS.안전} strokeWidth={2} name="안전상금" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* C: 종합 테이블 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">출전상금·안전상금·출전준비금 종합</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead className="text-right">출전상금/일</TableHead>
                  <TableHead className="text-right">안전상금/일</TableHead>
                  <TableHead className="text-right">출전준비금/회차</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {YEARS.map((y, i) => {
                  const a = allowMap.get(y);
                  const prev = allowMap.get(YEARS[i - 1]);
                  const safetyChanged = prev && a && a.safety_fee_per_day !== prev.safety_fee_per_day;
                  return (
                    <TableRow key={y}>
                      <TableCell className="font-medium">{y}</TableCell>
                      <TableCell className="text-right">{a ? `${a.entry_fee_per_day.toLocaleString()}원` : "-"}</TableCell>
                      <TableCell className={`text-right ${safetyChanged ? "text-blue-600 font-bold" : ""}`}>
                        {a ? `${a.safety_fee_per_day.toLocaleString()}원` : "-"}
                        {safetyChanged && <span className="text-xs ml-1">↑</span>}
                      </TableCell>
                      <TableCell className="text-right">{a ? `${a.prep_fee.toLocaleString()}원` : "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* D: 비성적상금 총지급액 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">비성적상금 연간 총지급액</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead className="text-right">출전상금</TableHead>
                  <TableHead className="text-right">안전상금</TableHead>
                  <TableHead className="text-right">출전준비금</TableHead>
                  <TableHead className="text-right font-bold">비성적 합계</TableHead>
                  <TableHead className="text-right">전체 대비</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.yearly.map((r) => {
                  const nonPerf = r.entry_prize + r.safety_prize + r.prep_prize;
                  const ratio = r.has_performance_data ? ((nonPerf / r.total_prize) * 100).toFixed(1) : null;
                  return (
                    <TableRow key={r.year}>
                      <TableCell className="font-medium">{r.year}</TableCell>
                      <TableCell className="text-right">{toEok(r.entry_prize)}억</TableCell>
                      <TableCell className="text-right">{toEok(r.safety_prize)}억</TableCell>
                      <TableCell className="text-right">{toEok(r.prep_prize)}억</TableCell>
                      <TableCell className="text-right font-bold">{toEok(nonPerf)}억</TableCell>
                      <TableCell className="text-right">{ratio ? `${ratio}%` : <span className="text-muted-foreground text-xs">성적상금 미포함</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   탭 4: 낙차·안전 분석
   ════════════════════════════════════════════════════ */
function Tab4Safety({ data }: { data: ApiData }) {
  const allowMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of data.allowances) if (r.grade === "특선") m.set(r.year, r.safety_fee_per_day);
    return m;
  }, [data.allowances]);

  const chartData = data.participation.map((r) => ({
    year: r.out_year,
    낙차건수: r.out_fall_count,
    낙차율: parseFloat(r.out_fall_rate),
  }));

  const safetyDetail = data.participation.map((r) => {
    const fee = allowMap.get(r.out_year) || 0;
    const paid = (r.out_entry_count - r.out_fall_count) * fee;
    const unpaid = r.out_fall_count * fee;
    return {
      year: r.out_year, entries: r.out_entry_count, falls: r.out_fall_count,
      rate: r.out_fall_rate, fee, paid, unpaid,
      unpaidRate: r.out_entry_count > 0 ? ((r.out_fall_count / r.out_entry_count) * 100).toFixed(2) : "0",
    };
  });

  const stackData = safetyDetail.map((r) => ({ year: r.year, 지급: r.paid, 미지급: r.unpaid }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">낙차 발생 현황과 안전상금 지급 관계를 분석합니다. 낙차 선수는 해당 경주의 안전상금을 지급받지 못합니다.</p>

      {/* A: 낙차 추이 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">낙차 발생 추이</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="낙차건수" fill="#F87171" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="낙차율" stroke="#7C3AED" strokeWidth={2} name="낙차율(%)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* B: 안전상금 지급 vs 미지급 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">안전상금 지급액 vs 미지급액</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${toEok(v)}억`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number | undefined) => [`${toEok(v || 0)}억`]} />
                <Legend />
                <Bar dataKey="지급" stackId="a" fill="#22C55E" />
                <Bar dataKey="미지급" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* C: 상세 테이블 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">낙차·안전상금 상세</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead className="text-right">총출전</TableHead>
                  <TableHead className="text-right">낙차</TableHead>
                  <TableHead className="text-right">낙차율</TableHead>
                  <TableHead className="text-right">단가</TableHead>
                  <TableHead className="text-right">지급총액</TableHead>
                  <TableHead className="text-right">미지급액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safetyDetail.map((r) => (
                  <TableRow key={r.year}>
                    <TableCell className="font-medium">{r.year}</TableCell>
                    <TableCell className="text-right">{r.entries.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.falls}</TableCell>
                    <TableCell className="text-right">{r.rate}%</TableCell>
                    <TableCell className="text-right">{r.fee.toLocaleString()}원</TableCell>
                    <TableCell className="text-right">{toEok(r.paid)}억</TableCell>
                    <TableCell className="text-right text-red-500">{toMan(r.unpaid)}만</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* D: 분석 코멘트 */}
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 space-y-1">
            <p>2023년부터 낙차율이 증가하는 추세입니다.</p>
            <p>낙차율이 높아질수록 선수가 받는 안전상금이 줄어들어 실질 수입이 감소합니다.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   탭 5: 매출 대비 상금 비율
   ════════════════════════════════════════════════════ */
function Tab5Sales({ data }: { data: ApiData }) {
  const salesData = data.participation.map((r) => ({
    year: r.out_year,
    매출: r.out_total_sales,
    경주수: r.out_race_count,
  }));

  const yearlyMap = useMemo(() => {
    const m = new Map<number, YearlyRow>();
    for (const r of data.yearly) m.set(r.year, r);
    return m;
  }, [data.yearly]);

  const ratioData = data.participation.map((r) => {
    const yr = yearlyMap.get(r.out_year);
    const nonPerf = yr ? yr.entry_prize + yr.safety_prize + yr.prep_prize : 0;
    const totalPrize = yr?.total_prize || 0;
    return {
      year: r.out_year,
      비성적비율: r.out_total_sales > 0 ? (nonPerf / r.out_total_sales) * 100 : 0,
      전체비율: yr?.has_performance_data && r.out_total_sales > 0 ? (totalPrize / r.out_total_sales) * 100 : null,
    };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">경륜 총매출 대비 선수 상금 지급 비율을 분석합니다. 매출이 감소해도 상금이 동결되면 공단 수익성이 개선됩니다.</p>

      {/* A: 연도별 총매출 추이 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">연도별 총매출 추이</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_0000_0000_0000).toFixed(1)}조`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number | undefined) => [`${((v || 0) / 1_0000_0000).toFixed(0)}억원`]} />
                <Bar dataKey="매출" radius={[4, 4, 0, 0]}>
                  {salesData.map((e) => <Cell key={e.year} fill={COVID.has(e.year) ? "#FDBA74" : "#60A5FA"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* B: 매출 대비 상금 비율 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">매출 대비 상금 비율</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ratioData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number | string | undefined) => [typeof v === "number" ? `${v.toFixed(2)}%` : "-"]} />
                <Legend />
                <Line type="monotone" dataKey="비성적비율" stroke="#22C55E" strokeWidth={2} name="비성적상금/매출" />
                <Line type="monotone" dataKey="전체비율" stroke="#3B82F6" strokeWidth={2} name="전체상금/매출" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* C: 상세 테이블 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">매출 대비 상금 상세</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead className="text-right">총매출</TableHead>
                  <TableHead className="text-right">총상금</TableHead>
                  <TableHead className="text-right">비율</TableHead>
                  <TableHead className="text-right">1경주 매출</TableHead>
                  <TableHead className="text-right">1경주 상금</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.participation.map((r) => {
                  const yr = yearlyMap.get(r.out_year);
                  const totalPrize = yr?.total_prize || 0;
                  const ratio = r.out_total_sales > 0 ? (totalPrize / r.out_total_sales * 100).toFixed(2) : "-";
                  const perRaceSales = r.out_race_count > 0 ? r.out_total_sales / r.out_race_count : 0;
                  const perRacePrize = r.out_race_count > 0 ? totalPrize / r.out_race_count : 0;
                  return (
                    <TableRow key={r.out_year} className={COVID.has(r.out_year) ? "bg-orange-50" : ""}>
                      <TableCell className="font-medium">{r.out_year}</TableCell>
                      <TableCell className="text-right">{(r.out_total_sales / 1_0000_0000).toFixed(0)}억</TableCell>
                      <TableCell className="text-right">
                        {toEok(totalPrize)}억
                        {yr && !yr.has_performance_data && <span className="text-[10px] text-muted-foreground block">(성적미포함)</span>}
                      </TableCell>
                      <TableCell className="text-right">{ratio}%</TableCell>
                      <TableCell className="text-right">{toMan(perRaceSales)}만</TableCell>
                      <TableCell className="text-right">{toMan(perRacePrize)}만</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   탭 6: 경주유형별 분석
   ════════════════════════════════════════════════════ */
function Tab6Event({ data }: { data: ApiData }) {
  const srSummary = useMemo(() => {
    const m = new Map<number, { gii: number; gi: number; gp: number; full: number; partial: number }>();
    for (const y of YEARS) m.set(y, { gii: 0, gi: 0, gp: 0, full: 0, partial: 0 });
    for (const r of data.specialRounds) {
      const s = m.get(r.year);
      if (!s) continue;
      if (r.race_type === "대상GII") s.gii++;
      if (r.race_type === "왕중왕GI") s.gi++;
      if (r.race_type === "그랑프리GP") s.gp++;
      if (r.grade_scope === "전등급") s.full++;
      else s.partial++;
    }
    return m;
  }, [data.specialRounds]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">일반경륜, 대상경륜(GII), 왕중왕전(GI), 그랑프리(GP) 별 상금 분석. 데이터가 수집된 2024~2025년 기준입니다.</p>

      {/* 연간 특별경주 현황 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">연간 특별경주 현황</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>연도</TableHead>
                  <TableHead className="text-right">대상GII</TableHead>
                  <TableHead className="text-right">왕중왕GI</TableHead>
                  <TableHead className="text-right">그랑프리GP</TableHead>
                  <TableHead className="text-right">전등급대상</TableHead>
                  <TableHead className="text-right">특선만대상</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {YEARS.map((y) => {
                  const s = srSummary.get(y)!;
                  const total = s.gii + s.gi + s.gp;
                  return (
                    <TableRow key={y} className={total === 0 ? "text-muted-foreground" : ""}>
                      <TableCell className="font-medium">{y}</TableCell>
                      <TableCell className="text-right">{s.gii || "-"}</TableCell>
                      <TableCell className="text-right">{s.gi || "-"}</TableCell>
                      <TableCell className="text-right">{s.gp || "-"}</TableCell>
                      <TableCell className="text-right">{s.full || "-"}</TableCell>
                      <TableCell className="text-right">{s.partial || "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">전등급대상: 선발/우수/특선 모두 대회 상금 적용. 특선만대상: 특선만 대회 상금, 우수/선발은 일반 상금.</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   탭 7: 데이터 수집 현황
   ════════════════════════════════════════════════════ */
function Tab7Status({ data }: { data: ApiData }) {
  const yearlyMap = useMemo(() => {
    const m = new Map<number, YearlyRow>();
    for (const r of data.yearly) m.set(r.year, r);
    return m;
  }, [data.yearly]);

  const collected = YEARS.filter((y) => yearlyMap.get(y)?.has_performance_data).length;
  const pct = Math.round((collected / YEARS.length) * 100);

  const notes: Record<number, string> = {
    2015: "수집 전 기간", 2016: "수집 전 기간", 2017: "수집 전 기간",
    2018: "수집 전 기간", 2019: "수집 전 기간",
    2020: "코로나 축소운영", 2021: "코로나 축소 + 안전상금 인상",
    2022: "정상 운영 복귀", 2023: "정상 운영",
    2024: "협약서 수집 완료", 2025: "협약서 수집 완료",
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">협약서 수집 현황 및 계산 완성도</p>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {YEARS.map((y) => {
          const yr = yearlyMap.get(y);
          const hasPerfData = yr?.has_performance_data || false;
          return (
            <div key={y} className={`rounded-lg border p-4 ${hasPerfData ? "border-green-300 bg-green-50" : "border-yellow-300 bg-yellow-50"}`}>
              <p className="text-2xl font-bold">{y}</p>
              <p className="text-xs mt-1">
                성적상금: {hasPerfData
                  ? <span className="text-green-600 font-medium">완성</span>
                  : <span className="text-yellow-600 font-medium">협약서 수집 예정</span>}
              </p>
              <p className="text-xs">비성적상금: <span className="text-green-600 font-medium">완성</span></p>
              <p className="text-xs text-muted-foreground mt-1">{notes[y] || ""}</p>
            </div>
          );
        })}
      </div>

      {/* 진행률 */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium mb-2">성적상금 수집: {collected}/{YEARS.length}년 ({pct}%)</p>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div className="bg-green-500 h-4 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            협약서가 확보되면 아래 연도 순으로 입력 예정:<br />
            2023년 → 2022년 → 2021년 → 2020년 → 2019년 → 2018년 → 2017년 → 2016년 → 2015년
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── 공용 컴포넌트 ── */
function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function StackTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; color: string; value: number; payload: { _raw: YearlyRow } }>; label?: number }) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload?._raw;
  const isCovid = label ? COVID.has(label) : false;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow text-sm">
      <p className="font-bold mb-1">{label}년{isCovid && <span className="text-orange-500 font-normal ml-1">(코로나 영향)</span>}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {p.dataKey === "성적상금" && raw && !raw.has_performance_data ? "미수집" : `${toEok(p.value)}억`}
        </p>
      ))}
      {raw && (
        <p className="font-bold mt-1 pt-1 border-t">
          합계: {toEok(raw.total_prize)}억
          {!raw.has_performance_data && <span className="text-xs text-muted-foreground font-normal"> (성적상금 미포함)</span>}
        </p>
      )}
    </div>
  );
}
