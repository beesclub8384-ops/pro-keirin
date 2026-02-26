"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { raceData, getMonthlyTrendByGrade } from "@/data/odds-data";

export default function OddsTrend() {
  const data = getMonthlyTrendByGrade(raceData);
  const dates = raceData.map((r) => r.date).sort();
  const periodLabel = dates.length > 0
    ? `${dates[0].slice(0, 7).replace("-", "년 ")}월 ~ ${dates[dates.length - 1].slice(0, 7).replace("-", "년 ")}월`
    : "";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">월별 단승 평균 배당 추이</CardTitle>
        <p className="text-sm text-muted-foreground">
          {periodLabel}, 등급별 월간 평균
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] sm:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="월"
                tick={{ fontSize: 12, fill: "#6B7280" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6B7280" }}
                label={{
                  value: "평균 배당 (배)",
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [`${value}배`, name]}
              />
              <Legend wrapperStyle={{ fontSize: "13px" }} />
              <Line type="monotone" dataKey="특선" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="우수" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="선발" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="전체" stroke="#6B7280" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
