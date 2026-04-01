"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InterviewArticle } from "@/lib/interview";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const API_URL =
  "https://script.google.com/macros/s/AKfycbwbhJchNH0iB1GV2NnhOor0mSdkmt86nAcp1PClJcTg3SkSwUndPgY2NfQWnDzNGX9gUQ/exec";

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];

  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return days;
}

function formatDate(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** ISO 타임스탬프를 KST YYYY-MM-DD로 변환 */
function toKSTDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** article 첫 줄 # 헤딩에서 제목 추출 */
function extractTitle(article: string): string {
  const match = article.match(/^#\s+(.+)/m);
  if (!match) return "";
  return match[1].replace(/^["「"']|["」"']$/g, "").trim();
}

export default function InterviewPage() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [articles, setArticles] = useState<InterviewArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return setArticles([]);
        const parsed = data.map((a: InterviewArticle) => ({ ...a, date: toKSTDate(a.date) }));
        setArticles(parsed);
        // 가장 최근 기사가 있는 달로 자동 이동
        if (parsed.length > 0) {
          const latest = parsed.map((a: InterviewArticle) => a.date).sort().reverse()[0];
          const [y, m] = latest.split("-").map(Number);
          setYear(y);
          setMonth(m - 1);
        }
      })
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  const articleDates = new Set(articles.map((a) => a.date));
  const days = getCalendarDays(year, month);

  const monthArticles = articles.filter((a) => {
    const d = new Date(a.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  function prevMonth() {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  }

  function handleDateClick(day: number) {
    const date = formatDate(year, month, day);
    if (articleDates.has(date)) {
      router.push(`/interview/${date}`);
    }
  }

  const todayStr = formatDate(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      {/* Page Header */}
      <div className="mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          선수 인터뷰
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          경륜 선수들의 생생한 인터뷰를 확인하세요
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Calendar */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-lg font-bold">
              {year}년 {month + 1}월
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map((d, i) => (
                <div
                  key={d}
                  className={`py-2 text-center text-xs font-medium ${
                    i === 0
                      ? "text-red-500"
                      : i === 6
                        ? "text-blue-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }

                const date = formatDate(year, month, day);
                const hasArticle = articleDates.has(date);
                const isToday = date === todayStr;
                const dayOfWeek = (new Date(year, month, day).getDay());

                return (
                  <button
                    key={date}
                    onClick={() => handleDateClick(day)}
                    disabled={!hasArticle}
                    className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                      hasArticle
                        ? "cursor-pointer hover:bg-brand/10 font-medium"
                        : "cursor-default"
                    } ${isToday ? "ring-2 ring-brand ring-offset-1" : ""} ${
                      dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : ""
                    }`}
                  >
                    <span>{day}</span>
                    {hasArticle && (
                      <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                데이터 불러오는 중...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Article list */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-foreground">
            {month + 1}월 인터뷰
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : monthArticles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              이번 달 인터뷰가 없습니다
            </p>
          ) : (
            monthArticles.map((a, i) => (
              <div
                key={`${a.date}-${a.playerName}-${i}`}
                className="group cursor-pointer rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-brand/30"
                onClick={() =>
                  router.push(
                    `/interview/${a.date}?player=${encodeURIComponent(a.playerName)}`,
                  )
                }
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-bold text-foreground group-hover:text-brand transition-colors">
                    {a.playerName}
                  </span>
                  <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                    {a.grade}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {a.region}
                  </span>
                </div>
                {extractTitle(a.article) && (
                  <p className="text-sm leading-snug text-foreground/70 line-clamp-2 mb-2.5">
                    &ldquo;{extractTitle(a.article)}&rdquo;
                  </p>
                )}
                <span className="text-xs text-muted-foreground">
                  {a.date}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
