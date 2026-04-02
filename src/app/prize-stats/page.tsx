"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PrizeStat {
  year: number;
  event_type: string;
  grade_group: string;
  total_prize: number | null;
  race_count: number;
  unmatched_count: number;
}

/** 억원 단위 포맷 */
function toEok(won: number): string {
  return (won / 1_0000_0000).toFixed(1);
}

/** 원 → 읽기 쉬운 표기 */
function formatWon(won: number): string {
  if (won >= 1_0000_0000) return `${toEok(won)}억`;
  if (won >= 1_0000) return `${(won / 1_0000).toFixed(0)}만`;
  return `${won.toLocaleString()}`;
}

export default function PrizeStatsPage() {
  const [data, setData] = useState<PrizeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prize-stats")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json.data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 연도별 총 상금 (막대 그래프용)
  const yearlyTotals = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of data) {
      if (row.total_prize) {
        map.set(row.year, (map.get(row.year) || 0) + row.total_prize);
      }
    }
    return Array.from({ length: 11 }, (_, i) => {
      const year = 2015 + i;
      const total = map.get(year) || 0;
      return { year, total, hasData: total > 0 };
    });
  }, [data]);

  // 연도별 등급별 합계 (테이블용)
  const yearlyByGrade = useMemo(() => {
    const map = new Map<number, { 선발: number; 우수: number; 특선: number }>();
    for (const row of data) {
      if (!row.total_prize || !row.grade_group) continue;
      if (!map.has(row.year)) map.set(row.year, { 선발: 0, 우수: 0, 특선: 0 });
      const entry = map.get(row.year)!;
      if (row.grade_group === "선발") entry.선발 += row.total_prize;
      if (row.grade_group === "우수") entry.우수 += row.total_prize;
      if (row.grade_group === "특선") entry.특선 += row.total_prize;
    }
    return Array.from({ length: 11 }, (_, i) => {
      const year = 2015 + i;
      const g = map.get(year);
      return {
        year,
        선발: g?.선발 || 0,
        우수: g?.우수 || 0,
        특선: g?.특선 || 0,
        합계: g ? g.선발 + g.우수 + g.특선 : 0,
        hasData: !!g,
      };
    });
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">데이터 로딩 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-red-500">에러: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* 제목 */}
      <div>
        <h1 className="text-2xl font-bold">경륜 상금 지급 통계</h1>
        <p className="text-muted-foreground mt-1">
          노조 단체교섭 자료 (작성 중)
        </p>
      </div>

      {/* 경고 배너 */}
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        <strong>안내:</strong> 2025년 데이터만 계산 완료. 2015~2024년은 상금
        협약서 수집 후 순차 업데이트 예정
      </div>

      {/* 연도별 총 상금 막대 그래프 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">연도별 총 상금 지급액</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yearlyTotals}
                margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  tickFormatter={(v) => (v === 0 ? "0" : `${toEok(v)}억`)}
                />
                <Tooltip
                  formatter={(value: number | undefined) => [
                    value && value > 0
                      ? `${formatWon(value)}원`
                      : "협약서 미수집",
                    "상금 합계",
                  ]}
                  labelFormatter={(label) => `${label}년`}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #E5E7EB",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {yearlyTotals.map((entry) => (
                    <Cell
                      key={entry.year}
                      fill={entry.hasData ? "#3B82F6" : "#D1D5DB"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            회색 막대 = 협약서 미수집 (상금 기준표 없음)
          </p>
        </CardContent>
      </Card>

      {/* 등급별 상금 비교 테이블 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">등급별 상금 지급 합계</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">연도</TableHead>
                  <TableHead className="text-right">선발</TableHead>
                  <TableHead className="text-right">우수</TableHead>
                  <TableHead className="text-right">특선</TableHead>
                  <TableHead className="text-right font-bold">
                    전체 합계
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yearlyByGrade.map((row) => (
                  <TableRow
                    key={row.year}
                    className={row.hasData ? "" : "text-muted-foreground"}
                  >
                    <TableCell className="font-medium">{row.year}</TableCell>
                    <TableCell className="text-right">
                      {row.hasData ? `${toEok(row.선발)}억` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.hasData ? `${toEok(row.우수)}억` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.hasData ? `${toEok(row.특선)}억` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {row.hasData ? `${toEok(row.합계)}억` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 데이터 출처 */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>
          본 통계는 kcycle.or.kr 출주표 및 경주결과 데이터를 기반으로
          계산되었습니다.
        </p>
        <p>
          일부 미수집 데이터로 인해 실제 지급액과 차이가 있을 수 있습니다.
        </p>
      </div>
    </div>
  );
}
