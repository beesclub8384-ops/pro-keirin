"use client";

import { useState, useEffect } from "react";
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
  performance_prize: number;
  entry_prize: number;
  safety_prize: number;
  prep_prize: number;
  total_prize: number;
  unmatched_count: number;
  has_performance_data: boolean;
}

function toEok(won: number): string {
  return (won / 1_0000_0000).toFixed(1);
}

const COVID_YEARS = new Set([2020, 2021]);

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

  // 차트용 데이터 변환
  const chartData = data.map((row) => ({
    year: row.year,
    성적상금: row.has_performance_data ? row.performance_prize : 0,
    출전상금: row.entry_prize,
    안전상금: row.safety_prize,
    출전준비금: row.prep_prize,
    _raw: row,
  }));

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
      {/* 상단 제목 */}
      <div>
        <h1 className="text-2xl font-bold">경륜선수 상금 지급 통계</h1>
        <p className="text-muted-foreground mt-1">
          한국경륜선수노동조합 단체교섭 자료 (작성 중)
        </p>
      </div>

      {/* 경고 배너 */}
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        <strong>안내:</strong> 성적상금은 2025년만 계산 완료. 2015~2024년은
        협약서 수집 후 업데이트 예정.
      </div>

      {/* 연도별 총 상금 스택 막대 그래프 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">연도별 상금 지급액 구성</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  tickFormatter={(v) =>
                    v === 0 ? "0" : `${toEok(v)}억`
                  }
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const raw = payload[0]?.payload?._raw as
                      | PrizeStat
                      | undefined;
                    const isCovid = COVID_YEARS.has(label as number);
                    return (
                      <div className="rounded-lg border bg-white px-3 py-2 shadow text-sm">
                        <p className="font-bold mb-1">
                          {label}년
                          {isCovid && (
                            <span className="text-orange-500 font-normal ml-1">
                              (코로나 영향)
                            </span>
                          )}
                        </p>
                        {payload.map((p) => (
                          <p
                            key={p.dataKey as string}
                            style={{ color: p.color }}
                          >
                            {p.dataKey as string}:{" "}
                            {p.dataKey === "성적상금" &&
                            raw &&
                            !raw.has_performance_data
                              ? "미수집"
                              : `${toEok(p.value as number)}억`}
                          </p>
                        ))}
                        {raw && (
                          <p className="font-bold mt-1 pt-1 border-t">
                            합계: {toEok(raw.total_prize)}억
                            {!raw.has_performance_data && (
                              <span className="text-xs text-muted-foreground font-normal">
                                {" "}
                                (성적상금 미포함)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "13px" }}
                  iconType="square"
                />
                <Bar
                  dataKey="성적상금"
                  stackId="a"
                  fill="#3B82F6"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="출전상금"
                  stackId="a"
                  fill="#22C55E"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="안전상금"
                  stackId="a"
                  fill="#EAB308"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="출전준비금"
                  stackId="a"
                  fill="#9CA3AF"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 연도별 상세 테이블 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">연도별 상금 지급 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">연도</TableHead>
                  <TableHead className="text-right">성적상금</TableHead>
                  <TableHead className="text-right">출전상금</TableHead>
                  <TableHead className="text-right">안전상금</TableHead>
                  <TableHead className="text-right">출전준비금</TableHead>
                  <TableHead className="text-right font-bold">합계</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.year}>
                    <TableCell className="font-medium">
                      {row.year}
                      {COVID_YEARS.has(row.year) && (
                        <span className="text-[10px] text-orange-500 ml-0.5">
                          *
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right ${!row.has_performance_data ? "text-muted-foreground" : ""}`}
                    >
                      {row.has_performance_data
                        ? `${toEok(row.performance_prize)}억`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {toEok(row.entry_prize)}억
                    </TableCell>
                    <TableCell className="text-right">
                      {toEok(row.safety_prize)}억
                    </TableCell>
                    <TableCell className="text-right">
                      {toEok(row.prep_prize)}억
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {toEok(row.total_prize)}억
                      {!row.has_performance_data && (
                        <span className="text-[10px] text-muted-foreground font-normal block">
                          (성적상금 미포함)
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            * 2020~2021년은 코로나19로 경주 축소
          </p>
        </CardContent>
      </Card>

      {/* 하단 주석 */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>출전상금: 1일당 300,000원 × 출전일수 (2015~2025년 동결)</p>
        <p>
          안전상금: 1일당 60,000원(~2020) / 80,000원(2021~) × 낙차없이 완주한
          일수
        </p>
        <p>출전준비금: 회차당 100,000원 × 출전 선수-회차 조합 수</p>
        <p>성적상금: 등급·착순·일차별 기준 (2025년 협약서 기반)</p>
        <p>후보상금·소급분 등 비정기 항목 미포함</p>
        <p className="pt-1 border-t border-muted">
          본 통계는 kcycle.or.kr 데이터 기반으로 실제 지급액과 차이가 있을 수
          있음
        </p>
      </div>
    </div>
  );
}
