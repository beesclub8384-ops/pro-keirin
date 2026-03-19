"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface YearlySales {
  year: number;
  총매출: number;
  선발매출: number;
  우수매출: number;
  특선매출: number;
  선발경주수: number;
  우수경주수: number;
  특선경주수: number;
  선발평균: number;
  우수평균: number;
  특선평균: number;
}

function 억(val: number): string {
  return (val / 1_0000_0000).toFixed(0);
}

function 억소수(val: number): string {
  return (val / 1_0000_0000).toFixed(1);
}

export default function SalesStatisticsPage() {
  const [data, setData] = useState<YearlySales[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/data/sales-statistics");
        if (!res.ok) throw new Error("데이터를 불러올 수 없습니다.");
        const json = await res.json();
        setData(json.data || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        매출 통계를 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        {error}
      </div>
    );
  }

  // 차트용 데이터 (억원 변환)
  const chartData = data.map((d) => ({
    year: d.year,
    총매출: Math.round(d.총매출 / 1_0000_0000),
    선발매출: Math.round(d.선발매출 / 1_0000_0000),
    우수매출: Math.round(d.우수매출 / 1_0000_0000),
    특선매출: Math.round(d.특선매출 / 1_0000_0000),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">매출 통계</h1>
        <p className="text-sm text-muted-foreground mt-1">
          광명 경륜 연도별 급별 매출 분석 (2003~)
        </p>
      </div>

      {/* 섹션1: 연간 총매출 추이 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">연간 총매출 추이</CardTitle>
          <p className="text-sm text-muted-foreground">
            경주별 매출 합계 (억원), 회색 구간: 코로나 축소 운영
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] sm:h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  tickFormatter={(v) => `'${String(v).slice(2)}`}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  tickFormatter={(v) => `${v}`}
                  label={{
                    value: "억원",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#6B7280" },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #E5E7EB",
                    fontSize: "13px",
                  }}
                  formatter={(value: number) => [`${value.toLocaleString()}억`, "총매출"]}
                  labelFormatter={(label) => `${label}년`}
                />
                <ReferenceArea
                  x1={2020}
                  x2={2021}
                  fill="#F3F4F6"
                  fillOpacity={0.8}
                  label={{ value: "코로나", fontSize: 11, fill: "#9CA3AF" }}
                />
                <Bar
                  dataKey="총매출"
                  fill="#3B82F6"
                  radius={[3, 3, 0, 0]}
                  barSize={24}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 섹션2: 급별 매출 비교 (스택) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">급별 매출 비교</CardTitle>
          <p className="text-sm text-muted-foreground">
            선발(파란) / 우수(초록) / 특선(빨간) 매출 누적 (억원)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] sm:h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  tickFormatter={(v) => `'${String(v).slice(2)}`}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  tickFormatter={(v) => `${v}`}
                  label={{
                    value: "억원",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#6B7280" },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #E5E7EB",
                    fontSize: "13px",
                  }}
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString()}억`,
                    name,
                  ]}
                  labelFormatter={(label) => `${label}년`}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                <Bar
                  dataKey="선발매출"
                  name="선발"
                  stackId="grade"
                  fill="#93C5FD"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="우수매출"
                  name="우수"
                  stackId="grade"
                  fill="#6EE7B7"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="특선매출"
                  name="특선"
                  stackId="grade"
                  fill="#FCA5A5"
                  radius={[3, 3, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 섹션3: 상세 테이블 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">연도별 상세 데이터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium">연도</th>
                  <th className="py-2 px-3 font-medium text-right">총매출</th>
                  <th className="py-2 px-3 font-medium text-right">선발 평균</th>
                  <th className="py-2 px-3 font-medium text-right">우수 평균</th>
                  <th className="py-2 px-3 font-medium text-right">특선 평균</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((row) => (
                  <tr
                    key={row.year}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className="py-2 px-3">{row.year}</td>
                    <td className="py-2 px-3 text-right font-semibold">
                      {억(row.총매출)}억
                    </td>
                    <td className="py-2 px-3 text-right text-blue-600">
                      {억소수(row.선발평균)}억
                    </td>
                    <td className="py-2 px-3 text-right text-green-600">
                      {억소수(row.우수평균)}억
                    </td>
                    <td className="py-2 px-3 text-right text-red-600">
                      {억소수(row.특선평균)}억
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
