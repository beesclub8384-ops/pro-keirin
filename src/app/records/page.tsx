"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Lock, LockKeyhole, Paperclip, Plus, X } from "lucide-react";
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
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * 노동조합 문서 자료실 업로드 화면 (/records)
 *
 * - /vault(대납 입력)와 같은 방식이다. 비밀번호는 React state로만 들고 있고
 *   localStorage/쿠키에 저장하지 않는다. 새로고침하면 다시 입력해야 한다.
 * - records 테이블에는 anon 키로 접근할 수 없다(RLS 정책 0개). 저장은 반드시
 *   /api/records(service role)를 거친다.
 *
 * ⚠️ 첨부 전송만 vault와 다르다.
 *   vault는 사진을 base64로 API에 실어 보내지만 Vercel 요청 본문 상한이 4.5MB라
 *   50MB 문서는 그 방식으로 보낼 수 없다. 그래서 서버에서 서명 업로드 URL만 받고
 *   파일 자체는 브라우저 → Supabase Storage로 직접 올린다.
 *   (supabaseBrowser는 anon 키지만, 서명 토큰이 그 경로 한 곳의 업로드만 허용한다)
 *
 * 이번 단계는 "올리기"만이다. 목록/검색/열람은 다음 단계에서 만든다.
 */

/** ⚠️ src/app/api/records/route.ts 의 CATEGORIES 와 반드시 동일하게 유지할 것 */
const CATEGORIES = ["회의록", "발송공문", "수신공문", "기타"] as const;

/** 문서 첨부 비공개 버킷 — route.ts BUCKET 과 동일 */
const BUCKET = "records-files";

/** 문서 1건당 첨부 최대 개수 — route.ts MAX_FILES 와 동일하게 유지할 것 */
const MAX_FILES = 20;

/** 파일 1개당 상한 (50MB) — route.ts MAX_FILE_BYTES / 버킷 설정과 동일 */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** ⚠️ route.ts 의 ALLOWED_EXT 와 반드시 동일하게 유지할 것 */
const ALLOWED_EXT = [
  "hwp",
  "hwpx",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
] as const;

/** 파일 선택 창에 보여줄 필터 (확장자 검사는 위 ALLOWED_EXT가 담당) */
const FILE_ACCEPT = ALLOWED_EXT.map((e) => `.${e}`).join(",") + ",image/*";

/** 저장 전 화면에 들고 있는 첨부 1개 */
interface PendingFile {
  /** 목록에서 지우기 위한 화면용 키 */
  id: string;
  file: File;
}

function extOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0 || idx === filename.length - 1) return "";
  return filename.slice(idx + 1).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function RecordsPage() {
  // --- 인증 상태 ---
  const [passwordInput, setPasswordInput] = useState("");
  const [password, setPassword] = useState<string | null>(null); // 인증 성공한 비밀번호
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // --- 입력 폼 상태 ---
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [docDate, setDocDate] = useState("");
  const [counterpart, setCounterpart] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  /** 업로드 진행 표시 — 총 개수가 0이면 표시하지 않는다 */
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 비밀번호 확인 */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput) {
      setAuthError("비밀번호를 입력해주세요");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auth", password: passwordInput }),
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
    } catch {
      setAuthError("서버에 연결하지 못했습니다");
    } finally {
      setAuthLoading(false);
    }
  }

  /** 폼을 비운다 (저장 성공 후) */
  function resetForm() {
    setCategory("");
    setTitle("");
    setDocDate("");
    setCounterpart("");
    setDocNumber("");
    setMemo("");
    setFiles([]);
    setFormError("");
  }

  /** 잠그기 — 비밀번호와 입력 중인 내용을 메모리에서 비운다 */
  function handleLock() {
    resetForm();
    setPassword(null);
    setFormSuccess("");
  }

  /** 파일 선택 — 확장자/크기/개수를 여기서 먼저 거른다 */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    // 같은 파일을 다시 고를 수 있도록 input 값을 비운다
    e.target.value = "";
    if (selected.length === 0) return;

    setFormError("");
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      setFormError(`첨부는 최대 ${MAX_FILES}개까지 올릴 수 있습니다`);
      return;
    }

    const added: PendingFile[] = [];
    const rejected: string[] = [];
    for (const file of selected.slice(0, remaining)) {
      if (!ALLOWED_EXT.includes(extOf(file.name) as (typeof ALLOWED_EXT)[number])) {
        rejected.push(`${file.name} (지원하지 않는 형식)`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(
          `${file.name} (${formatBytes(file.size)} — ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 초과)`,
        );
        continue;
      }
      if (file.size === 0) {
        rejected.push(`${file.name} (빈 파일)`);
        continue;
      }
      added.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
      });
    }

    if (selected.length > remaining) {
      rejected.push(`앞의 ${remaining}개만 추가했습니다 (최대 ${MAX_FILES}개)`);
    }
    if (rejected.length > 0) setFormError(rejected.join(" / "));
    if (added.length > 0) setFiles((prev) => [...prev, ...added]);
  }

  /** 대기 중인 첨부 1개 제거 */
  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  /**
   * 저장에 실패해 쓸모없어진 첨부를 버킷에서 지운다.
   * 실패해도 사용자에게 알리지 않는다 — 저장 실패 메시지 위에 겹쳐 봐야 혼란만 준다.
   */
  async function discardUploaded(pw: string, paths: string[]) {
    if (paths.length === 0) return;
    try {
      await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard", password: pw, file_paths: paths }),
      });
    } catch {
      // 정리 실패는 조용히 넘긴다 (고아 파일만 남는다)
    }
  }

  /**
   * 문서 저장 — 첨부를 먼저 Storage에 올려 경로를 확보하고, 그 경로들과 함께 등록한다.
   * 도중에 실패하면 이미 올라간 첨부를 되돌려 지운다(고아 파일 방지).
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;

    setFormError("");
    setFormSuccess("");

    if (!category) return setFormError("분류를 선택해주세요");
    if (!title.trim()) return setFormError("문서 제목을 입력해주세요");

    setSaving(true);
    const uploadedPaths: string[] = [];
    // 원본 파일명(한글 그대로). uploadedPaths 와 순서 1:1 — Storage 경로는 ASCII만 허용해서
    // 경로에 원본 이름을 담을 수 없다. 이름은 records.file_names 로 따로 저장한다.
    const uploadedNames: string[] = [];
    try {
      // 1) 첨부 업로드 → Storage 경로 확보
      if (files.length > 0) {
        setProgress({ done: 0, total: files.length });
        for (const [index, pending] of files.entries()) {
          // 1-1) 서버에서 서명 업로드 URL 발급 (여기서 확장자·크기를 서버가 다시 검사한다)
          const signRes = await fetch("/api/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sign-upload",
              password,
              filename: pending.file.name,
              size: pending.file.size,
            }),
          });
          const signJson = await signRes.json();
          if (!signRes.ok || !signJson?.path || !signJson?.token) {
            setFormError(
              signJson?.error ??
                `"${pending.file.name}" 업로드 준비에 실패했습니다`,
            );
            await discardUploaded(password, uploadedPaths);
            return;
          }

          // 1-2) 브라우저 → Storage 직접 업로드 (Vercel 4.5MB 본문 상한을 우회한다)
          const { error: upErr } = await supabaseBrowser.storage
            .from(BUCKET)
            .uploadToSignedUrl(signJson.path, signJson.token, pending.file, {
              contentType: pending.file.type || "application/octet-stream",
            });
          if (upErr) {
            setFormError(
              `"${pending.file.name}" 업로드에 실패했습니다: ${upErr.message}`,
            );
            await discardUploaded(password, uploadedPaths);
            return;
          }

          uploadedPaths.push(signJson.path);
          // 서버가 다듬어 돌려준 이름을 쓴다. 응답이 없으면(구버전 서버) 원본 이름 그대로.
          uploadedNames.push(
            typeof signJson.name === "string" && signJson.name
              ? signJson.name
              : pending.file.name,
          );
          setProgress({ done: index + 1, total: files.length });
        }
      }

      // 2) 문서 등록
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          password,
          category,
          title: title.trim(),
          doc_date: docDate || null,
          counterpart: counterpart.trim(),
          doc_number: docNumber.trim(),
          memo: memo.trim(),
          file_paths: uploadedPaths,
          file_names: uploadedNames,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json?.error ?? "저장에 실패했습니다");
        // create가 실패하면 서버가 이미 첨부를 지운다. 중복 삭제를 피해 여기서는 두 번 지우지 않는다.
        return;
      }

      resetForm();
      setFormSuccess("저장되었습니다");
    } catch {
      setFormError("서버에 연결하지 못했습니다");
      await discardUploaded(password, uploadedPaths);
    } finally {
      setProgress({ done: 0, total: 0 });
      setSaving(false);
    }
  }

  /** 저장 성공 메시지는 4초 뒤 자동으로 지운다 */
  useEffect(() => {
    if (!formSuccess) return;
    const timer = setTimeout(() => setFormSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [formSuccess]);

  // ---------------------------------------------------------------- 비밀번호 화면
  if (!password) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyhole className="size-5" />
              노조 문서 자료실
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              비밀번호를 입력하면 문서 올리기 화면이 열립니다.
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
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full text-base"
                disabled={authLoading}
              >
                {authLoading ? "확인 중..." : "들어가기"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ---------------------------------------------------------------- 업로드 화면
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">문서 올리기</h1>
        <Button variant="outline" size="sm" onClick={handleLock}>
          <Lock className="size-4" />
          잠그기
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />새 문서 등록
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                분류 <span className="text-destructive">*</span>
              </span>
              <Select value={category} onValueChange={setCategory}>
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="records-title" className="text-sm font-medium">
                문서 제목 <span className="text-destructive">*</span>
              </label>
              <Input
                id="records-title"
                type="text"
                placeholder="예) 2026년 3월 정기 대의원회의록"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="records-date" className="text-sm font-medium">
                문서 날짜
              </label>
              <Input
                id="records-date"
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="h-12 text-base"
              />
              <p className="text-xs text-muted-foreground">
                날짜를 모르면 비워두어도 됩니다.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="records-counterpart" className="text-sm font-medium">
                상대처(발송처/수신처)
              </label>
              <Input
                id="records-counterpart"
                type="text"
                placeholder="예) 국민체육진흥공단"
                value={counterpart}
                onChange={(e) => setCounterpart(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="records-docnumber" className="text-sm font-medium">
                문서번호
              </label>
              <Input
                id="records-docnumber"
                type="text"
                placeholder="예) 프로노조-2026-001"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="records-memo" className="text-sm font-medium">
                메모(검색용)
              </label>
              {/* shadcn textarea 컴포넌트가 없어 Input과 같은 스타일을 직접 맞춘다 */}
              <textarea
                id="records-memo"
                rows={4}
                placeholder="나중에 찾을 때 쓸 키워드나 요약을 자유롭게 적어주세요"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              />
            </div>

            {/* 첨부 파일 */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                첨부 파일{" "}
                <span className="font-normal text-muted-foreground">
                  {files.length}/{MAX_FILES}
                </span>
              </span>

              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
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
                disabled={files.length >= MAX_FILES || saving}
              >
                <Paperclip className="size-4" />
                {files.length >= MAX_FILES
                  ? `첨부 ${MAX_FILES}개 선택됨`
                  : "파일 선택"}
              </Button>
              <p className="text-xs text-muted-foreground">
                한글(hwp/hwpx) · PDF · 워드 · 엑셀 · 이미지, 파일당 최대{" "}
                {Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB
              </p>

              {files.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 break-all text-sm">
                        {f.file.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatBytes(f.file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        aria-label={`${f.file.name} 첨부 제거`}
                        disabled={saving}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-white text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {formError && (
              <p className="text-sm font-medium text-destructive">{formError}</p>
            )}
            {formSuccess && (
              <p className="text-sm font-medium text-emerald-600">{formSuccess}</p>
            )}

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full text-base"
              disabled={saving}
            >
              <Plus className="size-4" />
              {progress.total > 0
                ? `첨부 업로드 중... (${progress.done}/${progress.total})`
                : saving
                  ? "저장 중..."
                  : "저장"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
