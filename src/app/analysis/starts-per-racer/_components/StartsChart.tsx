"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceDot,
} from "recharts";
import type { YearlyStarts } from "@/lib/starts-per-racer";
import { COVID_YEARS, IN_PROGRESS_YEAR } from "@/lib/starts-per-racer";

const BRAND = "#2563EB";
const MUTED = "#9CA3AF";

interface Point extends YearlyStarts {
  /** 정상 운영 연도 (실선) */
  normal: number | null;
  /** 코로나 축소 운영 (회색 점선) */
  covid: number | null;
  /** 진행 중 연도 (회색 실선) */
  partial: number | null;
}

/**
 * 한 개의 Line 으로는 구간별 선 스타일을 나눌 수 없어 3개 시리즈로 분리한다.
 * 경계 연도는 두 시리즈에 함께 넣어야 선이 끊기지 않는다 (점은 소유 구간에만 찍는다).
 */
function toPoints(rows: YearlyStarts[]): Point[] {
  const covidStart = COVID_YEARS[0];
  const covidEnd = COVID_YEARS[COVID_YEARS.length - 1];
  return rows.map((r) => {
    const y = r.year;
    const inCovid = y >= covidStart && y <= covidEnd;
    const inPartial = y >= IN_PROGRESS_YEAR;
    return {
      ...r,
      normal: !inCovid && !inPartial ? r.avgStarts : null,
      // 2019→2020, 2021→2022 연결선까지 점선으로 잇는다
      covid: y >= covidStart - 1 && y <= covidEnd + 1 ? r.avgStarts : null,
      partial: y >= IN_PROGRESS_YEAR - 1 ? r.avgStarts : null,
    };
  });
}

function ownDot(owns: (year: number) => boolean, fill: string) {
  return function Dot(props: { cx?: number; cy?: number; payload?: Point }) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload || !owns(payload.year)) {
      return <g />;
    }
    return <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="#fff" strokeWidth={1.5} />;
  };
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const note = COVID_YEARS.includes(d.year)
    ? "코로나로 축소 운영"
    : d.year >= IN_PROGRESS_YEAR
      ? "진행 중"
      : null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{d.year}년</p>
      <p className="mt-1 text-foreground">
        1인당 <span className="font-semibold">{d.avgStarts.toFixed(2)}회</span>
      </p>
      <p className="text-muted-foreground">선수 {d.racerCount.toLocaleString()}명</p>
      <p className="text-muted-foreground">총 {d.totalRaces.toLocaleString()}경주</p>
      {note && <p className="mt-1 text-[11px] text-amber-600">※ {note}</p>}
    </div>
  );
}

export function StartsChart({
  rows,
  peakYear,
  latestFullYear,
}: {
  rows: YearlyStarts[];
  peakYear: YearlyStarts;
  latestFullYear: YearlyStarts;
}) {
  const data = useMemo(() => toPoints(rows), [rows]);
  const years = rows.map((r) => r.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  // 2010, 2012, ... 형태로 격년 표시 — 375px 화면에서도 라벨이 겹치지 않는다
  const ticks = years.filter((y) => (y - minYear) % 2 === 0);
  const covidStart = COVID_YEARS[0];
  const covidEnd = COVID_YEARS[COVID_YEARS.length - 1];

  return (
    <div>
      <div className="h-[280px] w-full sm:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 24, right: 16, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <ReferenceArea
              x1={covidStart - 0.5}
              x2={covidEnd + 0.5}
              fill={MUTED}
              fillOpacity={0.12}
            />
            <XAxis
              type="number"
              dataKey="year"
              domain={[minYear, maxYear]}
              ticks={ticks}
              tickFormatter={(v: number) => `${v}`}
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              domain={[0, 20]}
              ticks={[0, 5, 10, 15, 20]}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line
              dataKey="normal"
              name="정상 운영"
              stroke={BRAND}
              strokeWidth={2.5}
              connectNulls={false}
              dot={ownDot((y) => !COVID_YEARS.includes(y) && y < IN_PROGRESS_YEAR, BRAND)}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="covid"
              name="코로나 축소 운영"
              stroke={MUTED}
              strokeWidth={2}
              strokeDasharray="5 4"
              connectNulls={false}
              dot={ownDot((y) => COVID_YEARS.includes(y), MUTED)}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="partial"
              name="진행 중"
              stroke={MUTED}
              strokeWidth={2.5}
              connectNulls={false}
              dot={ownDot((y) => y >= IN_PROGRESS_YEAR, MUTED)}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={peakYear.year}
              y={peakYear.avgStarts}
              r={0}
              label={{
                value: `최고 ${peakYear.avgStarts.toFixed(2)}`,
                position: "top",
                fontSize: 11,
                fill: BRAND,
                fontWeight: 600,
              }}
            />
            <ReferenceDot
              x={latestFullYear.year}
              y={latestFullYear.avgStarts}
              r={0}
              label={{
                value: `${latestFullYear.avgStarts.toFixed(2)}`,
                position: "top",
                fontSize: 11,
                fill: BRAND,
                fontWeight: 600,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5" style={{ background: BRAND }} />
          정상 운영
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-5"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${MUTED} 0 5px, transparent 5px 9px)`,
            }}
          />
          {COVID_YEARS.join("·")}년 코로나 축소 운영
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5" style={{ background: MUTED }} />
          {IN_PROGRESS_YEAR}년 진행 중
        </span>
      </div>
    </div>
  );
}
