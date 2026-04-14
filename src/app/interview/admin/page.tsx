"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  FileText,
  Plus,
  Copy,
  Check,
  MessageSquare,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─── */

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

interface AdminRequest {
  id: number;
  racerId: number | null;
  playerName: string;
  grade: string | null;
  region: string | null;
  requestType: string;
  selectedQuestions: string[];
  status: "pending" | "sent" | "in_progress" | "completed" | "expired";
  formUrl: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  articleId: number | null;
  articleStatus: string | null;
}

type ArticleFilter = "all" | "review" | "approved" | "published" | "rejected";
type RequestFilter = "all" | "sent" | "completed" | "expired";
type Tab = "articles" | "requests";

/* ─── Constants ─── */

const ARTICLE_FILTERS: { key: ArticleFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "review", label: "검토중" },
  { key: "approved", label: "승인" },
  { key: "published", label: "공개" },
  { key: "rejected", label: "반려" },
];

const REQUEST_FILTERS: { key: RequestFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "sent", label: "발송됨" },
  { key: "completed", label: "완료" },
  { key: "expired", label: "만료" },
];

const ARTICLE_STATUS_STYLE: Record<AdminArticle["status"], string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  review: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  published: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const ARTICLE_STATUS_LABEL: Record<AdminArticle["status"], string> = {
  draft: "초안",
  review: "검토중",
  approved: "승인",
  published: "공개",
  rejected: "반려",
};

const REQUEST_STATUS_STYLE: Record<AdminRequest["status"], string> = {
  pending: "bg-slate-100 text-slate-600 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-yellow-100 text-yellow-700 border-yellow-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  expired: "bg-red-100 text-red-700 border-red-200",
};

const REQUEST_STATUS_LABEL: Record<AdminRequest["status"], string> = {
  pending: "대기",
  sent: "발송됨",
  in_progress: "작성중",
  completed: "완료",
  expired: "만료",
};

const REQUEST_TYPE_LABEL: Record<string, string> = {
  regular: "정기",
  rookie: "신인",
  event: "이벤트",
  special: "특별",
};

/* ─── Helpers ─── */

function formatDate(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16).replace("T", " ");
}

function daysSince(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
}

/* ─── Component ─── */

