"use client";

import { use, useEffect, useState } from "react";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface RequestInfo {
  id: number;
  playerName: string;
  grade: string | null;
  region: string | null;
  status: string;
}

type LoadState =
  | { kind: "loading" }
  | {
      kind: "error";
      code: "not_found" | "pending" | "completed" | "other";
      message: string;
    }
  | { kind: "ready"; data: RequestInfo }
  | { kind: "submitted" };

interface FormData {
  name: string;
  address: string;
  menu: string;
  menuDescription: string;
  otherNote: string;
}

const empty: FormData = {
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
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function GyeongshullinFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [form, setForm] = useState<FormData>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/gyeongshullin/form/${token}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setState({
            kind: "error",
            code: "not_found",
            message: "요청을 찾을 수 없습니다. URL을 다시 확인해주세요.",
          });
          return;
        }
        if (res.status === 403) {
          const j = await res.json();
          if (j.status === "pending") {
            setState({
              kind: "error",
              code: "pending",
              message:
                "아직 발송되지 않은 요청입니다. 사무국장에게 문의해주세요.",
            });
            return;
          }
          setState({
            kind: "error",
            code: "other",
            message: j.error || "접근할 수 없습니다.",
          });
          return;
        }
        if (res.status === 409) {
          setState({
            kind: "error",
            code: "completed",
            message: "이미 제출된 요청입니다. 감사합니다!",
          });
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setState({
            kind: "error",
            code: "other",
            message: j.error || "요청 정보를 불러오지 못했습니다.",
          });
          return;
        }
        const data = (await res.json()) as RequestInfo;
        setState({ kind: "ready", data });
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            code: "other",
            message: "네트워크 오류가 발생했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!form.name.trim()) {
      setSubmitError("가게 이름을 입력해주세요");
      return;
    }
    if (!form.address.trim()) {
      setSubmitError("주소를 입력해주세요");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/gyeongshullin/form/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "제출 실패");
        return;
      }
      setState({ kind: "submitted" });
    } catch {
      setSubmitError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  }

  // 로딩
  if (state.kind === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
        <p className="mt-4 text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  // 에러 상태
  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <AlertCircle className="mb-3 h-12 w-12 text-amber-500" />
            <p className="text-base font-semibold text-foreground">
              {state.code === "completed"
                ? "이미 제출되었습니다"
                : "접근할 수 없습니다"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 제출 완료
  if (state.kind === "submitted") {
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
          </CardContent>
        </Card>
      </div>
    );
  }

  // 폼 (ready 상태)
  const { data } = state;
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          맛집 추천 제출
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          안녕하세요,{" "}
          <span className="font-semibold text-foreground">
            {data.playerName}
          </span>
          {data.region ? ` (${data.region})` : ""} 선수님. 아래 정보만
          남겨주시면 사무국장이 검토 후 팬들에게 소개해드려요.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
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

          <Field
            label="기타 의견"
            hint="가게 분위기, 방문 팁 등 자유롭게 (선택)"
          >
            <textarea
              value={form.otherNote}
              onChange={(e) => update("otherNote", e.target.value)}
              placeholder="예: 사장님이 친절하시고 주차도 편해요"
              className={textareaClass}
              rows={2}
            />
          </Field>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {submitError}
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
