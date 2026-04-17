"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  Trash2,
  Plus,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AllQuestion {
  code: string;
  category: string;
  subcategory: string;
  questionText: string;
  format: string;
  choices: unknown | null;
}

interface DraftRequest {
  id: number;
  playerName: string;
  grade: string | null;
  region: string | null;
  requestType: string;
  selectedQuestions: string[];
  status: string;
}

type RequestType = "regular" | "rookie" | "event" | "special";

const REQUEST_TYPES: { key: RequestType; label: string }[] = [
  { key: "regular", label: "정기" },
  { key: "rookie", label: "신인" },
  { key: "event", label: "이벤트" },
  { key: "special", label: "특별" },
];

const GRADES = ["선발", "우수", "특선"];

export default function DraftEditPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [playerName, setPlayerName] = useState("");
  const [grade, setGrade] = useState("");
  const [region, setRegion] = useState("");
  const [requestType, setRequestType] = useState<RequestType>("regular");

  const [allQuestions, setAllQuestions] = useState<AllQuestion[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [sentId, setSentId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const [addCategory, setAddCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/interview/admin/requests`, { cache: "no-store" }).then((r) =>
        r.json(),
      ),
      fetch("/api/interview/admin/questions", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
    ])
      .then(([reqJson, qJson]) => {
        if (cancelled) return;
        setAllQuestions(qJson.questions ?? []);
        const req = (reqJson.requests ?? []).find(
          (r: DraftRequest) => String(r.id) === requestId,
        );
        if (!req || req.status !== "draft") {
          setError("초안을 찾을 수 없습니다");
          setLoading(false);
          return;
        }
        setPlayerName(req.playerName);
        setGrade(req.grade ?? "");
        setRegion(req.region ?? "");
        setRequestType((req.requestType as RequestType) ?? "regular");
        setSelectedCodes(req.selectedQuestions ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("데이터 로드 실패");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const byCategory = useMemo(() => {
    const m = new Map<string, AllQuestion[]>();
    for (const q of allQuestions) {
      const arr = m.get(q.category) ?? [];
      arr.push(q);
      m.set(q.category, arr);
    }
    return m;
  }, [allQuestions]);

  const selectedQuestions = useMemo(
    () =>
      selectedCodes
        .map((code) => allQuestions.find((q) => q.code === code))
        .filter((q): q is AllQuestion => !!q),
    [selectedCodes, allQuestions],
  );

  function removeQuestion(idx: number) {
    setSelectedCodes((prev) => prev.filter((_, i) => i !== idx));
  }

  function addQuestion(code: string) {
    if (!selectedCodes.includes(code)) {
      setSelectedCodes((prev) => [...prev, code]);
    }
    setAddCategory(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/interview/admin/requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(requestId),
          playerName: playerName.trim(),
          grade: grade || null,
          region: region || null,
          requestType,
          selectedQuestions: selectedCodes,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "저장 실패" }));
        setError(j.error ?? "저장 실패");
        return;
      }
      setSavedMsg("저장되었습니다");
      setTimeout(() => setSavedMsg(null), 3000);
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!playerName.trim()) {
      setError("선수 이름을 입력해주세요");
      return;
    }
    if (selectedCodes.length === 0) {
      setError("질문을 1개 이상 추가해주세요");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/admin/requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(requestId),
          playerName: playerName.trim(),
          grade: grade || null,
          region: region || null,
          requestType,
          selectedQuestions: selectedCodes,
          status: "sent",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "전송 실패" }));
        setError(j.error ?? "전송 실패");
        return;
      }
      setSentId(Number(requestId));
    } catch {
      setError("네트워크 오류");
    } finally {
      setSending(false);
    }
  }

  const formUrl = sentId
    ? `https://pro-keirin.vercel.app/interview/form/${sentId}`
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (sentId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold">인터뷰 요청이 전송되었습니다</h2>
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
                <p className="mt-2 text-xs text-muted-foreground">
                  {shareMsg}
                </p>
              )}
            </div>
            <div className="mt-8">
              <Button
                variant="outline"
                onClick={() => router.push("/interview/admin")}
              >
                관리자 목록으로
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

      <h1 className="mb-6 text-2xl font-bold text-foreground">초안 편집</h1>

      {error && (
        <p className="mb-4 text-sm text-red-500">{error}</p>
      )}

      {/* Player info */}
      <Card className="mb-6">
        <CardContent className="space-y-4 px-5 py-6 sm:px-7">
          <span className="text-sm font-semibold text-foreground">
            선수 정보
          </span>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              선수 이름 *
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
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
        </CardContent>
      </Card>

      {/* Questions */}
      <Card className="mb-6">
        <CardContent className="space-y-4 px-5 py-6 sm:px-7">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              질문 목록 ({selectedQuestions.length}개)
            </span>
          </div>

          {selectedQuestions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              아직 질문이 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {selectedQuestions.map((q, idx) => (
                <div
                  key={`${q.code}-${idx}`}
                  className="flex items-start gap-3 rounded-lg border border-border bg-white p-3"
                >
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {q.code}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {q.subcategory}
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">
                      {q.questionText}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(idx)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add question */}
          {addCategory === null ? (
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => setAddCategory([...byCategory.keys()][0] ?? null)}
            >
              <Plus className="h-4 w-4" />
              질문 추가
            </Button>
          ) : (
            <div className="rounded-lg border border-brand/20 bg-brand/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand">
                  카테고리 선택
                </span>
                <button
                  type="button"
                  onClick={() => setAddCategory(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  닫기
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...byCategory.keys()].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAddCategory(cat)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      addCategory === cat
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-white text-foreground hover:bg-muted"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {(byCategory.get(addCategory) ?? [])
                  .filter((q) => !selectedCodes.includes(q.code))
                  .map((q) => (
                    <button
                      key={q.code}
                      type="button"
                      onClick={() => addQuestion(q.code)}
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {q.code}
                      </span>{" "}
                      {q.questionText}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="space-y-3 px-5 py-6 sm:px-7">
          {savedMsg && (
            <p className="text-sm font-medium text-green-600">{savedMsg}</p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || sending}
              variant="outline"
              className="flex-1 gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              임시저장
            </Button>
            <Button
              onClick={handleSend}
              disabled={
                sending || saving || !playerName.trim() || selectedCodes.length === 0
              }
              className="flex-1 gap-1.5"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              요청하기
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
