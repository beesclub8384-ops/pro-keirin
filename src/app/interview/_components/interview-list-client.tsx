"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import RacerAvatar from "@/components/RacerAvatar";
import type { InterviewArticle } from "@/lib/interview";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const PAGE_SIZE = 10;

type Tab = "calendar" | "all";

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

const textShadow = "0 2px 4px rgba(0,0,0,0.5)";
const textShadowSm = "0 1px 3px rgba(0,0,0,0.5)";

function ArticleCard({
  a,
  onClick,
  onPrefetch,
}: {
  a: InterviewArticle;
  onClick: () => void;
  onPrefetch?: () => void;
}) {
  return (
    <div
      className="group cursor-pointer rounded-xl border bg-white/95 p-5 shadow-lg backdrop-blur-sm transition-all hover:shadow-xl hover:-translate-y-0.5 hover:border-brand/30"
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
    >
      <div className="flex items-center gap-2 mb-2">
        <RacerAvatar name={a.playerName} photoUrl={a.photoUrl} size={32} />
        <span className="text-lg font-bold text-foreground group-hover:text-brand transition-colors">
          {a.playerName}
        </span>
        {a.grade && (
          <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
            {a.grade}
          </Badge>
        )}
        {a.region && (
          <span className="text-xs text-muted-foreground">{a.region}</span>
        )}
      </div>
      {a.headline && (
        <p className="text-sm leading-snug text-foreground/70 line-clamp-2 mb-2.5">
          &ldquo;{a.headline}&rdquo;
        </p>
      )}
      <span className="text-xs text-muted-foreground">{a.date}</span>
    </div>
  );
}

