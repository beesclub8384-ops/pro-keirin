"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AdminArticle {
  id: number;
  requestId: number;
  requestType: string | null;
  playerName: string;
  grade: string | null;
  region: string | null;
  headline: string | null;
  status: "draft" | "review" | "approved" | "published" | "rejected";
  createdAt: string;
  updatedAt: string;
}

type Filter = "all" | "review" | "approved" | "published" | "rejected";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "review", label: "검토중" },
  { key: "approved", label: "승인" },
  { key: "published", label: "공개" },
  { key: "rejected", label: "반려" },
];

const STATUS_STYLE: Record<AdminArticle["status"], string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  review: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  published: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<AdminArticle["status"], string> = {
  draft: "초안",
  review: "검토중",
  approved: "승인",
  published: "공개",
  rejected: "반려",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16).replace("T", " ");
}

export default function InterviewAdminPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/interview/admin/articles", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError("기사 목록을 불러오지 못했습니다");
          setLoading(false);
          return;
        }
        const json = (await res.json()) as { articles: AdminArticle[] };
        setArticles(json.articles);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("네트워크 오류가 발생했습니다");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return articles;
    return articles.filter((a) => a.status === filter);
  }, [articles, filter]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: articles.length,
      review: 0,
      approved: 0,
      published: 0,
      rejected: 0,
    };
    for (const a of articles) {
      if (a.status in c) c[a.status as Filter]++;
    }
    return c;
  }, [articles]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            인터뷰 관리
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            생성된 인터뷰 기사를 검토하고 승인/공개합니다
          </p>
        </div>
        <Link href="/interview/admin/new">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            새 인터뷰 요청
          </Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-white text-foreground hover:bg-muted"
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 text-xs ${
                  active ? "text-white/80" : "text-muted-foreground"
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* States */}
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-500">
            {error}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "아직 생성된 기사가 없습니다"
                : `${FILTERS.find((f) => f.key === filter)?.label} 상태의 기사가 없습니다`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {filtered.map((a) => (
            <Card
              key={a.id}
              onClick={() => router.push(`/interview/admin/${a.id}`)}
              className="cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
            >
              <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-foreground">
                    {a.playerName}
                  </span>
                  {a.grade && (
                    <Badge variant="secondary" className="text-[11px]">
                      {a.grade}
                    </Badge>
                  )}
                  {a.region && (
                    <span className="text-xs text-muted-foreground">
                      {a.region}
                    </span>
                  )}
                  <span
                    className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[a.status]}`}
                  >
                    {STATUS_LABEL[a.status]}
                  </span>
                </div>
                {a.headline && (
                  <p className="mb-2 line-clamp-2 text-sm leading-snug text-foreground/80">
                    &ldquo;{a.headline}&rdquo;
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDate(a.createdAt)}</span>
                  {a.requestType && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {a.requestType}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
