"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    fetch("/api/violations/summary")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

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
    </div>
  );
}
