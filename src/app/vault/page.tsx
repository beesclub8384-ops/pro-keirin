"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ImageOff,
  Lock,
  LockKeyhole,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * 사무국장 전용 대납 입력 페이지 (/vault)
 *
 * - 비밀번호는 React state로만 들고 있는다. localStorage/쿠키에 저장하지 않으므로
 *   새로고침하면 다시 입력해야 한다.
 * - Supabase에 직접 접근하지 않고 /api/vault(service role)를 통해서만 읽고 쓴다.
 * - 사진은 비공개 버킷(daenap-photos)에 저장되고, 목록에서는 서버가 발급한
 *   서명 URL(1시간)로만 표시된다.
 */

/** ⚠️ src/app/api/vault/route.ts 의 CATEGORIES 와 반드시 동일하게 유지할 것 */
const CATEGORIES = [
  "경조사",
  "임원 및 대의원 지출",
  "낙차위로금",
  "라면 및 용기",
  "제세공과금",
  "감사회의",
  "후보생 지원",
  "환불",
  "재등록비용",
  "임대료",
  "회의 및 미팅 관련 비용",
  "은퇴 관련 비용",
  "기타지출",
  "법률법무",
  "기타",
] as const;

/** 세부분류는 이 성격분류를 선택했을 때만 표시한다 */
const SUB_CATEGORY_PARENT = "임원 및 대의원 지출";

/** ⚠️ src/app/api/vault/route.ts 의 SUB_CATEGORIES 와 반드시 동일하게 유지할 것 */
const SUB_CATEGORIES = ["교통비", "식대", "숙박비", "음료·다과"] as const;

/** 대납 1건당 사진 최대 장수 — 서버(route.ts MAX_PHOTOS)와 동일하게 유지할 것 */
const MAX_PHOTOS = 2;

/** ⚠️ route.ts 의 ALLOWED_MIME / 버킷 설정과 동일하게 유지할 것 */
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** 업로드 전 축소할 긴 변 기준 (px) */
const RESIZE_MAX_EDGE = 1600;

/** 리사이즈 후에도 이 크기를 넘으면 서버에서 거부된다 (route.ts MAX_UPLOAD_BYTES와 동일) */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

interface DaenapPhoto {
  path: string;
  signedUrl: string | null;
}

interface DaenapItem {
  id: string | number;
  date: string;
  recipient: string | null;
  amount: number | null;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  photo_urls: string[] | null;
  photos: DaenapPhoto[];
  created_at: string | null;
}

/** 저장 전 화면에 들고 있는 사진 1장 */
interface PendingPhoto {
  id: string;
  name: string;
  contentType: string;
  /** 업로드용 base64 (data URL 접두사 제외) */
  base64: string;
  /** 미리보기 objectURL. HEIC 등 브라우저가 못 읽는 포맷이면 null */
  previewUrl: string | null;
  byteSize: number;
}

/** 오늘 날짜를 로컬 기준 YYYY-MM-DD로 반환 */
function todayString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatAmount(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "-";
  return amount.toLocaleString("ko-KR");
}

/**
 * 업로드 전 사진을 긴 변 RESIZE_MAX_EDGE px 이내로 줄인다.
 *
 * HEIC(아이폰 기본 포맷)처럼 브라우저가 디코딩하지 못하는 포맷이면
 * 리사이즈와 미리보기를 포기하고 원본 그대로 올린다.
 * 즉 미리보기 실패가 업로드 실패로 이어지지 않는다.
 */
async function prepareImage(
  file: File,
): Promise<{ blob: Blob; contentType: string; previewUrl: string | null }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      RESIZE_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context 없음");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("toBlob 실패");

    return {
      blob,
      contentType: "image/jpeg",
      previewUrl: URL.createObjectURL(blob),
    };
  } catch {
    // HEIC 등 디코딩 불가 → 원본 그대로 업로드, 미리보기는 포기
    return { blob: file, contentType: file.type, previewUrl: null };
  }
}

/** Blob을 base64 문자열로 변환 (data URL 접두사 제거) */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다"));
    reader.readAsDataURL(blob);
  });
}

