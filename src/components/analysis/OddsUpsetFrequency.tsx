"use client";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { raceData, getUpsetFrequencyByVenue } from "@/data/odds-data";

const COLORS = ["#3B82F6", "#F59E0B", "#DC2626", "#10B981"];

export default function OddsUpsetFrequency() {
  const data = getUpsetFrequencyByVenue(raceData);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">경륜장별 이변(고배당) 발생 빈도</CardTitle>
        <p className="text-sm text-muted-foreground">
          단승 10배 이상을 &quot;이변&quot;으로 정의
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="경륜장"
                tick={{ fontSize: 13, fill: "#6B7280" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6B7280" }}
                tickFormatter={(v) => `${v}%`}
                label={{
                  value: "이변 빈도 (%)",
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
                formatter={(value: any, name: any) => {
                  if (name === "이변빈도") return [`${value}%`, "이변 비율"];
                  return [value, name];
                }}
              />
              <Bar dataKey="이변빈도" radius={[6, 6, 0, 0]} barSize={60}>
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {data.map((d, i) => (
            <div key={d.경륜장} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[i] }} />
                <span className="font-medium">{d.경륜장}</span>
              </div>
              <span className="text-muted-foreground">
                {d.총경주수.toLocaleString()}경주 중 {d.이변횟수}회 ({d.이변빈도}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
