"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  X,
  Upload,
  Trash2,
  Save,
  Eye,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import type {
  GyeongshullinRestaurant,
  GyeongshullinStatus,
} from "@/lib/gyeongshullin";

interface Props {
  initial: GyeongshullinRestaurant | null;
}

interface FormState {
  recommenderName: string;
  recommenderGrade: string;
  recommenderRegion: string;
  name: string;
  address: string;
  menu: string;
  rawNote: string;
  memo: string;
  foodPhotos: string[];
  menuPhotos: string[];
}

function emptyState(): FormState {
  return {
    recommenderName: "",
    recommenderGrade: "",
    recommenderRegion: "",
    name: "",
    address: "",
    menu: "",
    rawNote: "",
    memo: "",
    foodPhotos: [],
    menuPhotos: [],
  };
}

function fromRestaurant(r: GyeongshullinRestaurant): FormState {
  return {
    recommenderName: r.recommenderName,
    recommenderGrade: r.recommenderGrade,
    recommenderRegion: r.recommenderRegion,
    name: r.name,
    address: r.address,
    menu: r.menu,
    rawNote: r.rawNote,
    memo: r.memo,
    foodPhotos: r.foodPhotos,
    menuPhotos: r.menuPhotos,
  };
}

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function PhotoGrid({
  urls,
  onRemove,
}: {
  urls: string[];
  onRemove: (url: string) => void;
}) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {urls.map((url) => (
        <div
          key={url}
          className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
        >
          <Image
            src={url}
            alt=""
            fill
            sizes="(max-width: 640px) 33vw, 200px"
            className="object-cover"
            unoptimized
          />
          <button
            type="button"
            onClick={() => onRemove(url)}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function GyeongshullinAdminForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = initial !== null;
  const restaurantId = initial?.id ?? null;

  const [form, setForm] = useState<FormState>(
    initial ? fromRestaurant(initial) : emptyState(),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    const name = form.recommenderName.trim();
    if (isEdit || name.length < 2) return;
    if (form.recommenderRegion.trim().length > 0) return;

    const handle = setTimeout(async () => {
      setLookingUp(true);
      try {
        const res = await fetch(
          `/api/interview/admin/lookup-player?name=${encodeURIComponent(name)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.region && !form.recommenderRegion.trim()) {
          setForm((prev) => ({ ...prev, recommenderRegion: data.region }));
        }
      } catch {
        // silently fail
      } finally {
        setLookingUp(false);
      }
    }, 600);

    return () => clearTimeout(handle);
  }, [form.recommenderName, form.recommenderRegion, isEdit]);
  const [generating, setGenerating] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<"food" | "menu" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const foodInputRef = useRef<HTMLInputElement>(null);
  const menuInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleGenerateReview() {
    setError(null);
    if (
      !form.name.trim() ||
      !form.address.trim() ||
      !form.recommenderName.trim()
    ) {
      setError("가게 이름, 주소, 추천 선수 이름을 먼저 입력해주세요");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/gyeongshullin/admin/generate-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: form.name,
          address: form.address,
          menu: form.menu,
          rawNote: form.rawNote,
          recommenderName: form.recommenderName,
          recommenderGrade: form.recommenderGrade,
          recommenderRegion: form.recommenderRegion,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "AI 리뷰 생성 실패");
      }
      update("memo", json.review as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 리뷰 생성 실패");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePhotoUpload(
    files: FileList | null,
    kind: "food" | "menu",
  ) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploadingKind(kind);

    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", kind);
        if (restaurantId !== null) {
          fd.append("restaurantId", String(restaurantId));
        }
        const res = await fetch("/api/gyeongshullin/admin/upload-photo", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "사진 업로드 실패");
        }
        newUrls.push(json.url as string);
      }
      if (kind === "food") {
        update("foodPhotos", [...form.foodPhotos, ...newUrls]);
      } else {
        update("menuPhotos", [...form.menuPhotos, ...newUrls]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진 업로드 실패");
    } finally {
      setUploadingKind(null);
    }
  }

  function removePhoto(kind: "food" | "menu", url: string) {
    if (kind === "food") {
      update(
        "foodPhotos",
        form.foodPhotos.filter((u) => u !== url),
      );
    } else {
      update(
        "menuPhotos",
        form.menuPhotos.filter((u) => u !== url),
      );
    }
  }

  async function handleSave(status: GyeongshullinStatus) {
    setError(null);
    if (
      !form.name.trim() ||
      !form.address.trim() ||
      !form.recommenderName.trim()
    ) {
      setError("가게 이름, 주소, 추천 선수 이름은 필수입니다");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        menu: form.menu,
        memo: form.memo,
        rawNote: form.rawNote,
        foodPhotos: form.foodPhotos,
        menuPhotos: form.menuPhotos,
        recommenderName: form.recommenderName,
        recommenderGrade: form.recommenderGrade,
        recommenderRegion: form.recommenderRegion,
      };

      if (isEdit && restaurantId !== null) {
        const res = await fetch(
          `/api/gyeongshullin/admin/restaurants/${restaurantId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, status }),
          },
        );
        if (!res.ok) {
          const j = await res.json();
          throw new Error(j.error || "저장 실패");
        }
      } else {
        const res = await fetch("/api/gyeongshullin/admin/restaurants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json();
          throw new Error(j.error || "저장 실패");
        }
        if (status === "published") {
          const created = (await res.json()) as GyeongshullinRestaurant;
          await fetch(
            `/api/gyeongshullin/admin/restaurants/${created.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "published" }),
            },
          );
        }
      }

      router.push("/interview/gyeongshullin/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || restaurantId === null) return;
    if (!confirm("정말로 삭제하시겠어요? 되돌릴 수 없습니다.")) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/gyeongshullin/admin/restaurants/${restaurantId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "삭제 실패");
      }
      router.push("/interview/gyeongshullin/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-32">
      <div className="mb-6">
        <Link
          href="/interview/gyeongshullin/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          관리자 목록
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          {isEdit ? "가게 편집" : "새 가게 등록"}
        </h1>
        {isEdit && initial && (
          <p className="mt-1 text-xs text-muted-foreground">
            상태:{" "}
            <span
              className={
                initial.status === "published"
                  ? "font-medium text-emerald-600"
                  : "font-medium text-amber-600"
              }
            >
              {initial.status === "published" ? "공개됨" : "임시저장"}
            </span>
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <Section title="추천 선수">
        <Field label="선수 이름" required>
          <input
            type="text"
            value={form.recommenderName}
            onChange={(e) => update("recommenderName", e.target.value)}
            placeholder="예: 노태양"
            className={inputClass}
          />
        </Field>
        <Field label="기수">
          <input
            type="text"
            value={form.recommenderGrade}
            onChange={(e) => update("recommenderGrade", e.target.value)}
            placeholder="예: 25기"
            className={inputClass}
          />
        </Field>
        <Field label="팀">
          <input
            type="text"
            value={form.recommenderRegion}
            onChange={(e) => update("recommenderRegion", e.target.value)}
            placeholder={lookingUp ? "선수 정보 조회 중..." : "예: 청평 (이름 입력 시 자동)"}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="가게 정보">
        <Field label="가게 이름" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="예: 춘천닭갈비집"
            className={inputClass}
          />
        </Field>
        <Field label="주소" required>
          <input
            type="text"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="예: 강원 춘천시 명동길 22"
            className={inputClass}
          />
        </Field>
        <Field label="대표 메뉴">
          <input
            type="text"
            value={form.menu}
            onChange={(e) => update("menu", e.target.value)}
            placeholder="예: 철판닭갈비, 막국수"
            className={inputClass}
          />
        </Field>
      </Section>

      <Section
        title="선수 원문 메모"
        description="선수가 카톡으로 보낸 내용을 그대로 붙여넣으세요. AI 리뷰 생성 시 힌트로 사용됩니다."
      >
        <textarea
          value={form.rawNote}
          onChange={(e) => update("rawNote", e.target.value)}
          placeholder="예: 여기 양 엄청 많고 사장님이 챔피언 사진 걸어두셨어요. 시합 끝나고 자주 감."
          rows={5}
          className={`${inputClass} resize-y`}
        />
      </Section>

      <Section
        title="리뷰"
        description="AI가 작성한 리뷰를 검토하고 필요하면 수정하세요."
      >
        <div className="mb-2 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGenerateReview}
            disabled={generating}
            className="gap-1.5"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {form.memo ? "AI 리뷰 다시 생성" : "AI 리뷰 생성"}
          </Button>
        </div>
        <textarea
          value={form.memo}
          onChange={(e) => update("memo", e.target.value)}
          placeholder="[AI 리뷰 생성] 버튼을 누르면 자동으로 채워집니다. 또는 직접 작성하세요."
          rows={12}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </Section>

      <Section title="음식 사진" description="여러 장 선택 가능">
        <input
          ref={foodInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            handlePhotoUpload(e.target.files, "food");
            if (e.target) e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => foodInputRef.current?.click()}
          disabled={uploadingKind === "food"}
          className="w-full gap-1.5"
        >
          {uploadingKind === "food" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          음식 사진 추가
        </Button>
        <PhotoGrid
          urls={form.foodPhotos}
          onRemove={(u) => removePhoto("food", u)}
        />
      </Section>

      <Section title="메뉴판 사진" description="여러 장 선택 가능">
        <input
          ref={menuInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            handlePhotoUpload(e.target.files, "menu");
            if (e.target) e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => menuInputRef.current?.click()}
          disabled={uploadingKind === "menu"}
          className="w-full gap-1.5"
        >
          {uploadingKind === "menu" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          메뉴판 사진 추가
        </Button>
        <PhotoGrid
          urls={form.menuPhotos}
          onRemove={(u) => removePhoto("menu", u)}
        />
      </Section>

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2">
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave("draft")}
            disabled={saving || deleting}
            className="flex-1 gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            임시저장
          </Button>
          <Button
            type="button"
            onClick={() => handleSave("published")}
            disabled={saving || deleting}
            className="flex-1 gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            공개하기
          </Button>
        </div>
      </div>
    </div>
  );
}
