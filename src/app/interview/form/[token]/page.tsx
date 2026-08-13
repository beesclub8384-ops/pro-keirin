"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Question {
  code: string;
  questionText: string;
  format: "text" | "scale" | "choice_text";
  choices: {
    scale?: number[];
    labels?: string[];
    options?: string[];
    follow_up?: string;
  } | null;
}

interface RequestInfo {
  id: number;
  playerName: string;
  grade: string | null;
  region: string | null;
  status: string;
}

interface FormData {
  request: RequestInfo;
  questions: Question[];
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; code: "not_found" | "pending" | "completed" | "other"; message: string }
  | { kind: "ready"; data: FormData }
  | { kind: "submitted" };

interface PhotoItem {
  url: string;
  uploading: boolean;
  previewUrl: string;
  error?: string;
}

const MAX_FREE_PHOTOS = 3;

interface AnswerState {
  answerText: string;
  answerChoice: string;
  followUp: string;
  photos: PhotoItem[];
}

function newAnswer(): AnswerState {
  return { answerText: "", answerChoice: "", followUp: "", photos: [] };
}

export default function InterviewFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [freePhotos, setFreePhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 공개 동의 — 체크 전에는 제출 불가
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/interview/form/${token}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setState({
            kind: "error",
            code: "not_found",
            message: "존재하지 않는 인터뷰입니다",
          });
          return;
        }
        if (res.status === 403) {
          setState({
            kind: "error",
            code: "pending",
            message: "아직 발송되지 않은 인터뷰입니다",
          });
          return;
        }
        if (res.status === 409) {
          setState({
            kind: "error",
            code: "completed",
            message: "이미 제출된 인터뷰입니다. 감사합니다!",
          });
          return;
        }
        if (!res.ok) {
          setState({
            kind: "error",
            code: "other",
            message: "인터뷰를 불러오지 못했습니다",
          });
          return;
        }
        const data = (await res.json()) as FormData;
        const init: Record<string, AnswerState> = {};
        for (const q of data.questions) init[q.code] = newAnswer();
        setAnswers(init);
        setState({ kind: "ready", data });
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            code: "other",
            message: "네트워크 오류가 발생했습니다",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const questions = state.kind === "ready" ? state.data.questions : [];
  const total = questions.length;

  function updateAnswer(code: string, patch: Partial<AnswerState>) {
    setAnswers((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  }

  async function addPhoto(code: string, files: FileList | null) {
    if (!files) return;
    // 업로드 경로는 숫자 request id 기준 — 로드된 요청 정보에서 가져온다 (URL은 토큰)
    const numericId = state.kind === "ready" ? state.data.request.id : null;
    if (numericId === null) return;
    const arr = Array.from(files);

    // 로컬 미리보기 + uploading=true로 즉시 표시
    const placeholders: PhotoItem[] = arr.map((file) => ({
      url: "",
      uploading: true,
      previewUrl: URL.createObjectURL(file),
    }));
    const startIdx = answers[code]?.photos.length ?? 0;
    setAnswers((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        photos: [...prev[code].photos, ...placeholders],
      },
    }));

    // 각 파일 업로드
    await Promise.all(
      arr.map(async (file, i) => {
        const slotIdx = startIdx + i;
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("requestId", String(numericId));
          const res = await fetch("/api/interview/upload-photo", {
            method: "POST",
            body: fd,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "업로드 실패" }));
            setAnswers((prev) => ({
              ...prev,
              [code]: {
                ...prev[code],
                photos: prev[code].photos.map((p, idx) =>
                  idx === slotIdx
                    ? { ...p, uploading: false, error: err.error ?? "업로드 실패" }
                    : p,
                ),
              },
            }));
            return;
          }
          const json = (await res.json()) as { url: string };
          setAnswers((prev) => ({
            ...prev,
            [code]: {
              ...prev[code],
              photos: prev[code].photos.map((p, idx) =>
                idx === slotIdx
                  ? { ...p, uploading: false, url: json.url }
                  : p,
              ),
            },
          }));
        } catch {
          setAnswers((prev) => ({
            ...prev,
            [code]: {
              ...prev[code],
              photos: prev[code].photos.map((p, idx) =>
                idx === slotIdx
                  ? { ...p, uploading: false, error: "네트워크 오류" }
                  : p,
              ),
            },
          }));
        }
      }),
    );
  }

  function removePhoto(code: string, idx: number) {
    setAnswers((prev) => {
      const target = prev[code].photos[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return {
        ...prev,
        [code]: {
          ...prev[code],
          photos: prev[code].photos.filter((_, i) => i !== idx),
        },
      };
    });
  }

  // 질문과 무관한 자유 첨부 사진 (최대 MAX_FREE_PHOTOS 장)
  async function addFreePhotos(files: FileList | null) {
    if (!files) return;
    const numericId = state.kind === "ready" ? state.data.request.id : null;
    if (numericId === null) return;
    const remaining = MAX_FREE_PHOTOS - freePhotos.length;
    if (remaining <= 0) return;
    const arr = Array.from(files).slice(0, remaining);
    if (arr.length === 0) return;

    // 로컬 미리보기 + uploading=true로 즉시 표시
    const placeholders: PhotoItem[] = arr.map((file) => ({
      url: "",
      uploading: true,
      previewUrl: URL.createObjectURL(file),
    }));
    const startIdx = freePhotos.length;
    setFreePhotos((prev) => [...prev, ...placeholders]);

    // 각 파일 업로드 (기존 upload-photo API 재사용)
    await Promise.all(
      arr.map(async (file, i) => {
        const slotIdx = startIdx + i;
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("requestId", String(numericId));
          // 자유 첨부 사진에만 빈티지 필름 필터 적용
          fd.append("applyFilter", "true");
          const res = await fetch("/api/interview/upload-photo", {
            method: "POST",
            body: fd,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "업로드 실패" }));
            setFreePhotos((prev) =>
              prev.map((p, idx) =>
                idx === slotIdx
                  ? { ...p, uploading: false, error: err.error ?? "업로드 실패" }
                  : p,
              ),
            );
            return;
          }
          const json = (await res.json()) as { url: string };
          setFreePhotos((prev) =>
            prev.map((p, idx) =>
              idx === slotIdx ? { ...p, uploading: false, url: json.url } : p,
            ),
          );
        } catch {
          setFreePhotos((prev) =>
            prev.map((p, idx) =>
              idx === slotIdx
                ? { ...p, uploading: false, error: "네트워크 오류" }
                : p,
            ),
          );
        }
      }),
    );
  }

  function removeFreePhoto(idx: number) {
    setFreePhotos((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // 답변·사진 업로드가 모두 끝났는지 (동의 여부는 아래에서 따로 합친다 —
  // 미체크가 유일한 blocker 일 때만 동의 안내를 띄우기 위해 분리해 둔다)
  const answersComplete = useMemo(() => {
    if (state.kind !== "ready") return false;
    const anyUploading = Object.values(answers).some((a) =>
      a.photos.some((p) => p.uploading),
    );
    const anyFreeUploading = freePhotos.some((p) => p.uploading);
    if (anyUploading || anyFreeUploading) return false;
    return state.data.questions.every((q) => {
      const a = answers[q.code];
      if (!a) return false;
      if (q.format === "text") return a.answerText.trim().length > 0;
      if (q.format === "scale") return a.answerChoice !== "";
      if (q.format === "choice_text") return a.answerChoice !== "";
      return false;
    });
  }, [state, answers, freePhotos]);

  const canSubmit = answersComplete && agreed;

  async function handleSubmit() {
    if (state.kind !== "ready") return;
    if (!agreed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const responses = state.data.questions.map((q) => {
        const a = answers[q.code];
        const isTextish = q.format === "text";
        const textValue = isTextish ? a.answerText : a.followUp;
        return {
          questionCode: q.code,
          questionText: q.questionText,
          answerText: textValue || null,
          answerChoice: q.format === "text" ? null : a.answerChoice || null,
          photoUrls: a.photos
            .filter((p) => p.url && !p.uploading && !p.error)
            .map((p) => p.url),
        };
      });
      const freePhotoUrls = freePhotos
        .filter((p) => p.url && !p.uploading && !p.error)
        .map((p) => p.url);
      const res = await fetch(`/api/interview/form/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses, freePhotos: freePhotoUrls }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "제출 실패" }));
        setSubmitError(err.error ?? "제출에 실패했습니다");
        setSubmitting(false);
        return;
      }
      setState({ kind: "submitted" });
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다");
      setSubmitting(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (state.kind === "error") {
    const isCompleted = state.code === "completed";
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            {isCompleted ? (
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            ) : (
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
            )}
            <p className="text-base font-medium text-foreground">
              {state.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.kind === "submitted") {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <h2 className="text-xl font-bold">감사합니다!</h2>
            <p className="text-sm text-muted-foreground">
              인터뷰가 제출되었습니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { request } = state.data;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-brand/10 to-brand/5 p-6 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-brand">
            7RANDOMS INTERVIEW
          </span>
        </div>
        <h1 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {request.playerName} 선수님,
          <br />
          7RANDOMS 인터뷰에 오신 것을 환영합니다
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {request.grade && (
            <Badge variant="secondary">{request.grade}</Badge>
          )}
          {request.region && (
            <span className="text-xs text-muted-foreground">
              {request.region}
            </span>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {questions.map((q, idx) => {
          const a = answers[q.code] ?? newAnswer();
          return (
            <Card key={q.code} className="overflow-hidden">
              <CardContent className="px-5 py-6 sm:px-7 sm:py-7">
                <div className="mb-4 flex items-center gap-2">
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
                    {idx + 1} / {total}
                  </span>
                </div>
                <h3 className="mb-5 text-[15px] font-semibold leading-relaxed text-foreground sm:text-base">
                  {q.questionText}
                </h3>

                {q.format === "text" && (
                  <textarea
                    value={a.answerText}
                    onChange={(e) =>
                      updateAnswer(q.code, { answerText: e.target.value })
                    }
                    rows={3}
                    placeholder="답변을 입력해주세요"
                    className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm leading-relaxed focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                )}

                {q.format === "scale" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-5 gap-2">
                      {(q.choices?.scale ?? [1, 2, 3, 4, 5]).map((n) => {
                        const selected = a.answerChoice === String(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              updateAnswer(q.code, { answerChoice: String(n) })
                            }
                            className={`rounded-lg border py-3 text-sm font-bold transition-colors ${
                              selected
                                ? "border-brand bg-brand text-white"
                                : "border-border bg-white text-foreground hover:bg-muted"
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    {q.choices?.labels && (
                      <div className="grid grid-cols-5 gap-2">
                        {q.choices.labels.map((label, i) => (
                          <span
                            key={i}
                            className="text-center text-[10px] leading-tight text-muted-foreground"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    {q.choices?.follow_up && (
                      <textarea
                        value={a.followUp}
                        onChange={(e) =>
                          updateAnswer(q.code, { followUp: e.target.value })
                        }
                        rows={3}
                        placeholder={q.choices.follow_up}
                        className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm leading-relaxed focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    )}
                  </div>
                )}

                {q.format === "choice_text" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {(q.choices?.options ?? []).map((opt) => {
                        const selected = a.answerChoice === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              updateAnswer(q.code, { answerChoice: opt })
                            }
                            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                              selected
                                ? "border-brand bg-brand/5"
                                : "border-border bg-white hover:bg-muted"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                                selected ? "border-brand" : "border-border"
                              }`}
                            >
                              {selected && (
                                <span className="h-2 w-2 rounded-full bg-brand" />
                              )}
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {q.choices?.follow_up && (
                      <textarea
                        value={a.followUp}
                        onChange={(e) =>
                          updateAnswer(q.code, { followUp: e.target.value })
                        }
                        rows={3}
                        placeholder={q.choices.follow_up}
                        className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm leading-relaxed focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    )}
                  </div>
                )}

                {/* Photos */}
                <div className="mt-5 border-t border-border/60 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      사진 첨부 (선택)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.photos.map((p, i) => (
                      <div
                        key={i}
                        className="relative h-20 w-20 overflow-hidden rounded-lg border border-border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.previewUrl || p.url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {p.uploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 className="h-5 w-5 animate-spin text-white" />
                          </div>
                        )}
                        {p.error && (
                          <div className="absolute inset-0 flex items-center justify-center bg-red-500/70 px-1 text-[9px] leading-tight text-white">
                            {p.error}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removePhoto(q.code, i)}
                          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-brand hover:text-brand">
                      <Camera className="h-5 w-5" />
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addPhoto(q.code, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Free photos (질문과 무관한 자유 첨부) */}
      <div className="mt-6">
        <Card className="overflow-hidden">
          <CardContent className="px-5 py-6 sm:px-7 sm:py-7">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-foreground sm:text-base">
                📷 사진 첨부 (선택사항)
              </h3>
              <span className="text-xs font-medium text-muted-foreground">
                {freePhotos.length} / {MAX_FREE_PHOTOS}
              </span>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              경주 사진, 훈련 사진 등 자유롭게 올려주세요
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {freePhotos.map((p, i) => (
                <div
                  key={i}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl || p.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {p.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  {p.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/70 px-1 text-[9px] leading-tight text-white">
                      {p.error}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFreePhoto(i)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {freePhotos.length < MAX_FREE_PHOTOS && (
                <label className="flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-brand hover:text-brand">
                  <Camera className="h-6 w-6" />
                  <span className="text-[10px] font-medium">사진 추가</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFreePhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submit */}
      <div className="sticky bottom-4 mt-8">
        {/* 공개 동의 — 체크해야 제출 버튼이 활성화된다 */}
        <div className="mb-2 rounded-xl border border-border bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-start gap-2.5">
            <input
              id="consent-publish"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
            />
            {/* label 은 문구만 감싼다 — 링크까지 감싸면 링크 클릭이 체크박스를 토글한다 */}
            <p className="text-xs leading-relaxed text-foreground/80">
              <label htmlFor="consent-publish" className="cursor-pointer">
                제출한 이름, 답변 내용, 첨부 사진이 7RANDOMS 앱에 인터뷰 기사로
                공개되는 것에 동의합니다.
              </label>{" "}
              <Link
                href="/interview/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand underline underline-offset-2"
              >
                (개인정보처리방침)
              </Link>
            </p>
          </div>
          {answersComplete && !agreed && (
            <p className="mt-2 text-xs font-medium text-red-500">
              공개 동의에 체크해야 제출할 수 있습니다
            </p>
          )}
        </div>
        {submitError && (
          <p className="mb-2 text-center text-sm text-red-500">{submitError}</p>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="h-12 w-full text-base font-bold shadow-lg"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              제출 중...
            </>
          ) : (
            "제출하기"
          )}
        </Button>
      </div>
    </div>
  );
}
