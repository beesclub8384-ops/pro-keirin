"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { formatArticleLabel, articleKey } from "@/lib/violation-articles";

interface SummaryData {
  total: number;
  judgmentCounts: { 실격: number; 경고: number; 주의: number };
  articleDisqualifications: { article: string; paragraph: string; clause: string; count: number }[];
  yearlyData: { year: number; total: number; 실격: number; 경고: number; 주의: number }[];
  recentDisqualifications: {
    date: string;
    round: number;
    day: number;
    raceNo: number;
    name: string;
    article: string;
    paragraph: string;
    clause: string;
    description: string;
  }[];
}

interface SanctionRecord {
  id: number;
  no: number;
  racer_name: string;
  generation: string | null;
  racer_id: string | null;
  race_info: string | null;
  race_year: number | null;
  venue: string | null;
  round: number | null;
  day: number | null;
  race_no: number | null;
  regulation: string | null;
  reason: string | null;
  sanction_type: string | null;
  sanction_value: string | null;
  sanction_days: number | null;
  sanction_unit: string | null;
}

interface SanctionsData {
  data: SanctionRecord[];
  total: number;
  page: number;
  totalPages: number;
  availableYears: number[];
  availableTypes: string[];
  typeCountMap: Record<string, number>;
  regulationStats: { regulation: string; count: number }[];
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

export default function ViolationsPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const [sanctions, setSanctions] = useState<SanctionsData | null>(null);
  const [sanctionsLoading, setSanctionsLoading] = useState(true);
  const [sanctionSearch, setSanctionSearch] = useState("");
  const [sanctionYear, setSanctionYear] = useState<string>("all");
  const [sanctionType, setSanctionType] = useState<string>("all");
  const [sanctionRegulation, setSanctionRegulation] = useState<string>("all");
  const [sanctionPage, setSanctionPage] = useState(1);

