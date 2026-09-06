"use client";

import { use, useEffect, useRef, useState } from "react";
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
  ImagePlus,
  Trash2,
} from "lucide-react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pickArticleBody } from "@/lib/article-body";
import { compressImage } from "@/lib/image-compress";
import PhotoLightbox from "@/components/PhotoLightbox";
import { resolveArticlePhotos } from "@/lib/interview-photos";
import { supabaseBrowser } from "@/lib/supabase-browser";

/** 사진 버킷 — api/interview/admin/article-photos 가 서명 URL을 발급하는 그 버킷 */
const PHOTO_BUCKET = "interview-photos";

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

/**
 * 편집 시작 시점의 사진 배열을 정한다.
 *
 * ⚠️ 팬 화면(src/lib/interview.ts, api/interview/published)과 **같은 함수**를 쓴다.
 *   예전에는 여기만 `photos.length > 0` 로 판단해, 관리자가 사진을 전부 지워도
 *   빈 배열이 무시되고 응답 사진이 되살아났다.
 */
function collectPhotos(article: Article, responses: ResponseRow[]): string[] {
  const fallback: string[] = [];
  for (const r of responses) {
    if (r.photoUrls) {
      for (const u of r.photoUrls) {
        if (u) fallback.push(u);
      }
    }
  }
  return resolveArticlePhotos(article.photos, fallback);
}

/**
 * n번 사진을 지운 뒤 본문의 [PHOTO_*] 태그를 배열에 다시 맞춘다.
 *
 * 1) [PHOTO_n]        → 제거
 * 2) [PHOTO_m] (m>n)  → [PHOTO_{m-1}]
 *
 * ⚠️ 순서가 중요하다. 배열에서 원소가 빠지면 뒤 인덱스가 하나씩 당겨지는데,
 *   본문 태그를 같이 당기지 않으면 사진과 번호가 통째로 어긋난다.
 *   예) 3장 중 2번 삭제 → photos=[1,3] 이 되므로 본문의 [PHOTO_3] 은
 *       [PHOTO_2] 로 바뀌어야 원래 3번 사진을 계속 가리킨다.
 *   제거를 먼저 하고 번호를 당겨야 한다. 순서를 바꾸면 [PHOTO_3]→[PHOTO_2] 가
 *   먼저 일어나 방금 지우려던 2번과 충돌한다.
 */
function removePhotoTag(article: string, n: number): string {
  const withoutTag = article.replace(
    new RegExp(`\\[PHOTO_${n}\\]`, "g"),
    "",
  );
  const renumbered = withoutTag.replace(/\[PHOTO_(\d+)\]/g, (match, num) => {
    const m = parseInt(num, 10);
    return m > n ? `[PHOTO_${m - 1}]` : match;
  });
  // 태그가 빠진 자리에 남은 빈 줄 정리
  return renumbered.replace(/[ \t]*\n{3,}/g, "\n\n").trimEnd();
}

/**
 * 본문의 지정 위치(커서)에 [PHOTO_n] 태그를 끼워 넣는다.
 *
 * ⚠️ 중간에 끼워 넣어도 **재번호는 필요 없다.**
 *   태그 번호는 photos 배열의 인덱스에서 나오고(replacePhotoTags 는 [PHOTO_n] 을
 *   photos[n-1] 로 치환한다), 본문 안에서 태그가 몇 번째로 등장하는지는 보지 않는다.
 *   그래서 [PHOTO_3] 을 문서 맨 앞에 둬도 여전히 3번 사진을 가리킨다.
 *   재번호가 필요한 경우는 배열에서 원소가 빠질 때뿐이다 (removePhotoTag 참고).
 *
 * @param at 삽입 위치. null 이거나 범위를 벗어나면 본문 끝에 붙인다(폴백).
 * @returns 새 본문과, 삽입한 태그 바로 뒤 위치(다음 장을 이어 붙일 지점)
 */
