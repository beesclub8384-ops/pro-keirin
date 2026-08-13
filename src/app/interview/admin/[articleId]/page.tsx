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
  Search,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pickArticleBody } from "@/lib/article-body";

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

interface SpellItem {
  wrong: string;
  correct: string;
  type: string;
}

/** 자동 적용을 허용할 최소 길이. 1글자 치환("되"→"돼")은 본문 전역을 망가뜨린다. */
const MIN_AUTO_REPLACE_LEN = 2;

interface CorrectionPlan {
  /** 교정을 모두 반영한 본문 */
  corrected: string;
  /** 실제로 반영되는 항목 (+ 본문에서 몇 군데 바뀌는지) */
  applicable: Array<SpellItem & { hits: number }>;
  /** 자동 적용에서 빠진 항목 + 이유 */
  skipped: Array<SpellItem & { reason: string }>;
}

/**
 * 검사 결과를 본문에 적용한 결과를 계산한다 (순수 함수 — 상태를 바꾸지 않는다).
 *
 * spellcheck API 는 교정된 전문이 아니라 {wrong, correct} 쌍만 돌려주므로
 * 치환은 여기서 한다. 모델에게 전문을 다시 받아쓰면 마크다운 구조나 [PHOTO_n]
 * 태그가 조용히 바뀔 수 있어서, 지목된 표현만 바꾸는 이 방식이 안전하다.
 */