export default function InterviewListClient({
  articles,
}: {
  articles: InterviewArticle[];
}) {
  const router = useRouter();

  // 최신 기사의 연/월을 초기 캘린더 위치로 사용. 기사가 없으면 클라이언트 today 사용.
  const [year, setYear] = useState(() => {
    if (articles.length > 0) {
      const latest = [...articles]
        .map((a) => a.date)
        .sort()
        .reverse()[0];
      return Number(latest.split("-")[0]);
    }
    return new Date().getFullYear();
  });
  const [month, setMonth] = useState(() => {
    if (articles.length > 0) {
      const latest = [...articles]
        .map((a) => a.date)
        .sort()
        .reverse()[0];
      return Number(latest.split("-")[1]) - 1;
    }
    return new Date().getMonth();
  });

  const [tab, setTab] = useState<Tab>("calendar");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // SSR/CSR 시간대 차이로 인한 hydration mismatch 회피 — 마운트 후 클라이언트 today로 설정
  const [todayStr, setTodayStr] = useState<string>("");
  useEffect(() => {
    const t = new Date();
    setTodayStr(formatDate(t.getFullYear(), t.getMonth(), t.getDate()));
  }, []);

  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleHiddenTap = useCallback(() => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      router.push("/interview/admin");
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 2000);
  }, [router]);

  const sorted = useMemo(
    () => [...articles].sort((a, b) => b.date.localeCompare(a.date)),
    [articles],
  );

  const articleDates = useMemo(
    () => new Set(articles.map((a) => a.date)),
    [articles],
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return sorted.filter((a) => a.playerName.toLowerCase().includes(q));
  }, [sorted, searchQuery]);

  const monthArticles = useMemo(
    () =>
      articles.filter((a) => {
        const d = new Date(a.date);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [articles, year, month],
  );

  const allDisplayed = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab !== "all" || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((c) => c + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab, hasMore, sorted.length]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const days = getCalendarDays(year, month);

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

  function goToArticle(a: InterviewArticle) {
    router.push(
      `/interview/${a.date}?player=${encodeURIComponent(a.playerName)}`,
    );
  }

  // 보이는 기사 카드에 hover/focus 시 상세 라우트 프리페치 (체감 전환 속도 개선)
  function prefetchArticle(a: InterviewArticle) {
    router.prefetch(`/interview/${a.date}`);
  }

  return (
    <div>
      {/* Navigation bar */}
      <nav className="mb-5 flex items-center gap-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setTab("calendar");
              setSearchOpen(false);
              setSearchQuery("");
            }}
            className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === "calendar" && !searchOpen
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white/90"
            }`}
            style={{ textShadow: textShadowSm }}
          >
            달력
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("all");
              setSearchOpen(false);
              setSearchQuery("");
              setVisibleCount(PAGE_SIZE);
            }}
            className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === "all" && !searchOpen
                ? "text-white border-b-2 border-white"
                : "text-white/60 hover:text-white/90"
            }`}
            style={{ textShadow: textShadowSm }}
          >
            전체
          </button>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setSearchOpen(!searchOpen);
            if (searchOpen) setSearchQuery("");
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors ${
            searchOpen
              ? "text-white border-b-2 border-white"
              : "text-white/60 hover:text-white/90"
          }`}
          style={{ textShadow: textShadowSm }}
        >
          {searchOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          검색
        </button>
      </nav>

      {/* Search input */}
      {searchOpen && (
        <div className="mb-6 rounded-xl bg-white/95 shadow-lg backdrop-blur-sm px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="선수 이름으로 검색..."
              className="w-full rounded-lg border border-border bg-white pl-10 pr-10 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <p className="mt-2 text-xs text-muted-foreground">
              {searchResults.length}건의 검색 결과
            </p>
          )}
        </div>
      )}

      {/* Search results */}
      {searchOpen && searchQuery.trim() ? (
        searchResults.length === 0 ? (
          <div className="rounded-xl bg-white/95 shadow-lg backdrop-blur-sm py-16 text-center">
            <p className="text-sm text-muted-foreground">
              &ldquo;{searchQuery}&rdquo; 검색 결과가 없습니다
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {searchResults.map((a, i) => (
              <ArticleCard
                key={`search-${a.date}-${a.playerName}-${i}`}
                a={a}
                onClick={() => goToArticle(a)}
                onPrefetch={() => prefetchArticle(a)}
              />
            ))}
          </div>
        )
      ) : searchOpen ? null : tab === "all" ? (
        /* ═══ All tab ═══ */
        <>
          <div className="mb-6 sm:mb-8">
            <h1
              className="text-2xl sm:text-3xl font-bold text-white"
              style={{ textShadow }}
            >
              선수 인터뷰
            </h1>
            <p
              className="mt-2 text-sm text-white/80"
              style={{ textShadow: textShadowSm }}
            >
              경륜 선수들의 생생한 인터뷰를 확인하세요
            </p>
          </div>
          {sorted.length === 0 ? (
            <div className="rounded-xl bg-white/95 shadow-lg backdrop-blur-sm py-16 text-center">
              <p className="text-sm text-muted-foreground">
                아직 인터뷰가 없습니다
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {allDisplayed.map((a, i) => (
                <ArticleCard
                  key={`all-${a.date}-${a.playerName}-${i}`}
                  a={a}
                  onClick={() => goToArticle(a)}
                  onPrefetch={() => prefetchArticle(a)}
                />
              ))}
              {hasMore && <div ref={sentinelRef} className="h-1" />}
            </div>
          )}
        </>
      ) : (
        /* ═══ Calendar tab (default) ═══ */
        <>
          <div className="mb-6 sm:mb-8">
            <h1
              className="text-2xl sm:text-3xl font-bold text-white"
              style={{ textShadow }}
            >
              선수 인터뷰
            </h1>
            <p
              className="mt-2 text-sm text-white/80"
              style={{ textShadow: textShadowSm }}
            >
              경륜 선수들의 생생한 인터뷰를 확인하세요
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* Calendar */}
            <Card className="bg-white/95 shadow-lg backdrop-blur-sm">
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
                <div className="grid grid-cols-7">
                  {days.map((day, idx) => {
                    if (day === null) {
                      return (
                        <div key={`empty-${idx}`} className="aspect-square" />
                      );
                    }
                    const date = formatDate(year, month, day);
                    const hasArticle = articleDates.has(date);
                    const isToday = date === todayStr;
                    const dayOfWeek = new Date(year, month, day).getDay();
                    return (
                      <button
                        key={date}
                        onClick={() => {
                          if (hasArticle) router.push(`/interview/${date}`);
                        }}
                        disabled={!hasArticle}
                        className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                          hasArticle
                            ? "cursor-pointer hover:bg-brand/10 font-medium"
                            : "cursor-default"
                        } ${isToday ? "ring-2 ring-brand ring-offset-1" : ""} ${
                          dayOfWeek === 0
                            ? "text-red-500"
                            : dayOfWeek === 6
                              ? "text-blue-500"
                              : ""
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
              </CardContent>
            </Card>

            {/* Month article list */}
            <div className="space-y-4">
              <h2
                className="text-base font-bold text-white"
                style={{ textShadow: textShadowSm }}
              >
                {month + 1}월 인터뷰
              </h2>
              {monthArticles.length === 0 ? (
                <p className="text-sm text-white/70">
                  이번 달 인터뷰가 없습니다
                </p>
              ) : (
                monthArticles.map((a, i) => (
                  <ArticleCard
                    key={`cal-${a.date}-${a.playerName}-${i}`}
                    a={a}
                    onClick={() => goToArticle(a)}
                    onPrefetch={() => prefetchArticle(a)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Hidden admin access */}
      <div
        className="mt-12 py-4 text-center text-xs text-white/20 select-none"
        onClick={handleHiddenTap}
      >
        7RANDOMS
      </div>
    </div>
  );
}
