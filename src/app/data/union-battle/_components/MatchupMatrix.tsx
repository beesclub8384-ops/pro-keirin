"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { MatrixCell, VENUES, GRADES } from "../types";

// 승률(50~72%)을 파란색 농도(0.1~1.0)로 매핑
function alphaFor(winrate: number | null): number {
  if (winrate == null) return 0;
  const clamped = Math.max(50, Math.min(72, winrate));
  return 0.12 + ((clamped - 50) / 22) * 0.88;
}

export function MatchupMatrix({ cells }: { cells: MatrixCell[] }) {
  const [sel, setSel] = useState<MatrixCell | null>(null);
  const get = (venue: string, grade: string) =>
    cells.find((c) => c.venue === venue && c.grade === grade);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-14 text-left text-xs font-medium text-muted-foreground" />
              {VENUES.map((v) => (
                <th key={v} className="text-center text-xs font-semibold text-foreground">
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRADES.map((g) => (
              <tr key={g}>
                <td className="text-xs font-semibold text-foreground">{g}</td>
                {VENUES.map((v) => {
                  const c = get(v, g);
                  const wr = c?.proWinrate ?? null;
                  const a = alphaFor(wr);
                  const active = sel?.venue === v && sel?.grade === g;
                  return (
                    <td key={v} className="p-0">
                      <button
                        type="button"
                        onClick={() => c && setSel(active ? null : c)}
                        title={
                          c
                            ? `${v} ${g}: 프로 ${wr ?? "-"}% (n=${c.decisive.toLocaleString()})${c.small ? " ⚠️표본극소" : ""}`
                            : undefined
                        }
                        className={`relative flex aspect-[4/3] w-full min-w-[68px] flex-col items-center justify-center rounded-md transition-all ${
                          active ? "ring-2 ring-brand" : ""
                        }`}
                        style={{
                          backgroundColor: `rgba(37, 99, 235, ${a})`,
                          color: a > 0.55 ? "white" : "#1e293b",
                        }}
                      >
                        {c?.small && (
                          <AlertTriangle
                            className="absolute right-1 top-1 h-3 w-3 opacity-80"
                          />
                        )}
                        <span className="text-base font-bold leading-none sm:text-lg">
                          {wr != null ? `${wr}%` : "—"}
                        </span>
                        <span className="mt-0.5 text-[10px] opacity-80">
                          n={c ? c.decisive.toLocaleString() : 0}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>프로연합 맞대결 승률 (일반+준결, 양진영 2명↑)</span>
        <span className="flex items-center gap-1">
          50%
          <span className="inline-block h-3 w-16 rounded-sm bg-gradient-to-r from-blue-100 to-blue-600" />
          70%↑
        </span>
      </div>

      {/* 선택 상세 */}
      {sel && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            {sel.venue} · {sel.grade}
            {sel.small && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" /> 표본 극소, 참고용
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
            <span>프로 승률: <b className="text-brand">{sel.proWinrate ?? "-"}%</b></span>
            <span>프로 승: {sel.proWin.toLocaleString()}</span>
            <span>노동 승: {sel.laborWin.toLocaleString()}</span>
            <span>동착: {sel.tie.toLocaleString()}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            총 결정 쌍대결 {sel.decisive.toLocaleString()}건 기준
          </p>
        </div>
      )}
    </div>
  );
}
