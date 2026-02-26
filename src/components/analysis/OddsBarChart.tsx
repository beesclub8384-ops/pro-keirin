"use client";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { raceData, getAverageOddsByVenue } from "@/data/odds-data";

export default function OddsBarChart() {
  const data = getAverageOddsByVenue(raceData);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">경륜장별 평균 배당률 비교</CardTitle>
        <p className="text-sm text-muted-foreground">
          단승 / 쌍승 / 삼쌍승 기준
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] sm:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="경륜장"
                tick={{ fontSize: 13, fill: "#6B7280" }}
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
              <Bar dataKey="단승" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="쌍승" fill="#DC2626" radius={[4, 4, 0, 0]} />
              <Bar dataKey="삼쌍승" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 text-xs text-muted-foreground text-center">
          * 경주 수: {data.map((d) => `${d.경륜장} ${d.경주수.toLocaleString()}회`).join(" / ")}
        </div>
      </CardContent>
    </Card>
  );
}
