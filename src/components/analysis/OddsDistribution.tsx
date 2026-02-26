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
import { raceData, getOddsDistribution } from "@/data/odds-data";

export default function OddsDistribution() {
  const data = getOddsDistribution(raceData, "단승");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">등급별 단승 배당 분포</CardTitle>
        <p className="text-sm text-muted-foreground">
          저배당(~5배) / 중배당(5~20배) / 고배당(20배~) 비율
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] sm:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: "#6B7280" }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="등급"
                tick={{ fontSize: 13, fill: "#6B7280" }}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #E5E7EB",
                  fontSize: "13px",
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [`${value}%`, name]}
              />
              <Legend wrapperStyle={{ fontSize: "13px" }} />
              <Bar dataKey="저배당" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="중배당" stackId="a" fill="#F59E0B" />
              <Bar dataKey="고배당" stackId="a" fill="#DC2626" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-blue-50 p-2">
            <div className="font-bold text-blue-600">저배당 (~5배)</div>
            <div className="text-muted-foreground">안정적 결과</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <div className="font-bold text-amber-600">중배당 (5~20배)</div>
            <div className="text-muted-foreground">적당한 이변</div>
          </div>
          <div className="rounded-lg bg-red-50 p-2">
            <div className="font-bold text-rose-600">고배당 (20배~)</div>
            <div className="text-muted-foreground">대이변</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
