"use client";

import { Suspense, useEffect, useState, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { parseArticleKey, findArticleByKey, formatArticleLabel } from "@/lib/violation-articles";
import { VideoButton } from "@/components/VideoButton";

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
}

interface PlayerHistory {
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

const VENUES = ["광명", "창원", "부산"] as const;

export default function ArticlePage({ params }: { params: Promise<{ article: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8 text-muted-foreground">로딩 중...</div>}>
      <ArticleContent params={params} />
    </Suspense>
  );
}

function ArticleContent({ params }: { params: Promise<{ article: string }> }) {
  const { article: articleKey_ } = use(params);
  const articleParam = decodeURIComponent(articleKey_);
  const parsed = parseArticleKey(articleParam);
  const articleInfo = findArticleByKey(articleParam);

  const searchParams = useSearchParams();
  const venueParam = searchParams.get("venue");
  const venue =
    venueParam && (VENUES as readonly string[]).includes(venueParam) ? venueParam : "광명";
  // 광명은 기본값이라 쿼리 생략, 그 외는 ?venue= 로 이동 시 유지
  const venueQS = venue === "광명" ? "" : `?venue=${encodeURIComponent(venue)}`;

  const [data, setData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [judgment, setJudgment] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [violationType, setViolationType] = useState<string>("all");
  const is72c2 = parsed.article === "72" && parsed.clause === "2";
  const [search, setSearch] = useState("");
  const [playerHistory, setPlayerHistory] = useState<PlayerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("article", parsed.article);
    params.set("clause", parsed.clause);
    params.set("paragraph", parsed.paragraph);
    if (judgment !== "all") params.set("judgment", judgment);
    if (year !== "all") params.set("year", year);
    if (violationType !== "all") params.set("violationType", violationType);
    params.set("venue", venue);

    fetch(`/api/violations/article?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [parsed.article, parsed.clause, parsed.paragraph, judgment, year, violationType, venue]);

  // 검색 필터링
  const filteredPlayers = data?.playerRanking.filter(
    (p) => !search || p.name.includes(search)
  ) || [];

  // 검색 결과 1명이면 자동으로 이력 로드
  const fetchPlayerHistory = useCallback(
    (name: string) => {
      setHistoryLoading(true);
      const ps = new URLSearchParams();
      ps.set("name", name);
      ps.set("article", parsed.article);
      ps.set("clause", parsed.clause);
      ps.set("paragraph", parsed.paragraph);
      ps.set("venue", venue);
      fetch(`/api/violations/player?${ps}`)
        .then((r) => r.json())
        .then((d) => setPlayerHistory(d))
        .finally(() => setHistoryLoading(false));
    },
    [parsed.article, parsed.clause, parsed.paragraph, venue]
  );

  useEffect(() => {
    if (filteredPlayers.length === 1) {
      fetchPlayerHistory(filteredPlayers[0].name);
    } else {
      setPlayerHistory(null);
    }
  }, [search, filteredPlayers.length, filteredPlayers[0]?.name, fetchPlayerHistory]);

  const label = articleInfo?.label || `${parsed.article}조`;
  const description = articleInfo?.description || "";
  const maxPlaceCount = Math.max(...(data?.placeStats || []).map((p) => p.count), 1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      {/* 뒤로가기 + 제목 */}
      <div className="flex items-center gap-3">
        <Link href={`/violations${venueQS}`}>
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

        {is72c2 && (
          <Select value={violationType} onValueChange={setViolationType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="유형" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              <SelectItem value="A">A타입 (고의적 전력 미달)</SelectItem>
              <SelectItem value="B">B타입 (능력 부족)</SelectItem>
            </SelectContent>
          </Select>
        )}
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
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-lg">선수별 판정 순위</CardTitle>
                <div className="relative w-full max-w-xs">
                  <Input
                    placeholder="선수 이름 검색..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-8"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
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
                    {filteredPlayers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {search ? `"${search}" 검색 결과가 없습니다.` : "데이터가 없습니다."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPlayers.slice(0, search ? 100 : 50).map((p, i) => (
                        <TableRow key={p.name} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <Link
                              href={`/violations/${articleParam}/player/${encodeURIComponent(p.name)}${venueQS}`}
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
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {!search && data.playerRanking.length > 50 && (
                <p className="mt-3 text-sm text-muted-foreground text-center">
                  상위 50명 표시 (전체 {data.playerRanking.length}명)
                </p>
              )}

              {/* 검색 결과 1명: 판정 이력 인라인 표시 */}
              {filteredPlayers.length === 1 && (
                <div className="mt-6 border-t pt-6">
                  <h4 className="text-sm font-semibold mb-4">
                    {filteredPlayers[0].name} 판정 이력 ({label})
                  </h4>
                  {historyLoading ? (
                    <div className="text-center text-muted-foreground py-8">이력 로딩 중...</div>
                  ) : !playerHistory ? (
                    <div className="text-center text-muted-foreground py-8">이력을 불러올 수 없습니다.</div>
                  ) : playerHistory.history.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">판정 이력이 없습니다.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>날짜</TableHead>
                            <TableHead>회차/일차</TableHead>
                            <TableHead className="text-center">경주</TableHead>
                            <TableHead>위반시기</TableHead>
                            <TableHead>위반장소</TableHead>
                            <TableHead className="text-center">판정</TableHead>
                            <TableHead className="text-center">영상</TableHead>
                            <TableHead className="hidden md:table-cell">판정내용</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {playerHistory.history.map((v, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-sm whitespace-nowrap">{v.date}</TableCell>
                              <TableCell className="whitespace-nowrap">{v.round}회 {v.day}일차</TableCell>
                              <TableCell className="text-center">{v.raceNo}R</TableCell>
                              <TableCell className="text-sm">{v.violationTime !== "-" ? v.violationTime : ""}</TableCell>
                              <TableCell className="text-sm">{v.violationPlace !== "-" ? v.violationPlace : ""}</TableCell>
                              <TableCell className="text-center"><JudgmentBadge judgment={v.judgment} /></TableCell>
                              <TableCell className="text-center">
                                <VideoButton venue={venue} round={v.round} day={v.day} raceNo={v.raceNo} date={v.date} />
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-sm">
                                {v.description !== "-" ? v.description : ""}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
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
