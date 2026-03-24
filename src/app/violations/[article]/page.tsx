"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { parseArticleKey, findArticleByKey } from "@/lib/violation-articles";

interface PlayerStat {
  name: string;
  실격: number;
  경고: number;
  주의: number;
  total: number;
  lastDate: string;
}

interface PlaceStat {
  place: string;
  count: number;
}

interface YearlyStat {
  year: number;
  total: number;
  실격: number;
  경고: number;
  주의: number;
}

interface ArticleData {
  playerRanking: PlayerStat[];
  placeStats: PlaceStat[];
  yearlyData: YearlyStat[];
  availableYears: number[];
  totalFiltered: number;
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

export default function ArticlePage({ params }: { params: Promise<{ article: string }> }) {
  const { article: articleKey_ } = use(params);
  const articleParam = decodeURIComponent(articleKey_);
  const parsed = parseArticleKey(articleParam);
  const articleInfo = findArticleByKey(articleParam);

  const [data, setData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [judgment, setJudgment] = useState<string>("all");
  const [year, setYear] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("article", parsed.article);
    params.set("clause", parsed.clause);
    params.set("paragraph", parsed.paragraph);
    if (judgment !== "all") params.set("judgment", judgment);
    if (year !== "all") params.set("year", year);

    fetch(`/api/violations/article?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [parsed.article, parsed.clause, parsed.paragraph, judgment, year]);

  const label = articleInfo?.label || `${parsed.article}조`;
  const description = articleInfo?.description || "";
  const maxPlaceCount = Math.max(...(data?.placeStats || []).map((p) => p.count), 1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      {/* 뒤로가기 + 제목 */}
      <div className="flex items-center gap-3">
        <Link href="/violations">
          <Button variant="ghost" size="sm">&larr; 판정기록</Button>
        </Link>
      </div>

      {/* 조항 설명 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{description}</p>
          {data && (
            <div className="mt-3">
              <Badge variant="outline" className="text-sm">총 {data.totalFiltered.toLocaleString()}건</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <Select value={judgment} onValueChange={setJudgment}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="판정" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 판정</SelectItem>
            <SelectItem value="실격">실격</SelectItem>
            <SelectItem value="경고">경고</SelectItem>
            <SelectItem value="주의">주의</SelectItem>
          </SelectContent>
        </Select>

        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="연도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 연도</SelectItem>
            {(data?.availableYears || []).map((y) => (
              <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">데이터 로딩 중...</div>
      ) : !data ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">데이터를 불러올 수 없습니다.</div>
      ) : (
        <>
          {/* 선수별 순위 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">선수별 판정 순위</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>선수명</TableHead>
                      <TableHead className="text-center">최근판정</TableHead>
                      <TableHead className="w-16 text-center text-red-600">실격</TableHead>
                      <TableHead className="w-16 text-center text-orange-600">경고</TableHead>
                      <TableHead className="w-16 text-center text-yellow-600">주의</TableHead>
                      <TableHead className="w-16 text-center font-bold">합계</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.playerRanking.slice(0, 50).map((p, i) => (
                      <TableRow key={p.name} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/violations/${articleParam}/player/${encodeURIComponent(p.name)}`}
                            className="hover:text-brand transition-colors"
                          >
                            {p.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">{p.lastDate}</TableCell>
                        <TableCell className="text-center">{p.실격 || "-"}</TableCell>
                        <TableCell className="text-center">{p.경고 || "-"}</TableCell>
                        <TableCell className="text-center">{p.주의 || "-"}</TableCell>
                        <TableCell className="text-center font-bold">{p.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {data.playerRanking.length > 50 && (
                <p className="mt-3 text-sm text-muted-foreground text-center">
                  상위 50명 표시 (전체 {data.playerRanking.length}명)
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 위반장소 분포 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">위반장소 분포</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.placeStats.slice(0, 10).map((p) => {
                  const pct = (p.count / maxPlaceCount) * 100;
                  return (
                    <div key={p.place}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">{p.place}</span>
                        <span className="text-sm font-semibold">{p.count}건</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* 연도별 추이 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">연도별 추이</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.yearlyData.map((y) => (
                    <div key={y.year} className="flex items-center gap-3">
                      <span className="text-sm w-12 text-muted-foreground">{y.year}</span>
                      <div className="flex-1 flex items-center gap-1">
                        {y.실격 > 0 && (
                          <div className="h-5 bg-red-500 rounded text-xs text-white flex items-center justify-center px-1" style={{ minWidth: `${Math.max((y.실격 / y.total) * 100, 10)}%` }}>
                            {y.실격}
                          </div>
                        )}
                        {y.경고 > 0 && (
                          <div className="h-5 bg-orange-400 rounded text-xs text-white flex items-center justify-center px-1" style={{ minWidth: `${Math.max((y.경고 / y.total) * 100, 10)}%` }}>
                            {y.경고}
                          </div>
                        )}
                        {y.주의 > 0 && (
                          <div className="h-5 bg-yellow-400 rounded text-xs flex items-center justify-center px-1" style={{ minWidth: `${Math.max((y.주의 / y.total) * 100, 10)}%` }}>
                            {y.주의}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold w-16 text-right">{y.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
