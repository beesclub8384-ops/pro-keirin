"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  Plus,
  X,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);

  const [questions, setQuestions] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function handleLookup() {
    if (!playerName.trim()) return;
    setLookingUp(true);
    setLookupMsg(null);
    try {
      const res = await fetch(
        `/api/interview/admin/lookup-player?name=${encodeURIComponent(playerName.trim())}`,
      );
      if (!res.ok) {
        setLookupMsg("선수를 찾을 수 없습니다 (수동 입력 가능)");
        return;
      }
      const json = await res.json();
      if (json.grade) setGrade(json.grade);
      if (json.region) setRegion(json.region);
      setLookupMsg(`${playerName} 선수 정보를 불러왔습니다`);
      setTimeout(() => setLookupMsg(null), 3000);
    } catch {
      setLookupMsg("네트워크 오류");
    } finally {
      setLookingUp(false);
    }
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, ""]);
  }

  function removeQuestion(idx: number) {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function editQuestion(idx: number, text: string) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? text : q)));
  }

  const validQuestions = questions.filter((q) => q.trim().length > 0);

  async function saveQuestionsToDB(): Promise<string[] | null> {
    const codes: string[] = [];
    for (const text of validQuestions) {
      const res = await fetch("/api/interview/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: text.trim(),
          category: "C",
          subcategory: "C-custom",
          isCustom: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "질문 저장 실패" }));
        setError(j.error ?? "질문 저장 실패");
        return null;
      }
      const sj = (await res.json()) as { question: { code: string } };
      codes.push(sj.question.code);
    }
    return codes;
  }

  async function handleSaveDraft() {
    if (!playerName.trim()) {
      setError("선수 이름을 입력해주세요");
      return;
    }
    if (validQuestions.length === 0) {
      setError("질문을 1개 이상 작성해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const codes = await saveQuestionsToDB();
      if (!codes) return;

      const res = await fetch("/api/interview/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim(),
          grade: grade || null,
          region: region || null,
          requestType,
          selectedQuestions: codes,
          status: "draft",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "저장 실패" }));
        setError(j.error ?? "저장 실패");
        return;
      }
      setSavedMsg("임시저장되었습니다");
      setTimeout(() => setSavedMsg(null), 3000);
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!playerName.trim()) {
      setError("선수 이름을 입력해주세요");
      return;
    }
    if (validQuestions.length === 0) {
      setError("질문을 1개 이상 작성해주세요");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const codes = await saveQuestionsToDB();
      if (!codes) {
        setCreating(false);
        return;
      }

      const res = await fetch("/api/interview/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim(),
          grade: grade || null,
          region: region || null,
          requestType,
          selectedQuestions: codes,
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
    } catch {}
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
      } catch {}
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
                  setQuestions([""]);
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

      {/* Step 1: 선수 정보 */}
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
            <div className="flex gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="예: 김진우"
                className="flex-1 rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lookingUp || !playerName.trim()}
                onClick={handleLookup}
                className="shrink-0 gap-1.5 px-4"
              >
                {lookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "검색"
                )}
              </Button>
            </div>
            {lookupMsg && (
              <p
                className={`mt-1.5 text-xs ${lookupMsg.includes("찾을 수 없") ? "text-amber-600" : "text-green-600"}`}
              >
                {lookupMsg}
              </p>
            )}
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
              {REQUEST_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setRequestType(t.key)}
                  className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                    requestType === t.key
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-white text-foreground hover:bg-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {/* Step 2: 질문 작성 */}
      <Card className="mb-6">
        <CardContent className="space-y-4 px-5 py-6 sm:px-7">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
              STEP 2
            </span>
            <span className="text-sm font-semibold text-foreground">
              질문 작성
            </span>
            <span className="text-xs text-muted-foreground">
              ({validQuestions.length}개 작성됨)
            </span>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-white p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold text-foreground/60">
                    Q{idx + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(idx)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <textarea
                  value={q}
                  onChange={(e) => editQuestion(idx, e.target.value)}
                  rows={3}
                  placeholder="질문을 입력하세요..."
                  className="w-full resize-y rounded-md border border-border bg-white px-3 py-2 text-sm leading-relaxed text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addQuestion}
            className="w-full gap-1.5"
          >
            <Plus className="h-4 w-4" />
            질문 추가
          </Button>
        </CardContent>
      </Card>

      {/* Step 3: 저장 */}
      <Card>
        <CardContent className="space-y-4 px-5 py-6 sm:px-7">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
              STEP 3
            </span>
            <span className="text-sm font-semibold text-foreground">
              확인 및 저장
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {playerName.trim() || "선수"} — {validQuestions.length}개 질문
          </p>
          {savedMsg && (
            <p className="text-sm font-medium text-green-600">{savedMsg}</p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={handleSaveDraft}
              disabled={
                saving || creating || !playerName.trim() || validQuestions.length === 0
              }
              variant="outline"
              className="flex-1 gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              임시저장
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                creating || saving || !playerName.trim() || validQuestions.length === 0
              }
              className="flex-1 gap-1.5"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              요청하기
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