  useEffect(() => {
    fetch("/api/violations/summary")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const fetchSanctions = useCallback((search: string, year: string, type: string, regulation: string, page: number) => {
    setSanctionsLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (year !== "all") params.set("year", year);
    if (type !== "all") params.set("sanctionType", type);
    if (regulation !== "all") params.set("regulation", regulation);
    params.set("page", String(page));
    fetch(`/api/violations/sanctions?${params}`)
      .then((r) => r.json())
      .then((d) => setSanctions(d))
      .finally(() => setSanctionsLoading(false));
  }, []);

  useEffect(() => {
    fetchSanctions(sanctionSearch, sanctionYear, sanctionType, sanctionRegulation, sanctionPage);
  }, [sanctionSearch, sanctionYear, sanctionType, sanctionRegulation, sanctionPage, fetchSanctions]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-center py-20 text-muted-foreground">데이터 로딩 중...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-center py-20 text-muted-foreground">데이터를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const maxArticleCount = Math.max(...data.articleDisqualifications.map((a) => a.count), 1);
  const maxYearlyTotal = Math.max(...data.yearlyData.map((y) => y.total), 1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">판정기록</h1>

      {/* 핵심 지표 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 판정</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.total.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">실격</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{data.judgmentCounts.실격.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">경고</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{data.judgmentCounts.경고.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">주의</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{data.judgmentCounts.주의.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 조항별 실격 현황 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">조항별 실격 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.articleDisqualifications.map((a) => {
              const key = articleKey(a.article, a.paragraph, a.clause);
              const label = formatArticleLabel(a.article, a.paragraph, a.clause);
              const pct = (a.count / maxArticleCount) * 100;
              return (
                <Link key={key} href={`/violations/${key}`} className="block group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium group-hover:text-brand transition-colors">{label}</span>
                    <span className="text-sm font-semibold text-red-600">{a.count}건</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {/* 연도별 판정 건수 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">연도별 판정 건수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-48">
              {data.yearlyData.map((y) => {
                const totalPct = (y.total / maxYearlyTotal) * 100;
                const disqPct = (y.실격 / maxYearlyTotal) * 100;
                const warnPct = (y.경고 / maxYearlyTotal) * 100;
                const cautPct = (y.주의 / maxYearlyTotal) * 100;
                return (
                  <div key={y.year} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs font-semibold text-muted-foreground">{y.total.toLocaleString()}</div>
                    <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${totalPct}%` }}>
                      <div className="bg-yellow-400" style={{ height: `${(cautPct / totalPct) * 100}%` }} />
                      <div className="bg-orange-400" style={{ height: `${(warnPct / totalPct) * 100}%` }} />
                      <div className="bg-red-500" style={{ height: `${(disqPct / totalPct) * 100}%` }} />
                    </div>
                    <div className="text-xs text-muted-foreground">{y.year}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" />실격</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400" />경고</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400" />주의</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 최근 실격 5건 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">최근 실격</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>선수명</TableHead>
                  <TableHead>조항</TableHead>
                  <TableHead>회차</TableHead>
                  <TableHead>경주</TableHead>
                  <TableHead className="hidden md:table-cell">판정내용</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentDisqualifications.map((d, i) => {
                  const key = articleKey(d.article, d.paragraph, d.clause);
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{d.date}</TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>
                        <Link href={`/violations/${key}`} className="hover:text-brand transition-colors">
                          <Badge variant="outline">{formatArticleLabel(d.article, d.paragraph, d.clause)}</Badge>
                        </Link>
                      </TableCell>
                      <TableCell>{d.round}회 {d.day}일차</TableCell>
                      <TableCell>{d.raceNo}R</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">{d.description}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── 심판제재선수 섹션 ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">심판제재선수</h2>
          {sanctions && (
            <span className="text-sm text-muted-foreground">총 {sanctions.total.toLocaleString()}건</span>
          )}
        </div>

        {/* 제재유형별 현황 버튼 */}
        {sanctions && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(sanctions.typeCountMap)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => { setSanctionType(sanctionType === type ? "all" : type); setSanctionPage(1); }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors
                    ${sanctionType === type
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-background hover:bg-muted"}`}
                >
                  {type}
                  <span className={`text-xs ${sanctionType === type ? "text-red-100" : "text-muted-foreground"}`}>
                    {count}
                  </span>
                </button>
              ))}
          </div>
        )}

        {/* 시행규정별 현황 버튼 */}
        {sanctions && sanctions.regulationStats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sanctions.regulationStats.map(({ regulation, count }) => (
              <button
                key={regulation}
                onClick={() => { setSanctionRegulation(sanctionRegulation === regulation ? "all" : regulation); setSanctionPage(1); }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors
                  ${sanctionRegulation === regulation
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-background hover:bg-muted"}`}
              >
                {regulation.replace(/^경륜시행규정\s*/, "")}
                <span className={`text-xs ${sanctionRegulation === regulation ? "text-blue-100" : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 검색 + 필터 */}
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="선수명 검색..."
            value={sanctionSearch}
            onChange={(e) => { setSanctionSearch(e.target.value); setSanctionPage(1); }}
            className="w-40"
          />
          <Select value={sanctionYear} onValueChange={(v) => { setSanctionYear(v); setSanctionPage(1); }}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="연도" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 연도</SelectItem>
              {sanctions?.availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sanctionType} onValueChange={(v) => { setSanctionType(v); setSanctionPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="제재유형" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              {sanctions?.availableTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(sanctionSearch || sanctionYear !== "all" || sanctionType !== "all" || sanctionRegulation !== "all") && (
            <button
              onClick={() => { setSanctionSearch(""); setSanctionYear("all"); setSanctionType("all"); setSanctionRegulation("all"); setSanctionPage(1); }}
              className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground border rounded-md hover:bg-muted transition-colors"
            >
              초기화
            </button>
          )}
        </div>

        {/* 테이블 */}
        <Card>
          <CardContent className="p-0">
            {sanctionsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">로딩 중...</div>
            ) : !sanctions || sanctions.data.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">검색 결과가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No.</TableHead>
                      <TableHead>선수</TableHead>
                      <TableHead>해당경주</TableHead>
                      <TableHead>제재유형</TableHead>
                      <TableHead>제재기간</TableHead>
                      <TableHead>시행규정</TableHead>
                      <TableHead>제재사유</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sanctions.data.map((r) => (
                      <TableRow key={r.no}>
                        <TableCell className="text-xs text-muted-foreground">{r.no}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.racer_name}</div>
                          <div className="text-xs text-muted-foreground">{r.generation}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.race_info}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold
                            ${r.sanction_type === "출전정지" ? "bg-red-100 text-red-700 border-red-200" :
                              r.sanction_type === "서면경고" ? "bg-orange-100 text-orange-700 border-orange-200" :
                              "bg-gray-100 text-gray-700 border-gray-200"}`}>
                            {r.sanction_type}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{r.sanction_value}</TableCell>
                        <TableCell className="text-sm whitespace-normal">{r.regulation || "-"}</TableCell>
                        <TableCell className="text-sm whitespace-normal">
                          {r.reason && r.reason.length > 3 ? r.reason : "합산적용"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 페이지네이션 */}
        {sanctions && sanctions.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setSanctionPage(1)}
              disabled={sanctionPage === 1}
              className="px-2 py-1 text-sm border rounded disabled:opacity-30 hover:bg-muted"
            >처음</button>
            <button
              onClick={() => setSanctionPage((p) => Math.max(1, p - 1))}
              disabled={sanctionPage === 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-30 hover:bg-muted"
            >이전</button>
            <span className="text-sm text-muted-foreground px-2">
              {sanctionPage} / {sanctions.totalPages}
            </span>
            <button
              onClick={() => setSanctionPage((p) => Math.min(sanctions.totalPages, p + 1))}
              disabled={sanctionPage === sanctions.totalPages}
              className="px-3 py-1 text-sm border rounded disabled:opacity-30 hover:bg-muted"
            >다음</button>
            <button
              onClick={() => setSanctionPage(sanctions.totalPages)}
              disabled={sanctionPage === sanctions.totalPages}
              className="px-2 py-1 text-sm border rounded disabled:opacity-30 hover:bg-muted"
            >마지막</button>
          </div>
        )}
      </div>
    </div>
  );
}