export default function VaultPage() {
  // --- 인증 상태 ---
  const [passwordInput, setPasswordInput] = useState("");
  const [password, setPassword] = useState<string | null>(null); // 인증 성공한 비밀번호
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // --- 목록 상태 ---
  const [items, setItems] = useState<DaenapItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // --- 입력 폼 상태 ---
  const [date, setDate] = useState(todayString);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 사진 크게 보기 ---
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  /** 목록 새로고침 (인증된 비밀번호 사용) */
  const loadList = useCallback(async (pw: string) => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", password: pw }),
      });
      const json = await res.json();
      if (!res.ok) {
        setListError(json?.error ?? "목록을 불러오지 못했습니다");
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setListError("서버에 연결하지 못했습니다");
    } finally {
      setListLoading(false);
    }
  }, []);

  /** 비밀번호 확인 — list 요청으로 검증하고 성공하면 그 결과를 그대로 목록에 쓴다 */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput) {
      setAuthError("비밀번호를 입력해주세요");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", password: passwordInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAuthError(
          res.status === 401
            ? "비밀번호가 틀렸습니다"
            : (json?.error ?? "확인에 실패했습니다"),
        );
        return;
      }
      setPassword(passwordInput);
      setPasswordInput("");
      setItems(json.items ?? []);
    } catch {
      setAuthError("서버에 연결하지 못했습니다");
    } finally {
      setAuthLoading(false);
    }
  }

  /** 대기 중인 사진의 objectURL을 해제한다 (메모리 누수 방지) */
  function revokePhotos(list: PendingPhoto[]) {
    for (const p of list) {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    }
  }

  /** 잠그기 — 비밀번호와 조회한 데이터를 메모리에서 비운다 */
  function handleLock() {
    revokePhotos(photos);
    setPhotos([]);
    setPassword(null);
    setItems([]);
    setLightboxUrl(null);
    setFormError("");
    setFormSuccess("");
  }

  /** 파일 선택 — 남은 장수만큼만 받아 리사이즈 후 대기 목록에 넣는다 */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    // 같은 파일을 다시 고를 수 있도록 input 값을 비운다
    e.target.value = "";
    if (selected.length === 0) return;

    setFormError("");
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setFormError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다`);
      return;
    }
    if (selected.length > remaining) {
      setFormError(
        `사진은 최대 ${MAX_PHOTOS}장까지입니다. 앞의 ${remaining}장만 추가했습니다`,
      );
    }

    setPhotoBusy(true);
    try {
      const added: PendingPhoto[] = [];
      for (const file of selected.slice(0, remaining)) {
        const { blob, contentType, previewUrl } = await prepareImage(file);

        if (!ALLOWED_MIME.includes(contentType)) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setFormError("JPG, PNG, WEBP, HEIC 이미지만 첨부할 수 있습니다");
          continue;
        }
        if (blob.size > MAX_UPLOAD_BYTES) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setFormError(
            `"${file.name}"은(는) 용량이 너무 큽니다 (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하)`,
          );
          continue;
        }

        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || "사진",
          contentType,
          base64: await blobToBase64(blob),
          previewUrl,
          byteSize: blob.size,
        });
      }
      if (added.length > 0) setPhotos((prev) => [...prev, ...added]);
    } catch {
      setFormError("사진을 읽지 못했습니다");
    } finally {
      setPhotoBusy(false);
    }
  }

  /** 대기 중인 사진 1장 제거 */
  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  /** 대납 저장 — 사진을 먼저 업로드해 경로를 받고, 그 경로들과 함께 등록한다 */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;

    setFormError("");
    setFormSuccess("");

    if (!date) return setFormError("날짜를 입력해주세요");
    if (!recipient.trim()) return setFormError("누구에게 지급했는지 입력해주세요");
    if (amount === "" || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return setFormError("금액을 0 이상의 숫자로 입력해주세요");
    }
    if (!category) return setFormError("성격분류를 선택해주세요");

    setSaving(true);
    try {
      // 1) 사진 업로드 → Storage 경로 확보
      const uploadedPaths: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        for (const photo of photos) {
          const res = await fetch("/api/vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "upload",
              password,
              contentType: photo.contentType,
              data: photo.base64,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json?.path) {
            setFormError(json?.error ?? "사진 업로드에 실패했습니다");
            return;
          }
          uploadedPaths.push(json.path);
        }
        setUploading(false);
      }

      // 2) 대납 등록
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          password,
          date,
          recipient: recipient.trim(),
          amount: Number(amount),
          description: description.trim(),
          category,
          sub_category: category === SUB_CATEGORY_PARENT ? subCategory : null,
          photo_urls: uploadedPaths,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json?.error ?? "저장에 실패했습니다");
        return;
      }

      // 폼 초기화 (날짜는 오늘로 리셋 — 연속 입력 편의)
      revokePhotos(photos);
      setPhotos([]);
      setDate(todayString());
      setRecipient("");
      setAmount("");
      setDescription("");
      setCategory("");
      setSubCategory("");
      setFormSuccess("저장했습니다");
      await loadList(password);
    } catch {
      setFormError("서버에 연결하지 못했습니다");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  }

  /** 성격분류가 '임원 및 대의원 지출'이 아니게 바뀌면 세부분류를 비운다 */
  function handleCategoryChange(value: string) {
    setCategory(value);
    if (value !== SUB_CATEGORY_PARENT) setSubCategory("");
  }

  /** 저장 성공 메시지는 3초 뒤 자동으로 지운다 */
  useEffect(() => {
    if (!formSuccess) return;
    const timer = setTimeout(() => setFormSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [formSuccess]);

  /** 크게 보기 모달은 ESC로 닫는다 */
  useEffect(() => {
    if (!lightboxUrl) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setLightboxUrl(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  // ---------------------------------------------------------------- 비밀번호 화면
  if (!password) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyhole className="size-5" />
              사무국장 전용
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              비밀번호를 입력하면 대납 입력 화면이 열립니다.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Input
                type="password"
                inputMode="text"
                autoComplete="current-password"
                placeholder="비밀번호"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="h-12 text-base"
                autoFocus
              />
              {authError && (
                <p className="text-sm font-medium text-destructive">{authError}</p>
              )}
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={authLoading}>
                {authLoading ? "확인 중..." : "들어가기"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ---------------------------------------------------------------- 입력 + 목록 화면
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">대납 입력</h1>
        <Button variant="outline" size="sm" onClick={handleLock}>
          <Lock className="size-4" />
          잠그기
        </Button>
      </div>

      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">새 대납 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-date" className="text-sm font-medium">
                날짜
              </label>
              <Input
                id="vault-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-recipient" className="text-sm font-medium">
                누구에게
              </label>
              <Input
                id="vault-recipient"
                type="text"
                placeholder="예) 홍길동"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-amount" className="text-sm font-medium">
                금액 (원)
              </label>
              <Input
                id="vault-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="예) 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-description" className="text-sm font-medium">
                명목 / 내용
              </label>
              <Input
                id="vault-description"
                type="text"
                placeholder="예) 대의원 회의 교통비"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">성격분류</span>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-12 w-full text-base">
                  <SelectValue placeholder="선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="py-2.5 text-base">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {category === SUB_CATEGORY_PARENT && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">세부분류</span>
                <Select value={subCategory} onValueChange={setSubCategory}>
                  <SelectTrigger className="h-12 w-full text-base">
                    <SelectValue placeholder="선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_CATEGORIES.map((s) => (
                      <SelectItem key={s} value={s} className="py-2.5 text-base">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 사진 첨부 */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                사진 (영수증/송금캡쳐){" "}
                <span className="font-normal text-muted-foreground">
                  {photos.length}/{MAX_PHOTOS}
                </span>
              </span>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12 w-full text-base"
                onClick={() => fileInputRef.current?.click()}
                disabled={photos.length >= MAX_PHOTOS || photoBusy || saving}
              >
                <Camera className="size-4" />
                {photoBusy
                  ? "사진 준비 중..."
                  : photos.length >= MAX_PHOTOS
                    ? `사진 ${MAX_PHOTOS}장 첨부됨`
                    : "사진 추가"}
              </Button>

              {photos.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative">
                      {photo.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.previewUrl}
                          alt={photo.name}
                          className="h-24 w-24 rounded-md border object-cover"
                        />
                      ) : (
                        // HEIC 등 미리보기 불가 — 업로드 자체는 정상 진행된다
                        <div className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border bg-muted px-1 text-center">
                          <ImageOff className="size-5 text-muted-foreground" />
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            미리보기 불가
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        aria-label={`${photo.name} 삭제`}
                        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border bg-white text-foreground shadow hover:bg-muted"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {formError && (
              <p className="text-sm font-medium text-destructive">{formError}</p>
            )}
            {formSuccess && (
              <p className="text-sm font-medium text-emerald-600">{formSuccess}</p>
            )}

            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={saving || photoBusy}>
              <Plus className="size-4" />
              {uploading ? "사진 업로드 중..." : saving ? "저장 중..." : "저장"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            대납 내역 {items.length > 0 && `(${items.length}건)`}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadList(password)}
            disabled={listLoading}
            aria-label="목록 새로고침"
          >
            <RefreshCw className={listLoading ? "size-4 animate-spin" : "size-4"} />
            새로고침
          </Button>
        </CardHeader>
        <CardContent>
          {listError && (
            <p className="mb-3 text-sm font-medium text-destructive">{listError}</p>
          )}
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {listLoading ? "불러오는 중..." : "아직 입력된 대납이 없습니다"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>명목</TableHead>
                  <TableHead>성격</TableHead>
                  <TableHead>사진</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.date}</TableCell>
                    <TableCell>{item.recipient ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(item.amount)}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate whitespace-normal">
                      {item.description ?? "-"}
                    </TableCell>
                    <TableCell>
                      {item.category ?? "-"}
                      {item.sub_category ? ` · ${item.sub_category}` : ""}
                    </TableCell>
                    <TableCell>
                      {item.photos && item.photos.length > 0 ? (
                        <div className="flex gap-1.5">
                          {item.photos.map((photo) =>
                            photo.signedUrl ? (
                              <button
                                key={photo.path}
                                type="button"
                                onClick={() => setLightboxUrl(photo.signedUrl)}
                                aria-label="사진 크게 보기"
                                className="shrink-0"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photo.signedUrl}
                                  alt="대납 첨부 사진"
                                  className="h-12 w-12 rounded border object-cover"
                                />
                              </button>
                            ) : (
                              <span
                                key={photo.path}
                                title="사진을 불러오지 못했습니다"
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded border bg-muted"
                              >
                                <ImageOff className="size-4 text-muted-foreground" />
                              </span>
                            ),
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 사진 크게 보기 */}
      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="대납 첨부 사진"
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="닫기"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </main>
  );
}
