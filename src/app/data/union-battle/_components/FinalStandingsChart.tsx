"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { StandingRow, PRO_COLOR, LABOR_COLOR, VENUES, GRADES } from "../types";

type Metric = "win" | "top2" | "top3";
const METRIC_LABEL: Record<Metric, string> = {
  win: "우승 (1착)",
  top2: "연대 (2착 이내)",
  top3: "삼연대 (3착 이내)",
};

function share(row: StandingRow, m: Metric): { pro: number; total: number; pct: number } {
  const total = m === "win" ? row.win : m === "top2" ? row.top2 : row.top3;
  const pro = m === "win" ? row.winPro : m === "top2" ? row.top2Pro : row.top3Pro;
  return { pro, total, pct: total > 0 ? (pro / total) * 100 : 0 };
}

export function FinalStandingsChart({ rows }: { rows: StandingRow[] }) {
  const [metric, setMetric] = useState<Metric>("win");
  const get = (v: string, g: string) => rows.find((r) => r.venue === v && r.grade === g);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              metric === m ? "bg-brand text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {VENUES.map((v) => (
          <div key={v}>
            <div className="mb-1 text-xs font-semibold text-foreground">{v}</div>
            <div className="space-y-1.5">
              {GRADES.map((g) => {
                const row = get(v, g);
                if (!row || row.win === 0)
                  return (
                    <div key={g} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="w-8 shrink-0">{g}</span>
                      <span className="opacity-60">데이터 없음</span>
                    </div>
                  );
                const s = share(row, metric);
                return (
                  <div key={g} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[11px] font-medium text-muted-foreground">{g}</span>
                    <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="absolute inset-y-0 left-0 flex items-center justify-end pr-1.5"
                        style={{ width: `${s.pct}%`, backgroundColor: PRO_COLOR }}
                      >
                        {s.pct >= 22 && (
                          <span className="text-[10px] font-bold text-white">{s.pct.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                    <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                      {s.pro}/{s.total}
                      {row.small && (
                        <AlertTriangle className="ml-0.5 inline h-3 w-3 text-amber-500" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: PRO_COLOR }} />
          프로연합
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: LABOR_COLOR }} />
          노동자연합
        </span>
        <span className="ml-auto">{METRIC_LABEL[metric]} 중 프로 점유율</span>
      </div>
    </div>
  );
}