function insertPhotoTag(
  article: string,
  tag: string,
  at: number | null,
): { text: string; caret: number } {
  if (at === null || at < 0 || at > article.length) {
    const head = article.trimEnd();
    const text = head ? `${head}\n\n${tag}` : tag;
    return { text, caret: text.length };
  }
  // 삽입 지점 앞뒤의 공백/빈 줄을 걷어낸 뒤 빈 줄 하나씩만 다시 넣는다.
  // 그냥 "\n\n" 를 양쪽에 붙이면 이미 빈 줄인 자리에서 빈 줄이 겹친다.
  const before = article.slice(0, at).replace(/\s+$/, "");
  const after = article.slice(at).replace(/^\s+/, "");
  const upToTag = (before ? `${before}\n\n` : "") + tag;
  return {
    text: after ? `${upToTag}\n\n${after}` : upToTag,
    caret: upToTag.length,
  };
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
  /**
   * 편집 중인 사진 배열. 인덱스 i 가 본문의 [PHOTO_{i+1}] 에 대응한다.
   * 저장 버튼을 눌러야 photos 컬럼에 반영된다 (아래 handleSave).
   */
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** 라이트박스로 크게 볼 사진의 인덱스. null 이면 닫힌 상태 */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 본문 textarea 의 마지막 커서 위치.
   * ⚠️ state 가 아니라 ref 다. 파일 선택 다이얼로그가 뜨면 textarea 에서 포커스가
   *   빠져 selectionStart 를 그때 읽을 수 없으므로, 커서가 움직일 때마다 기록해 둔다.
   */
  const cursorRef = useRef<number | null>(null);
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
        setPhotos(collectPhotos(json.article, json.responses));
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

  /**
   * 사진 추가 — /records 와 같은 서명 URL 직행 방식.
   *   1) 서버에서 서명 업로드 URL 발급 (관리자 인증 + 크기 1차 검사)
   *   2) 브라우저 → Storage 직접 업로드 (Vercel 4.5MB 본문 상한을 우회한다)
   *   3) photos 끝에 붙이고 **커서 위치**에 [PHOTO_n] 삽입
   *      (커서 기록이 없으면 본문 끝 — insertPhotoTag 의 폴백)
   *      여러 장을 한 번에 고르면 같은 자리에 순서대로 이어 붙는다.
   *
   * ⚠️ 여기서 올린 파일은 Storage 에 이미 존재한다. 저장하지 않고 화면을 떠나면
   *   DB 에서 참조되지 않는 고아 파일이 남는다. 이번 범위에서는 허용한다
   *   (정리하려면 /records 의 discard 액션 같은 회수 경로가 따로 필요하다).
   */
  async function handleAddPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const next = [...photos];
      let nextBody = body;
      // 기록된 커서 위치에서 시작해, 한 장 넣을 때마다 그 뒤로 밀어 이어 붙인다
      let insertAt = cursorRef.current;

      for (const file of Array.from(files)) {
        const upload = await compressImage(file);
        // ⚠️ 서명 URL 직행에는 서버 sharp 폴백이 없다. 브라우저가 JPEG 로 바꾸지
        //    못한 원본(HEIC 등)을 그대로 올리면 화면에 alt 텍스트만 남는다.
        if (upload.type !== "image/jpeg") {
          setPhotoError(
            `"${file.name}" 은 브라우저가 열지 못하는 형식입니다. JPEG나 PNG로 저장해 다시 올려주세요`,
          );
          break;
        }

        const signRes = await fetch("/api/interview/admin/article-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: Number(articleId),
            fileName: upload.name,
            fileSize: upload.size,
          }),
        });
        const signJson = await signRes.json().catch(() => null);
        if (!signRes.ok || !signJson?.path || !signJson?.token) {
          setPhotoError(
            signJson?.error ?? `"${file.name}" 업로드 준비에 실패했습니다`,
          );
          break;
        }

        const { error: upErr } = await supabaseBrowser.storage
          .from(PHOTO_BUCKET)
          .uploadToSignedUrl(signJson.path, signJson.token, upload, {
            contentType: "image/jpeg",
          });
        if (upErr) {
          setPhotoError(`"${file.name}" 업로드에 실패했습니다: ${upErr.message}`);
          break;
        }

        next.push(signJson.publicUrl as string);
        const inserted = insertPhotoTag(
          nextBody,
          `[PHOTO_${next.length}]`,
          insertAt,
        );
        nextBody = inserted.text;
        insertAt = inserted.caret;
      }

      setPhotos(next);
      setBody(nextBody);
      cursorRef.current = insertAt;

      // 삽입 지점으로 커서를 옮겨 준다 — 어디에 들어갔는지 바로 보이도록.
      // setBody 반영 뒤여야 하므로 다음 프레임에 실행한다. 실패해도 기능에는 영향 없음.
      const caret = insertAt;
      if (caret !== null) {
        requestAnimationFrame(() => {
          const el = bodyRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(caret, caret);
        });
      }
    } finally {
      setPhotoUploading(false);
    }
  }

  /**
   * 사진 삭제 — 배열에서 빼고 본문 태그도 함께 정리·재번호한다.
   * Storage 파일 자체는 지우지 않는다 (되돌리기 여지를 남긴다).
   */
  function handleRemovePhoto(idx: number) {
    setPhotoError(null);
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setBody((prev) => removePhotoTag(prev, idx + 1));
  }

  async function handleSave() {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/interview/admin/articles/${articleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline, articleEdited: body, photos }),
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

  /**
   * 미리보기 탭의 이미지 렌더러 — 본문 사진을 클릭하면 라이트박스가 열린다.
   *
   * ⚠️ 기준은 **편집 중인 photos state** 다 (저장 전 추가·삭제가 그대로 반영된다).
   *   미리보기가 replacePhotoTags(body, photos) 로 그려지므로 img 의 src 는
   *   photos 안의 URL 과 정확히 같고, indexOf 로 몇 번째 사진인지 찾을 수 있다.
   *   photos 에 없는 src(본문에 직접 쓴 외부 이미지 등)는 클릭 대상이 아니다.
   *
   * 편집 탭 썸네일과 같은 lightboxIndex 상태를 쓴다 — 넘기는 배열도 같은 photos 라
   * 인덱스 의미가 일치해서 따로 둘 이유가 없다.
   */
  const previewMdComponents: Components = {
    img: (props) => {
      const src = typeof props.src === "string" ? props.src : "";
      const idx = src ? photos.indexOf(src) : -1;
      const clickable = idx >= 0;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.src}
          alt={props.alt || ""}
          loading="lazy"
          decoding="async"
          onClick={clickable ? () => setLightboxIndex(idx) : undefined}
          className={clickable ? "cursor-zoom-in" : undefined}
        />
      );
    },
  };

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
                ref={bodyRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  cursorRef.current = e.target.selectionStart;
                }}
                // 커서가 움직일 때마다 위치를 기록해 둔다 (클릭·키보드 이동·선택 모두
                // onSelect 로 들어온다). 사진 추가 시 이 위치에 [PHOTO_n] 을 끼워 넣는다.
                onSelect={(e) => {
                  cursorRef.current = e.currentTarget.selectionStart;
                }}
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

            {/* 사진 관리 — 번호가 본문의 [PHOTO_n] 과 1:1로 대응한다 */}
            <div className="border-t border-border pt-5">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  사진 ({photos.length}장) — 번호가 본문 [PHOTO_n] 과 대응합니다
                </label>
                <label
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-muted ${
                    photoUploading ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  {photoUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  사진 추가
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={photoUploading}
                    onChange={(e) => {
                      handleAddPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {photoError && (
                <p className="mb-2 text-xs font-medium text-red-500">
                  {photoError}
                </p>
              )}

              {photos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  등록된 사진이 없습니다
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {photos.map((url, i) => (
                    <div
                      key={`${url}-${i}`}
                      className="relative h-24 w-24 overflow-hidden rounded-lg border border-border"
                    >
                      {/* 클릭하면 원본을 라이트박스로 크게 본다 */}
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        title={`${i + 1}번 사진 크게 보기`}
                        className="block h-full w-full cursor-zoom-in"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`사진 ${i + 1}`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        // 삭제 버튼은 크게보기 버튼의 형제라 중첩되지 않지만,
                        // 나중에 구조가 바뀌어도 라이트박스가 열리지 않도록 전파를 끊는다
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto(i);
                        }}
                        title={`${i + 1}번 사진 삭제`}
                        className="absolute right-1 top-1 rounded-full bg-red-600/85 p-1 text-white transition-colors hover:bg-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                업로드는 즉시 되지만 DB 반영은 [저장]을 눌러야 합니다. 삭제하면
                본문의 태그도 자동으로 정리·재번호됩니다.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="prose prose-sm max-w-none px-5 py-7 sm:px-8 sm:py-9">
            {headline && (
              <h1 className="mb-6 text-2xl font-extrabold">{headline}</h1>
            )}
            {/* 편집 중인 photos 를 쓴다 — 저장 전에도 추가·삭제 결과가 보여야 한다 */}
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={previewMdComponents}
            >
              {replacePhotoTags(body, photos)}
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

      {/* 원본 사진 확대 보기 — 팀 소개·륜슐랭과 같은 공용 컴포넌트 */}
      {lightboxIndex !== null && photos.length > 0 && (
        <PhotoLightbox
          photos={photos}
          startIndex={Math.min(lightboxIndex, photos.length - 1)}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
