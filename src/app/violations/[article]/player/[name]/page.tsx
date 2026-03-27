"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseArticleKey, findArticleByKey, formatArticleLabel } from "@/lib/violation-articles";

interface ViolationRecord {
  date: string;
  year: number;
  round: number;
  day: number;
  raceNo: number;
  backNo: number;
  violationTime: string;
  violationPlace: string;
  article: string;
  paragraph: string;
  clause: string;
  judgment: string;
  description: string;
  violationType: string | null;
}

interface PlayerData {
  name: string;
  summary: { 실격: number; 경고: number; 주의: number; total: number };
  history: ViolationRecord[];
}

function JudgmentBadge({ judgment }: { judgment: string }) {
  const colors: Record<string, string> = {
    실격: "bg-red-100 text-red-700 border-red-200",
    경고: "bg-orange-100 text-orange-700 border-orange-200",
    주의: "bg-yellow-100 text-yellow-700 border-yellow-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors[judgment] || "bg-gray-100 text-gray-700"}`}>
      {judgment}
    </span>
  );
}

export default function PlayerViolationsPage({
  params,
}: {
  params: Promise<{ article: string; name: string }>;
}) {
  const { article: articleKey_, name: encodedName } = use(params);
  const articleParam = decodeURIComponent(articleKey_);
  const playerName = decodeURIComponent(encodedName);
  const parsed = parseArticleKey(articleParam);
  const articleInfo = findArticleByKey(articleParam);

  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("name", playerName);
    params.set("article", parsed.article);
    params.set("clause", parsed.clause);
    params.set("paragraph", parsed.paragraph);

    fetch(`/api/violations/player?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [playerName, parsed.article, parsed.clause, parsed.paragraph]);

  const articleLabel = articleInfo?.label || `${parsed.article}조`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      {/* 뒤로가기 */}
      <div className="flex items-center gap-3">
        <Link href={`/violations/${articleParam}`}>
          <Button variant="ghost" size="sm">&larr; {articleLabel}</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">데이터 로딩 중...</div>
      ) : !data ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">데이터를 불러올 수 없습니다.</div>
      ) : (
        <>
          {/* 선수 헤더 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{data.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">조항:</span>
                  <span className="font-medium">{articleLabel}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{data.summary.total}</div>
                  <div className="text-xs text-muted-foreground">합계</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50">
                  <div className="text-2xl font-bold text-red-600">{data.summary.실격}</div>
                  <div className="text-xs text-red-600">실격</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-50">
                  <div className="text-2xl font-bold text-orange-600">{data.summary.경고}</div>
                  <div className="text-xs text-orange-600">경고</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-yellow-50">
                  <div className="text-2xl font-bold text-yellow-600">{data.summary.주의}</div>
                  <div className="text-xs text-yellow-600">주의</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 판정 이력 타임라인 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">판정 이력</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.history.map((v, i) => (
                  <div key={i} className="relative pl-6 pb-4 border-l-2 border-muted last:border-l-0 last:pb-0">
                    {/* Timeline dot */}
                    <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 bg-white ${
                      v.judgment === "실격" ? "border-red-500" :
                      v.judgment === "경고" ? "border-orange-400" :
                      "border-yellow-400"
                    }`} />

                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium">{v.date}</span>
                      <JudgmentBadge judgment={v.judgment} />
                      {v.violationType === "A" && (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">고의적 전력 미달</span>
                      )}
                      {v.violationType === "B" && (
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">능력 부족</span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {v.round}회 {v.day}일차 {v.raceNo}R
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-1">
                      {v.violationTime && v.violationTime !== "-" && (
                        <span>위반시기: {v.violationTime}</span>
                      )}
                      {v.violationPlace && v.violationPlace !== "-" && (
                        <span>위반장소: {v.violationPlace}</span>
                      )}
                      <span>번호: {v.backNo}번</span>
                    </div>

                    {v.description && v.description !== "-" && (
                      <p className="text-sm mt-1 p-3 bg-muted/30 rounded-lg">
                        {v.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
