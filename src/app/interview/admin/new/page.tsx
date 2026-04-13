"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RecentRace {
  year: number;
  round: number;
  day: number;
  race_no: number;
  rank: number | null;
  tactic: string | null;
}

interface RecommendedQuestion {
  code: string;
  category: string;
  subcategory: string;
  questionText: string;
  format: string;
  choices: unknown | null;
}

interface PlayerContext {
  recentResults: RecentRace[];
  situation: string;
  situationLabel: string;
}

interface RecommendResult {
  questions: RecommendedQuestion[];
  playerContext: PlayerContext;
}

interface AllQuestion {
  code: string;
  category: string;
  subcategory: string;
  questionText: string;
  format: string;
  choices: unknown | null;
  requiresAutoGenerate: boolean | null;
}

type RequestType = "regular" | "rookie" | "event" | "special";

const REQUEST_TYPES: { key: RequestType; label: string }[] = [
  { key: "regular", label: "정기" },
  { key: "rookie", label: "신인" },
  { key: "event", label: "이벤트" },
  { key: "special", label: "특별" },
];

const GRADES = ["선발", "우수", "특선"];

export default function NewInterviewRequestPage() {
  const router = useRouter();

  const [playerName, setPlayerName] = useState("");
  const [grade, setGrade] = useState("");
  const [region, setRegion] = useState("");
  const [requestType, setRequestType] = useState<RequestType>("regular");

  const [recommending, setRecommending] = useState(false);
  const [recommendation, setRecommendation] = useState<RecommendResult | null>(
    null,
  );
  const [questions, setQuestions] = useState<RecommendedQuestion[]>([]);
  const [allQuestions, setAllQuestions] = useState<AllQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/interview/admin/questions", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAllQuestions(j.questions ?? []))
      .catch(() => {});
  }, []);

  const byCategory = useMemo(() => {
    const m = new Map<string, AllQuestion[]>();
    for (const q of allQuestions) {
      const arr = m.get(q.category) ?? [];
      arr.push(q);
      m.set(q.category, arr);
    }
    return m;
  }, [allQuestions]);

  async function handleRecommend() {
    setError(null);
    setRecommendation(null);
    setQuestions([]);
    if (!playerName.trim()) {
      setError("선수 이름을 입력해주세요");
      return;
    }
    setRecommending(true);
    try {
      const res = await fetch("/api/interview/admin/recommend-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerName.trim(), requestType }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "추천 실패" }));
        setError(j.error ?? "추천 실패");
        return;
      }
      const json = (await res.json()) as RecommendResult;
      setRecommendation(json);
      setQuestions(json.questions);
    } catch {
      setError("네트워크 오류");
    } finally {
      setRecommending(false);
    }
  }

  function replaceQuestion(idx: number, newCode: string) {
    const target = allQuestions.find((q) => q.code === newCode);
    if (!target) return;
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === idx
          ? {
              code: target.code,
              category: target.category,
              subcategory: target.subcategory,
              questionText: target.questionText,
              format: target.format,
              choices: target.choices,
            }
          : q,
      ),
    );
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim(),
          grade: grade || null,
          region: region || null,
          requestType,
          selectedQuestions: questions.map((q) => q.code),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "생성 실패" }));
        setError(j.error ?? "생성 실패");
        return;
      }
      const json = (await res.json()) as { id: number };
      setCreatedId(json.id);
    } catch {
      setError("네트워크 오류");
    } finally {
      setCreating(false);
    }
  }

  const formUrl = createdId
    ? `https://pro-keirin.vercel.app/interview/form/${createdId}`
    : "";

  async function handleCopy() {
    if (!formUrl) return;
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function handleShare() {
    if (!formUrl) return;
    const message = `${playerName} 선수님, 7RANDOMS 인터뷰 요청입니다.\n\n아래 링크를 눌러 답변해주세요.\n${formUrl}`;
    setShareMsg(null);

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "7RANDOMS 인터뷰 요청",
          text: `${playerName} 선수님, 7RANDOMS 인터뷰 요청입니다. 아래 링크를 눌러 답변해주세요.`,
          url: formUrl,
        });
        return;
      } catch {
        // 사용자 취소 또는 실패 시 클립보드 폴백
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      setShareMsg("메시지가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
      setTimeout(() => setShareMsg(null), 3000);
    } catch {
      setShareMsg("복사에 실패했습니다");
    }
  }

  if (createdId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold">인터뷰 요청이 생성되었습니다</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              아래 URL을 선수에게 전달하세요
            </p>
            <div className="mx-auto mt-6 flex max-w-lg items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <input
                type="text"
                readOnly
                value={formUrl}
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="mx-auto mt-4 max-w-lg">
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold text-[#3C1E1E] shadow-sm transition-colors hover:brightness-95"
                style={{ backgroundColor: "#FEE500" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 3C6.48 3 2 6.58 2 11c0 2.87 1.9 5.39 4.78 6.83l-1.12 4.09c-.08.29.22.52.47.37l4.92-3.27c.31.03.63.05.95.05 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
                </svg>
                카카오톡으로 보내기
              </button>
              {shareMsg && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {shareMsg}
                </p>
              )}
            </div>
            <div className="mt-8 flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => router.push("/interview/admin")}
              >
                관리자 목록으로
              </Button>
              <Button
                onClick={() => {
                  setCreatedId(null);
                  setPlayerName("");
                  setGrade("");
                  setRegion("");
                  setQuestions([]);
                  setRecommendation(null);
                }}
              >
                새 요청 또 만들기
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-4">
        <Link
          href="/interview/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          목록으로
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-foreground sm:text-3xl">
        새 인터뷰 요청
      </h1>

      {/* Step 1 */}
      <Card className="mb-6">
        <CardContent className="space-y-4 px-5 py-6 sm:px-7">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
              STEP 1
            </span>
            <span className="text-sm font-semibold text-foreground">
              선수 정보 입력
            </span>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              선수 이름 *
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="예: 김진우"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                등급
              </label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="">선택</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                지부
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="예: 김포"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              인터뷰 유형
            </label>
            <div className="grid grid-cols-4 gap-2">
              {REQUEST_TYPES.map((t) => {
                const active = requestType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setRequestType(t.key)}
                    className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-white text-foreground hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            onClick={handleRecommend}
            disabled={recommending || !playerName.trim()}
            className="w-full gap-1.5"
          >
            {recommending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            질문 추천받기
          </Button>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {/* Step 2 */}
      {recommendation && (
        <Card className="mb-6">
          <CardContent className="space-y-5 px-5 py-6 sm:px-7">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
                STEP 2
              </span>
              <span className="text-sm font-semibold text-foreground">
                추천 질문 검토
              </span>
            </div>

            <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3">
              <p className="text-xs font-semibold text-brand">
                {playerName} 선수 최근 상황
              </p>
              <p className="mt-1 text-sm text-foreground">
                {recommendation.playerContext.situationLabel}
              </p>
            </div>

            <div className="space-y-3">
              {questions.map((q, idx) => {
                const sameCategory = (byCategory.get(q.category) ?? []).filter(
                  (x) => !questions.some((sel, i) => i !== idx && sel.code === x.code),
                );
                return (
                  <div
                    key={`${q.code}-${idx}`}
                    className="rounded-lg border border-border bg-white p-4"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {q.code}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {q.subcategory}
                      </span>
                      <select
                        value={q.code}
                        onChange={(e) => replaceQuestion(idx, e.target.value)}
                        className="ml-auto rounded border border-border bg-white px-2 py-1 text-[11px] focus:border-brand focus:outline-none"
                      >
                        {sameCategory.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                      {q.questionText}
                    </p>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={handleRecommend}
              variant="outline"
              disabled={recommending}
              className="w-full gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              다시 추천받기
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3 */}
      {recommendation && questions.length > 0 && (
        <Card>
          <CardContent className="space-y-4 px-5 py-6 sm:px-7">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
                STEP 3
              </span>
              <span className="text-sm font-semibold text-foreground">
                확인 및 생성
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {playerName} 선수에게 {questions.length}개 질문으로 인터뷰 요청을 생성합니다
            </p>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="w-full gap-1.5"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              인터뷰 요청 생성
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
