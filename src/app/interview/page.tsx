"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InterviewArticle } from "@/lib/interview";

const API_URL = "/api/interview/published";

type Tab = "all" | "monthly";

function toKSTDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function extractTitle(article: string): string {
  const match = article.match(/^#\s+(.+)/m);
  if (!match) return "";
  return match[1].replace(/^["「"']|["」"']$/g, "").trim();
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PAGE_SIZE = 10;

function ArticleCard({
  a,
  onClick,
}: {
  a: InterviewArticle;
  onClick: () => void;
}) {
  return (
    <div
      className="group cursor-pointer rounded-xl border bg-white/95 p-5 shadow-lg backdrop-blur-sm transition-all hover:shadow-xl hover:-translate-y-0.5 hover:border-brand/30"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
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
      {extractTitle(a.article) && (
        <p className="text-sm leading-snug text-foreground/70 line-clamp-2 mb-2.5">
          &ldquo;{extractTitle(a.article)}&rdquo;
        </p>
      )}
      <span className="text-xs text-muted-foreground">{a.date}</span>
    </div>
  );
}

export default function InterviewPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<InterviewArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("all");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return setArticles([]);
        const parsed = data.map((a: InterviewArticle) => ({
          ...a,
          date: toKSTDate(a.date),
        }));
        setArticles(parsed);
      })
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(
    () => [...articles].sort((a, b) => b.date.localeCompare(a.date)),
    [articles],
  );

  const filtered = useMemo(() => {
    if (searchOpen && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return sorted.filter((a) => a.playerName.toLowerCase().includes(q));
    }
    if (tab === "monthly") {
      return sorted.filter((a) => {
        const m = parseInt(a.date.split("-")[1], 10);
        return m === selectedMonth;
      });
    }
    return sorted;
  }, [sorted, tab, selectedMonth, searchOpen, searchQuery]);

  const displayed = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore) return;
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
  }, [hasMore, filtered.length]);

  function goToArticle(a: InterviewArticle) {
    router.push(
      `/interview/${a.date}?player=${encodeURIComponent(a.playerName)}`,
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <h1
          className="text-2xl sm:text-3xl font-bold text-white"
          style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
        >
          선수 인터뷰
        </h1>
        <p
          className="mt-2 text-sm text-white/80"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
        >
          경륜 선수들의 생생한 인터뷰를 확인하세요
        </p>
      </div>

      {/* Navigation bar */}
      <div className="mb-6 rounded-xl bg-white/95 shadow-lg backdrop-blur-sm px-3 py-2 flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          <button
            type="button"
            onClick={() => {
              setTab("all");
              setSearchOpen(false);
              setSearchQuery("");
              setVisibleCount(PAGE_SIZE);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "all" && !searchOpen
                ? "bg-brand text-white"
                : "text-foreground/70 hover:bg-muted"
            }`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("monthly");
              setSearchOpen(false);
              setSearchQuery("");
              setVisibleCount(PAGE_SIZE);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "monthly" && !searchOpen
                ? "bg-brand text-white"
                : "text-foreground/70 hover:bg-muted"
            }`}
          >
            월별
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setSearchOpen(!searchOpen);
            if (searchOpen) setSearchQuery("");
            setVisibleCount(PAGE_SIZE);
          }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            searchOpen
              ? "bg-brand text-white"
              : "text-foreground/70 hover:bg-muted"
          }`}
        >
          {searchOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          검색
        </button>
      </div>

      {/* Search input */}
      {searchOpen && (
        <div className="mb-6 rounded-xl bg-white/95 shadow-lg backdrop-blur-sm px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="선수 이름으로 검색..."
              className="w-full rounded-lg border border-border bg-white pl-10 pr-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
              {filtered.length}건의 검색 결과
            </p>
          )}
        </div>
      )}

      {/* Monthly selector */}
      {tab === "monthly" && !searchOpen && (
        <div className="mb-6 overflow-x-auto rounded-xl bg-white/95 shadow-lg backdrop-blur-sm px-3 py-3">
          <div className="flex gap-1.5 min-w-max">
            {MONTHS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setSelectedMonth(m);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  selectedMonth === m
                    ? "bg-brand text-white"
                    : "text-foreground/70 hover:bg-muted"
                }`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Article list */}
      {loading ? (
        <p className="text-sm text-white/70 py-10 text-center">
          불러오는 중...
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white/95 shadow-lg backdrop-blur-sm py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {searchOpen && searchQuery.trim()
              ? `"${searchQuery}" 검색 결과가 없습니다`
              : tab === "monthly"
                ? "이 달에는 인터뷰가 없습니다"
                : "아직 인터뷰가 없습니다"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map((a, i) => (
            <ArticleCard
              key={`${a.date}-${a.playerName}-${i}`}
              a={a}
              onClick={() => goToArticle(a)}
            />
          ))}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
        </div>
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