function planCorrections(source: string, items: SpellItem[]): CorrectionPlan {
  let corrected = source;
  const applicable: CorrectionPlan["applicable"] = [];
  const skipped: CorrectionPlan["skipped"] = [];

  for (const item of items) {
    const wrong = item.wrong ?? "";
    const correct = item.correct ?? "";
    if (!wrong || wrong === correct) {
      skipped.push({ ...item, reason: "바뀌는 내용 없음" });
      continue;
    }
    if (wrong.length < MIN_AUTO_REPLACE_LEN) {
      skipped.push({ ...item, reason: "너무 짧아 직접 수정 필요" });
      continue;
    }
    const hits = corrected.split(wrong).length - 1;
    if (hits === 0) {
      skipped.push({ ...item, reason: "본문에서 찾지 못함" });
      continue;
    }
    corrected = corrected.split(wrong).join(correct);
    applicable.push({ ...item, hits });
  }

  return { corrected, applicable, skipped };
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

  const [spellChecking, setSpellChecking] = useState(false);
  const [spellResults, setSpellResults] = useState<SpellItem[] | null>(null);
  const [spellError, setSpellError] = useState<string | null>(null);
  /** 일괄 적용 직전 본문 — 되돌리기용. null 이면 아직 적용 안 한 상태 */
  const [bodyBeforeSpell, setBodyBeforeSpell] = useState<string | null>(null);
  /**
   * 적용 시점의 계산 결과를 그대로 얼려둔다.
   * 적용 후에는 본문에서 오타가 사라져 아래 미리보기 계산이 전부
   * "본문에서 찾지 못함"으로 뒤집히므로, 결과 표시는 이 스냅샷을 쓴다.
   */
  const [appliedPlan, setAppliedPlan] = useState<CorrectionPlan | null>(null);

  // 검사 결과를 현재 본문에 적용하면 어떻게 되는지 미리 계산.
  // body 가 바뀌면(관리자가 직접 고치면) 다시 계산돼 목록이 최신 상태를 따라간다.
  const spellPlan = spellResults ? planCorrections(body, spellResults) : null;
  // 적용 전에는 실시간 계산, 적용 후에는 스냅샷을 보여준다
  const viewPlan = appliedPlan ?? spellPlan;

  async function handleSpellCheck() {
    setSpellChecking(true);
    setSpellResults(null);
    setSpellError(null);
    setBodyBeforeSpell(null);
    setAppliedPlan(null);
    try {
      const res = await fetch("/api/interview/admin/spellcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "검사 실패");
      setSpellResults(json.items ?? []);
    } catch (err) {
      setSpellError(err instanceof Error ? err.message : "검사 실패");
    } finally {
      setSpellChecking(false);
    }
  }

  /** 적용 가능한 교정을 본문에 한 번에 반영. 저장 전이라 DB에는 아직 안 들어간다. */
  function applyAllCorrections() {
    if (!spellPlan || spellPlan.applicable.length === 0) return;
    setBodyBeforeSpell(body);
    setAppliedPlan(spellPlan);
    setBody(spellPlan.corrected);
  }

  /** 일괄 적용 직전 본문으로 되돌린다 */
  function undoCorrections() {
    if (bodyBeforeSpell === null) return;
    setBody(bodyBeforeSpell);
    setBodyBeforeSpell(null);
    setAppliedPlan(null);
  }

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
        // 공개 페이지와 같은 규칙으로 골라야 에디터에 뜬 본문 = 화면에 나가는 본문이 된다
        setBody(
          pickArticleBody(json.article.articleEdited, json.article.articleRaw),
        );
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
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleSpellCheck}
                  disabled={spellChecking || !body.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  {spellChecking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  맞춤법 검사
                </button>
              </div>
              {spellError && (
                <p className="mt-2 text-xs text-red-500">{spellError}</p>
              )}
              {spellResults !== null && viewPlan !== null && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800">
                      {spellResults.length === 0
                        ? "맞춤법 오류가 발견되지 않았습니다"
                        : `${spellResults.length}개의 의심 사항이 발견되었습니다`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSpellResults(null);
                        setBodyBeforeSpell(null);
                        setAppliedPlan(null);
                      }}
                      className="text-xs text-amber-600 hover:text-amber-800"
                    >
                      닫기
                    </button>
                  </div>

                  {viewPlan.applicable.length > 0 && (
                    <div className="mb-3 space-y-1.5">
                      {viewPlan.applicable.map((r, i) => (
                        <div
                          key={`ok-${i}`}
                          className="flex items-baseline gap-2 text-xs"
                        >
                          <span className="line-through text-red-600">
                            {r.wrong}
                          </span>
                          <span className="text-amber-800">→</span>
                          <span className="font-medium text-emerald-700">
                            {r.correct}
                          </span>
                          <span className="rounded bg-amber-200/60 px-1.5 py-0.5 text-[10px] text-amber-700">
                            {r.type}
                          </span>
                          {r.hits > 1 && (
                            <span className="text-[10px] text-amber-600">
                              {r.hits}곳
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {viewPlan.skipped.length > 0 && (
                    <div className="mb-3 space-y-1.5 border-t border-amber-200 pt-2">
                      <p className="text-[11px] font-medium text-amber-700">
                        자동 적용 제외 — 본문에서 직접 수정해주세요
                      </p>
                      {viewPlan.skipped.map((r, i) => (
                        <div
                          key={`skip-${i}`}
                          className="flex items-baseline gap-2 text-xs opacity-70"
                        >
                          <span className="line-through text-red-600">
                            {r.wrong}
                          </span>
                          <span className="text-amber-800">→</span>
                          <span className="font-medium text-emerald-700">
                            {r.correct}
                          </span>
                          <span className="text-[10px] text-amber-600">
                            ({r.reason})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {bodyBeforeSpell !== null ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                        <Check className="h-4 w-4 flex-shrink-0" />
                        {viewPlan.applicable.length}건 적용됨 — 아직 저장 전입니다.
                        [저장]을 눌러야 DB에 반영됩니다
                      </span>
                      <button
                        type="button"
                        onClick={undoCorrections}
                        className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                        되돌리기
                      </button>
                    </div>
                  ) : (
                    viewPlan.applicable.length > 0 && (
                      <button
                        type="button"
                        onClick={applyAllCorrections}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                        이대로 적용 ({viewPlan.applicable.length}건)
                      </button>
                    )
                  )}
                </div>
              )}
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
