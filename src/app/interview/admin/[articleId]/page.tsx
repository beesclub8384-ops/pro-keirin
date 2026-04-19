"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  Save,
  Check,
  X,
  Eye,
  Pencil,
  Rocket,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Article {
  id: number;
  requestId: number;
  playerName: string;
  grade: string | null;
  region: string | null;
  articleRaw: string | null;
  articleEdited: string | null;
  headline: string | null;
  photos: string[] | null;
  status: "draft" | "review" | "approved" | "published" | "rejected";
  rejectReason: string | null;
  publishedAt: string | null;
}

interface ResponseRow {
  id: number;
  questionCode: string;
  questionText: string;
  answerText: string | null;
  answerChoice: string | null;
  photoUrls: string[] | null;
}

interface LoadData {
  article: Article;
  responses: ResponseRow[];
}

function replacePhotoTags(article: string, photos?: string[]): string {
  return article.replace(/\[PHOTO_(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (photos && photos[idx]) {
      return `![인터뷰 사진 ${num}](${photos[idx]})`;
    }
    return "";
  });
}

function collectPhotos(article: Article, responses: ResponseRow[]): string[] {
  if (article.photos && article.photos.length > 0) return article.photos;
  const urls: string[] = [];
  for (const r of responses) {
    if (r.photoUrls) {
      for (const u of r.photoUrls) {
        if (u) urls.push(u);
      }
    }
  }
  return urls;
}

const STATUS_STYLE: Record<Article["status"], string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  review: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  published: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<Article["status"], string> = {
  draft: "초안",
  review: "검토중",
  approved: "승인",
  published: "공개",
  rejected: "반려",
};

export default function InterviewAdminDetailPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = use(params);
  const router = useRouter();

  const [data, setData] = useState<LoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [responsesOpen, setResponsesOpen] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/interview/admin/articles/${articleId}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError("기사를 불러오지 못했습니다");
          setLoading(false);
          return;
        }
        const json = (await res.json()) as LoadData;
        setData(json);
        setHeadline(json.article.headline ?? "");
        setBody(json.article.articleEdited ?? json.article.articleRaw ?? "");
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
  }, [articleId]);

  async function handleSave() {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/interview/admin/articles/${articleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline, articleEdited: body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "저장 실패" }));
        setActionMsg(`저장 실패: ${err.error}`);
      } else {
        setActionMsg("저장되었습니다");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(
    newStatus: "approved" | "rejected" | "published",
    reason?: string,
  ) {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/interview/admin/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, rejectReason: reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "상태 변경 실패" }));
        setActionMsg(`실패: ${err.error}`);
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              article: { ...prev.article, status: newStatus },
            }
          : prev,
      );
      setActionMsg(`${STATUS_LABEL[newStatus]} 처리되었습니다`);
      setRejectOpen(false);
      setRejectReason("");
    } finally {
      setSaving(false);
    }
  }

  function resetToRaw() {
    if (!data) return;
    setBody(data.article.articleRaw ?? "");
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-sm text-red-500">{error ?? "알 수 없는 오류"}</p>
        <Link
          href="/interview/admin"
          className="mt-4 inline-block text-sm text-brand underline"
        >
          목록으로
        </Link>
      </div>
    );
  }

  const { article, responses } = data;
  const canPublish = article.status === "approved";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      {/* Back */}
      <div className="mb-4">
        <Link
          href="/interview/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          목록으로
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {article.playerName}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            {article.grade && (
              <Badge variant="secondary" className="text-[11px]">
                {article.grade}
              </Badge>
            )}
            {article.region && (
              <span className="text-xs text-muted-foreground">
                {article.region}
              </span>
            )}
          </div>
        </div>
        <span
          className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[article.status]}`}
        >
          {STATUS_LABEL[article.status]}
        </span>
      </div>

      {/* Raw responses (collapsible) */}
      <Card className="mb-6">
        <button
          type="button"
          onClick={() => setResponsesOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="text-sm font-semibold text-foreground">
            원본 답변 ({responses.length}건)
          </span>
          {responsesOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {responsesOpen && (
          <CardContent className="border-t border-border pt-5">
            <div className="space-y-5">
              {responses.map((r, i) => (
                <div key={r.id}>
                  <p className="mb-1 text-xs font-bold text-muted-foreground">
                    Q{i + 1} [{r.questionCode}]
                  </p>
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {r.questionText}
                  </p>
                  {r.answerChoice && (
                    <p className="text-xs text-brand">선택: {r.answerChoice}</p>
                  )}
                  {r.answerText && (
                    <p className="whitespace-pre-wrap text-sm text-foreground/80">
                      {r.answerText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${
            tab === "edit"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          <Pencil className="h-4 w-4" />
          편집
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${
            tab === "preview"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          <Eye className="h-4 w-4" />
          미리보기
        </button>
      </div>

      {/* Edit or Preview */}
      {tab === "edit" ? (
        <Card>
          <CardContent className="space-y-5 px-5 py-6 sm:px-7">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                헤드라인
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="기사 헤드라인"
                spellCheck
                lang="ko"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  기사 본문 (마크다운)
                </label>
                <button
                  type="button"
                  onClick={resetToRaw}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  원본으로 되돌리기
                </button>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={24}
                spellCheck
                lang="ko"
                className="w-full resize-y rounded-lg border border-border bg-white px-3 py-3 font-mono text-[13px] leading-relaxed focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="prose prose-sm max-w-none px-5 py-7 sm:px-8 sm:py-9">
            {headline && (
              <h1 className="mb-6 text-2xl font-extrabold">{headline}</h1>
            )}
            <Markdown remarkPlugins={[remarkGfm]}>
              {replacePhotoTags(body, collectPhotos(article, responses))}
            </Markdown>
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <div className="sticky bottom-4 mt-6">
        {actionMsg && (
          <p className="mb-2 text-center text-sm text-muted-foreground">
            {actionMsg}
          </p>
        )}
        <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-white p-3 shadow-lg">
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="outline"
            className="flex-1 gap-1.5"
          >
            <Save className="h-4 w-4" />
            저장
          </Button>
          <Button
            onClick={() => handleStatus("approved")}
            disabled={saving}
            className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700"
          >
            <Check className="h-4 w-4" />
            승인
          </Button>
          <Button
            onClick={() => setRejectOpen(true)}
            disabled={saving}
            className="flex-1 gap-1.5 bg-red-600 hover:bg-red-700"
          >
            <X className="h-4 w-4" />
            반려
          </Button>
          <Button
            onClick={() => handleStatus("published")}
            disabled={saving || !canPublish}
            className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-600/40"
          >
            <Rocket className="h-4 w-4" />
            공개
          </Button>
        </div>
      </div>

      {/* Reject modal */}
      {rejectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setRejectOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-lg font-bold text-foreground">
              반려 사유
            </h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={5}
              placeholder="반려 사유를 입력하세요"
              className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectOpen(false);
                  setRejectReason("");
                }}
              >
                취소
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                disabled={saving || !rejectReason.trim()}
                onClick={() => handleStatus("rejected", rejectReason)}
              >
                반려 확정
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
