"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface YearlyEntry {
  year: number;
  racer_count: number;
  avg_race_count: number;
}

export default function StatisticsPage() {
  const [data, setData] = useState<YearlyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/data/statistics?type=avg-entries");
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
        통계 데이터를 불러오는 중...
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

  const maxAvg = Math.ceil(Math.max(...data.map((d) => d.avg_race_count)));
  const maxRacers = Math.ceil(Math.max(...data.map((d) => d.racer_count)) / 100) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">통계</h1>
        <p className="text-sm text-muted-foreground mt-1">
          광명 경륜 연도별 출주 통계 (2003~)
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">연도별 선수 1인당 평균 출주횟수</CardTitle>
          <p className="text-sm text-muted-foreground">
            선수 프로필 기준 (race_count), 막대: 활동 선수 수 / 선: 평균 출주횟수
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] sm:h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  tickFormatter={(v) => `'${String(v).slice(2)}`}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  domain={[0, maxRacers]}
                  label={{
                    value: "활동 선수 수",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#6B7280" },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  domain={[0, maxAvg + 5]}
                  label={{
                    value: "평균 출주횟수",
                    angle: 90,
                    position: "insideRight",
                    style: { fontSize: 12, fill: "#6B7280" },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #E5E7EB",
                    fontSize: "13px",
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => {
                    if (name === "활동 선수 수") return [`${value}명`, name];
                    if (name === "평균 출주횟수") return [`${value}회`, name];
                    return [`${Number(value).toLocaleString()}건`, name];
                  }}
                  labelFormatter={(label) => `${label}년`}
                />
                <Legend wrapperStyle={{ fontSize: "13px" }} />
                <Bar
                  yAxisId="left"
                  dataKey="racer_count"
                  name="활동 선수 수"
                  fill="#93C5FD"
                  radius={[2, 2, 0, 0]}
                  barSize={20}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avg_race_count"
                  name="평균 출주횟수"
                  stroke="#DC2626"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#DC2626" }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 상세 테이블 */}
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
                  <th className="py-2 px-3 font-medium text-right">활동 선수</th>
                  <th className="py-2 px-3 font-medium text-right">평균 출주횟수</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((row) => (
                  <tr key={row.year} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-3">{row.year}</td>
                    <td className="py-2 px-3 text-right">{row.racer_count}명</td>
                    <td className="py-2 px-3 text-right font-semibold">
                      {row.avg_race_count}회
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