export default function InterviewAdminPage() {
  const router = useRouter();

  /* Tab */
  const [tab, setTab] = useState<Tab>("articles");

  /* Articles state */
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [articleFilter, setArticleFilter] = useState<ArticleFilter>("all");

  /* Requests state */
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");

  /* UI state */
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  /* Fetch articles */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/interview/admin/articles", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setArticlesError("기사 목록을 불러오지 못했습니다");
          setArticlesLoading(false);
          return;
        }
        const json = (await res.json()) as { articles: AdminArticle[] };
        setArticles(json.articles);
        setArticlesLoading(false);
      } catch {
        if (!cancelled) {
          setArticlesError("네트워크 오류가 발생했습니다");
          setArticlesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Fetch requests */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/interview/admin/requests", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setRequestsError("요청 목록을 불러오지 못했습니다");
          setRequestsLoading(false);
          return;
        }
        const json = (await res.json()) as { requests: AdminRequest[] };
        setRequests(json.requests);
        setRequestsLoading(false);
      } catch {
        if (!cancelled) {
          setRequestsError("네트워크 오류가 발생했습니다");
          setRequestsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Article filters */
  const filteredArticles = useMemo(() => {
    if (articleFilter === "all") return articles;
    return articles.filter((a) => a.status === articleFilter);
  }, [articles, articleFilter]);

  const articleCounts = useMemo(() => {
    const c: Record<ArticleFilter, number> = {
      all: articles.length,
      review: 0,
      approved: 0,
      published: 0,
      rejected: 0,
    };
    for (const a of articles) {
      if (a.status in c) c[a.status as ArticleFilter]++;
    }
    return c;
  }, [articles]);

  /* Request filters */
  const filteredRequests = useMemo(() => {
    if (requestFilter === "all") return requests;
    return requests.filter((r) => r.status === requestFilter);
  }, [requests, requestFilter]);

  const requestCounts = useMemo(() => {
    const c: Record<RequestFilter, number> = {
      all: requests.length,
      sent: 0,
      completed: 0,
      expired: 0,
    };
    for (const r of requests) {
      if (r.status in c) c[r.status as RequestFilter]++;
    }
    return c;
  }, [requests]);

  /* Actions */
  const copyFormUrl = useCallback(
    async (req: AdminRequest) => {
      const url =
        req.formUrl ||
        `${window.location.origin}/interview/form/${req.id}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(req.id);
      setTimeout(() => setCopiedId(null), 2000);
    },
    [],
  );

  const regenerateArticle = useCallback(
    async (requestId: number) => {
      setGeneratingId(requestId);
      try {
        const res = await fetch("/api/interview/generate-article", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
        const json = await res.json();
        if (res.ok && json.articleId) {
          router.push(`/interview/admin/${json.articleId}`);
        } else {
          alert(json.error || "기사 생성에 실패했습니다");
        }
      } catch {
        alert("네트워크 오류가 발생했습니다");
      } finally {
        setGeneratingId(null);
      }
    },
    [router],
  );

  const sendKakao = useCallback((req: AdminRequest) => {
    const url =
      req.formUrl ||
      `${window.location.origin}/interview/form/${req.id}`;
    const text = `[7randoms 인터뷰 요청]\n${req.playerName} 선수님, 인터뷰 폼이 도착했습니다.\n\n${url}`;
    window.open(
      `https://accounts.kakao.com/login?continue=https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      "_blank",
    );
  }, []);

  /* ─── Render ─── */

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            인터뷰 관리
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            인터뷰 요청과 기사를 관리합니다
          </p>
        </div>
        <Link href="/interview/admin/new">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            새 인터뷰 요청
          </Button>
        </Link>
      </div>

      {/* Tab selector */}
      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("articles")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "articles"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          기사 관리
          <span className="ml-1.5 text-xs opacity-60">
            {articles.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("requests")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "requests"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          요청 관리
          <span className="ml-1.5 text-xs opacity-60">
            {requests.length}
          </span>
        </button>
      </div>

      {/* ═══ Articles Tab ═══ */}
      {tab === "articles" && (
        <>
          {/* Filter tabs */}
          <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
            {ARTICLE_FILTERS.map((f) => {
              const active = articleFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setArticleFilter(f.key)}
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
                    {articleCounts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Article list */}
          {articlesLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : articlesError ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-red-500">
                {articlesError}
              </CardContent>
            </Card>
          ) : filteredArticles.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {articleFilter === "all"
                    ? "아직 생성된 기사가 없습니다"
                    : `${ARTICLE_FILTERS.find((f) => f.key === articleFilter)?.label} 상태의 기사가 없습니다`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4">
              {filteredArticles.map((a) => (
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
                        className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ARTICLE_STATUS_STYLE[a.status]}`}
                      >
                        {ARTICLE_STATUS_LABEL[a.status]}
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
        </>
      )}

      {/* ═══ Requests Tab ═══ */}
      {tab === "requests" && (
        <>
          {/* Filter tabs */}
          <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
            {REQUEST_FILTERS.map((f) => {
              const active = requestFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRequestFilter(f.key)}
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
                    {requestCounts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Request list */}
          {requestsLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : requestsError ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-red-500">
                {requestsError}
              </CardContent>
            </Card>
          ) : filteredRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {requestFilter === "all"
                    ? "아직 인터뷰 요청이 없습니다"
                    : `${REQUEST_FILTERS.find((f) => f.key === requestFilter)?.label} 상태의 요청이 없습니다`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4">
              {filteredRequests.map((r) => (
                <Card
                  key={r.id}
                  className="overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
                    {/* Top row: name + badges + status */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-foreground">
                        {r.playerName}
                      </span>
                      {r.grade && (
                        <Badge variant="secondary" className="text-[11px]">
                          {r.grade}
                        </Badge>
                      )}
                      {r.region && (
                        <Badge variant="outline" className="text-[11px]">
                          {r.region}
                        </Badge>
                      )}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {REQUEST_TYPE_LABEL[r.requestType] ?? r.requestType}
                      </span>
                      <span
                        className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${REQUEST_STATUS_STYLE[r.status]}`}
                      >
                        {REQUEST_STATUS_LABEL[r.status]}
                      </span>
                    </div>

                    {/* Dates */}
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>생성: {formatDate(r.createdAt)}</span>
                      {r.completedAt && (
                        <span>완료: {formatDate(r.completedAt)}</span>
                      )}
                    </div>

                    {/* Article status + action buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Article link / generate */}
                      {r.status === "completed" && (
                        <>
                          {r.articleId ? (
                            <Link
                              href={`/interview/admin/${r.articleId}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                기사 보기
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              disabled={generatingId === r.id}
                              onClick={() => regenerateArticle(r.id)}
                            >
                              {generatingId === r.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              기사 생성
                            </Button>
                          )}
                        </>
                      )}

                      {/* Copy form URL (for non-completed requests) */}
                      {r.status !== "completed" && r.status !== "expired" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => copyFormUrl(r)}
                        >
                          {copiedId === r.id ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copiedId === r.id ? "복사됨" : "폼 URL 복사"}
                        </Button>
                      )}

                      {/* Kakao resend (for sent + old) */}
                      {r.status === "sent" &&
                        r.sentAt &&
                        daysSince(r.sentAt) >= 2 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => sendKakao(r)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            카카오톡 재전송
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
