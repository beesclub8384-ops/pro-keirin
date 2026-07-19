"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendRow, GRADES } from "../types";

const VENUE_COLORS: Record<string, string> = {
  광명: "#2563eb",
  창원: "#16a34a",
  부산: "#ea580c",
};

export function TrendChart({ trend }: { trend: TrendRow[] }) {
  const [grade, setGrade] = useState<string>("우수");

  const data = useMemo(() => {
    const years = [2023, 2024, 2025];
    return years.map((y) => {
      const row: Record<string, number | string | null> = { year: `${y}` };
      for (const v of ["광명", "창원", "부산"]) {
        const found = trend.find(
          (t) => t.venue === v && t.grade === grade && t.year === y,
        );
        // 표본 극소(n<300) 는 라인에서 제외(null)해 오해 방지
        row[v] = found && found.n >= 300 ? found.proWinrate : null;
      }
      return row;
    });
  }, [trend, grade]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5">
        {GRADES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrade(g)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              grade === g
                ? "bg-brand text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" fontSize={12} />
            <YAxis domain={[45, 75]} fontSize={12} tickFormatter={(v) => `${v}%`} />
            <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" />
            <Tooltip
              formatter={(value, name) => [value == null ? "표본부족" : `${value}%`, name]}
            />
            <Legend />
            {["광명", "창원", "부산"].map((v) => (
              <Line
                key={v}
                type="monotone"
                dataKey={v}
                name={v}
                stroke={VENUE_COLORS[v]}
                strokeWidth={2.5}
                connectNulls
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        {grade}급 프로연합 맞대결 승률 추이 (50% = 대등, 표본 &lt;300 구간 제외)
      </p>
    </div>
  );
}
