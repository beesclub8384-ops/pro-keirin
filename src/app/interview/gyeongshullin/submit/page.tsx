"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FormState {
  recommenderName: string;
  recommenderGrade: string;
  recommenderRegion: string;
  name: string;
  address: string;
  menu: string;
  menuDescription: string;
  otherNote: string;
}

const empty: FormState = {
  recommenderName: "",
  recommenderGrade: "",
  recommenderRegion: "",
  name: "",
  address: "",
  menu: "",
  menuDescription: "",
  otherNote: "",
};

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const textareaClass = inputClass + " min-h-[80px] resize-y";

function Field({
  label,
  required = false,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-foreground">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export default function GyeongshullinSubmitPage() {
  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    const name = form.recommenderName.trim();
    if (name.length < 2) return;
    if (form.recommenderRegion.trim().length > 0) return;

    const handle = setTimeout(async () => {
      setLookingUp(true);
      try {
        const res = await fetch(
          `/api/gyeongshullin/lookup?name=${encodeURIComponent(name)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.found && data.region) {
          setForm((prev) => ({ ...prev, recommenderRegion: data.region }));
        }
      } catch {
        // silently fail
      } finally {
        setLookingUp(false);
      }
    }, 600);

    return () => clearTimeout(handle);
  }, [form.recommenderName, form.recommenderRegion]);

  async function handleSubmit() {
    setError(null);
    if (!form.recommenderName.trim()) {
      setError("본인 이름을 입력해주세요");
      return;
    }
    if (!form.name.trim()) {
      setError("가게 이름을 입력해주세요");
      return;
    }
    if (!form.address.trim()) {
      setError("주소를 입력해주세요");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/gyeongshullin/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "제출 실패");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <CheckCircle className="mb-3 h-12 w-12 text-green-500" />
            <p className="text-base font-semibold text-foreground">
              제출이 완료되었습니다
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              감사합니다! 사무국장이 검토 후 팬들에게 소개할게요.
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                setForm(empty);
                setDone(false);
              }}
            >
              다른 맛집 또 추천하기
            </Button>
            <Link
              href="/interview/gyeongshullin"
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              륜슐랭으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <div className="mb-5">
        <Link
          href="/interview/gyeongshullin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          륜슐랭
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          맛집 추천 제출
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          간단한 정보만 남겨주시면 사무국장이 검토 후 팬들에게 소개해드려요.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <Field
            label="본인 이름"
            required
            hint={lookingUp ? "조회 중..." : "조합원 명단에서 확인됩니다"}
          >
            <input
              type="text"
              value={form.recommenderName}
              onChange={(e) => update("recommenderName", e.target.value)}
              placeholder="예: 노태양"
              className={inputClass}
            />
          </Field>

          <Field label="기수 (선택)">
            <input
              type="text"
              value={form.recommenderGrade}
              onChange={(e) => update("recommenderGrade", e.target.value)}
              placeholder="예: 25기"
              className={inputClass}
            />
          </Field>

          <Field label="가게 이름" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="예: 뭉텅 동암점"
              className={inputClass}
            />
          </Field>

          <Field
            label="주소"
            required
            hint="네이버/카카오 지도에서 검색 후 정확한 주소를 붙여넣어주세요"
          >
            <textarea
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="예: 인천광역시 남동구 만수동 ..."
              className={textareaClass}
              rows={2}
            />
          </Field>

          <Field label="맛있게 먹은 메뉴 하나" hint="추천 메뉴 하나만">
            <input
              type="text"
              value={form.menu}
              onChange={(e) => update("menu", e.target.value)}
              placeholder="예: 소고기 뭉텅이"
              className={inputClass}
            />
          </Field>

          <Field label="그 메뉴의 특징" hint="맛, 양, 가성비 등 자유롭게">
            <textarea
              value={form.menuDescription}
              onChange={(e) => update("menuDescription", e.target.value)}
              placeholder="예: 두툼하게 썰어주는데 육즙이 살아있고..."
              className={textareaClass}
              rows={3}
            />
          </Field>

          <Field label="기타 의견" hint="가게 분위기, 방문 팁 등 자유롭게 (선택)">
            <textarea
              value={form.otherNote}
              onChange={(e) => update("otherNote", e.target.value)}
              placeholder="예: 사장님이 친절하시고 주차도 편해요"
              className={textareaClass}
              rows={2}
            />
          </Field>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full gap-1.5"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            제출하기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
