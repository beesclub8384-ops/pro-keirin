import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

/**
 * 사무국장 전용 대납(daenap) API — 비밀번호 인증 후 조회/등록/수정/삭제/사진 업로드.
 *
 * - 대납 데이터는 민감정보이므로 브라우저에서 Supabase에 직접 접근하지 않는다.
 *   반드시 이 라우트(service role key, RLS 우회)를 거친다.
 * - daenap-photos 버킷은 비공개(public: false)라 조회 시 서명 URL을 발급해 내려준다.
 * - 수정/삭제로 참조가 끊긴 사진 파일은 버킷에서도 지운다(고아 파일 방지).
 * - 모든 요청은 POST { action, password, ...data } 형태.
 */

/**
 * ⚠️ src/app/vault/page.tsx 의 CATEGORIES / SUB_CATEGORIES 와 반드시 동일하게 유지할 것.
 * 한쪽만 바뀌면 화면에서는 선택되는데 서버가 400으로 거부하는 무음 실패가 발생한다.
 */
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

/** 세부분류는 이 성격분류를 선택했을 때만 사용한다 */
const SUB_CATEGORY_PARENT = "임원 및 대의원 지출";

const SUB_CATEGORIES = ["교통비", "식대", "숙박비", "음료·다과"] as const;

/** 대납 사진 비공개 버킷 */
const BUCKET = "daenap-photos";

/** 대납 1건당 사진 최대 장수 */
const MAX_PHOTOS = 2;

/** 서명 URL 유효기간 (초) — 1시간 */
const SIGNED_URL_TTL = 60 * 60;

/** 버킷에 설정된 허용 MIME과 동일하게 유지할 것 */
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * 업로드 1장당 원본 크기 상한 (3MB).
 * 버킷 자체 상한은 10MB지만, base64로 실어 보내면 용량이 약 1.33배로 늘고
 * Vercel 서버리스 함수의 요청 본문 상한(4.5MB)에 먼저 걸린다.
 * 그 경우 이 핸들러에 도달하지도 못한 채 정체불명의 413이 뜨므로,
 * 그보다 낮은 값에서 우리가 먼저 한국어 400으로 막는다.
 * (화면에서 긴 변 1600px로 리사이즈하므로 실제로는 보통 1MB 미만이다.)
 */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** PostgREST 기본 limit(1000) 회피용 페이지 크기 */
const PAGE_SIZE = 1000;

interface VaultBody {
  action?: string;
  password?: string;
  // update / delete 전용 — daenap.id (bigint)
  id?: number | string;
  date?: string;
  recipient?: string;
  amount?: number | string;
  description?: string;
  category?: string;
  sub_category?: string | null;
  photo_urls?: unknown;
  // upload 전용
  contentType?: string;
  data?: string;
}

interface DaenapRow {
  id: string | number;
  date: string;
  recipient: string | null;
  amount: number | null;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  photo_urls: string[] | null;
  created_at: string | null;
}

/** 목록 응답에 실어 보내는 사진 한 장 */
interface DaenapPhoto {
  /** Storage 경로 — 저장/재발급용 */
  path: string;
  /** 서명 URL — 화면 표시용. 발급 실패 시 null */
  signedUrl: string | null;
}

const SELECT_COLUMNS =
  "id, date, recipient, amount, description, category, sub_category, photo_urls, created_at";

/**
 * YYYY-MM-DD 이면서 실제로 존재하는 날짜인지 확인한다.
 * 형식만 검사하면 2026-13-99 같은 값이 통과해 Postgres date 캐스팅에서 터지고,
 * 사용자에게는 400 대신 500으로 보인다.
 */
function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  return "bin";
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as VaultBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  // 1) 비밀번호 검증 — 어떤 action이든 이 관문을 먼저 통과해야 한다
  const expected = process.env.VAULT_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "서버에 비밀번호(VAULT_PASSWORD)가 설정되지 않았습니다" },
      { status: 500 },
    );
  }
  if (!body.password || body.password !== expected) {
    return NextResponse.json(
      { error: "비밀번호가 틀렸습니다" },
      { status: 401 },
    );
  }

  // 2) action 분기
  try {
    switch (body.action) {
      case "list":
        return await listDaenap();
      case "create":
        return await createDaenap(body);
      case "update":
        return await updateDaenap(body);
      case "delete":
        return await deleteDaenap(body);
      case "upload":
        return await uploadPhoto(body);
      default:
        return NextResponse.json(
          { error: `알 수 없는 action 입니다: ${body.action ?? "(없음)"}` },
          { status: 400 },
        );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `서버 오류가 발생했습니다: ${message}` },
      { status: 500 },
    );
  }
}

/**
 * daenap 전체를 날짜 내림차순으로 조회 (1000행 제한 회피용 페이지네이션).
 * 각 행의 photo_urls(Storage 경로)는 서명 URL로 변환해 photos 필드로 함께 내려준다.
 */
async function listDaenap() {
  const sb = createAdminClient();
  const rows: DaenapRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from("daenap")
      .select(SELECT_COLUMNS)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { error: `대납 목록을 불러오지 못했습니다: ${error.message}` },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as unknown as DaenapRow[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // 비공개 버킷이라 서명 URL이 없으면 브라우저에서 이미지가 보이지 않는다.
  // 전체 경로를 한 번에 모아 배치로 발급한다.
  const allPaths = [
    ...new Set(
      rows.flatMap((r) =>
        Array.isArray(r.photo_urls)
          ? r.photo_urls.filter((p): p is string => typeof p === "string" && p.length > 0)
          : [],
      ),
    ),
  ];

  const signedByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const { data: signed, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(allPaths, SIGNED_URL_TTL);
    // 서명 URL 발급 실패가 목록 조회 전체를 막지는 않게 한다.
    // (사진만 안 보이고 대납 내역은 정상 표시)
    if (!signErr && signed) {
      for (const s of signed) {
        if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
      }
    }
  }

  const items = rows.map((row) => {
    const paths = Array.isArray(row.photo_urls)
      ? row.photo_urls.filter((p): p is string => typeof p === "string" && p.length > 0)
      : [];
    const photos: DaenapPhoto[] = paths.map((p) => ({
      path: p,
      signedUrl: signedByPath.get(p) ?? null,
    }));
    return { ...row, photos };
  });

  return NextResponse.json({ items, count: items.length });
}

/** photo_urls 입력값 검증 — 문자열 배열, 최대 MAX_PHOTOS개 */
function parsePhotoUrls(
  raw: unknown,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "사진 목록 형식이 올바르지 않습니다" };
  }
  const paths: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item.trim()) {
      return { ok: false, error: "사진 경로 형식이 올바르지 않습니다" };
    }
    paths.push(item.trim());
  }
  if (paths.length > MAX_PHOTOS) {
    return { ok: false, error: `사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다` };
  }
  return { ok: true, value: paths };
}

/** daenap.id(bigint) 파싱 — 양의 정수만 통과시킨다 */
function parseDaenapId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  return null;
}

/** 검증을 통과한 대납 입력값 — 그대로 insert/update에 넣는다 */
interface DaenapFields {
  date: string;
  recipient: string;
  amount: number;
  description: string | null;
  category: string;
  sub_category: string | null;
  photo_urls: string[];
}

/**
 * 등록/수정 공통 입력 검증.
 *
 * create와 update가 각자 검증을 들고 있으면 한쪽만 고쳤을 때
 * "등록은 막히는데 수정으로는 들어가는" 무음 실패가 생긴다. 반드시 여기 한 곳만 고칠 것.
 */
function validateDaenapFields(
  body: VaultBody,
): { ok: true; value: DaenapFields } | { ok: false; error: string } {
  const date = (body.date ?? "").trim();
  const recipient = (body.recipient ?? "").trim();
  const description = (body.description ?? "").trim();
  const category = (body.category ?? "").trim();
  const subCategoryRaw = (body.sub_category ?? "").toString().trim();

  if (!isValidDateString(date)) {
    return {
      ok: false,
      error: "날짜를 실제 존재하는 YYYY-MM-DD 형식으로 입력해주세요",
    };
  }
  if (!recipient) {
    return { ok: false, error: "누구에게 지급했는지 입력해주세요" };
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "금액은 0 이상의 숫자로 입력해주세요" };
  }

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return { ok: false, error: "성격분류를 목록에서 선택해주세요" };
  }

  // 세부분류는 '임원 및 대의원 지출'일 때만 저장. 그 외에는 값이 와도 무시(null)한다.
  let subCategory: string | null = null;
  if (category === SUB_CATEGORY_PARENT && subCategoryRaw) {
    if (!SUB_CATEGORIES.includes(subCategoryRaw as (typeof SUB_CATEGORIES)[number])) {
      return { ok: false, error: "세부분류를 목록에서 선택해주세요" };
    }
    subCategory = subCategoryRaw;
  }

  const photos = parsePhotoUrls(body.photo_urls);
  if (!photos.ok) {
    return { ok: false, error: photos.error };
  }

  return {
    ok: true,
    value: {
      date,
      recipient,
      amount,
      description: description || null,
      category,
      sub_category: subCategory,
      // photo_urls는 NOT NULL(default '{}')이라 null을 명시하면 삽입이 거부된다.
      // 사진이 없으면 빈 배열을 넣는다.
      photo_urls: photos.value,
    },
  };
}

/**
 * 버킷에서 사진 파일을 지운다.
 *
 * 실패해도 예외를 던지지 않는다. DB 행은 이미 처리된 뒤라서
 * 여기서 500을 내면 "삭제가 실패한 줄 알고 다시 눌렀는데 이미 없다"는 혼란만 준다.
 * 남은 고아 파일은 조용히 로그로만 남긴다.
 */
async function removePhotoFiles(sb: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await sb.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error("[vault] 사진 파일 삭제 실패:", error.message, paths);
  }
}

/** 특정 대납의 현재 사진 경로를 읽는다. 행이 없으면 null */
async function readPhotoPaths(
  sb: SupabaseClient,
  id: number,
): Promise<{ found: boolean; paths: string[]; error?: string }> {
  const { data, error } = await sb
    .from("daenap")
    .select("photo_urls")
    .eq("id", id)
    .maybeSingle();

  if (error) return { found: false, paths: [], error: error.message };
  if (!data) return { found: false, paths: [] };

  const raw = (data as { photo_urls: string[] | null }).photo_urls;
  const paths = Array.isArray(raw)
    ? raw.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  return { found: true, paths };
}

/** 대납 1건 등록 */
async function createDaenap(body: VaultBody) {
  const fields = validateDaenapFields(body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("daenap")
    .insert(fields.value)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json(
      { error: `대납 저장에 실패했습니다: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ item: data as unknown as DaenapRow });
}

/**
 * 대납 1건 수정.
 * 이번 수정으로 빠진 사진은 버킷에서도 지운다(고아 파일 방지).
 */
async function updateDaenap(body: VaultBody) {
  const id = parseDaenapId(body.id);
  if (id === null) {
    return NextResponse.json(
      { error: "수정할 대납을 지정하지 못했습니다" },
      { status: 400 },
    );
  }

  const fields = validateDaenapFields(body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const sb = createAdminClient();

  // 수정 전 사진 경로를 미리 읽어둔다. update 후에는 어떤 사진이 빠졌는지 알 수 없다.
  const before = await readPhotoPaths(sb, id);
  if (before.error) {
    return NextResponse.json(
      { error: `대납을 불러오지 못했습니다: ${before.error}` },
      { status: 500 },
    );
  }
  if (!before.found) {
    return NextResponse.json(
      { error: "수정할 대납을 찾을 수 없습니다. 목록을 새로고침해주세요" },
      { status: 404 },
    );
  }

  const { data, error } = await sb
    .from("daenap")
    .update(fields.value)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json(
      { error: `대납 수정에 실패했습니다: ${error.message}` },
      { status: 500 },
    );
  }

  // DB 수정이 성공한 뒤에만 파일을 지운다. 순서를 바꾸면 수정 실패 시 사진만 사라진다.
  const keep = new Set(fields.value.photo_urls);
  await removePhotoFiles(
    sb,
    before.paths.filter((p) => !keep.has(p)),
  );

  return NextResponse.json({ item: data as unknown as DaenapRow });
}

/**
 * 대납 1건 삭제 — 첨부 사진 파일도 함께 지운다.
 * 되돌릴 수 없으므로 확인은 화면(window.confirm)에서 이미 받은 뒤에 호출된다.
 */
async function deleteDaenap(body: VaultBody) {
  const id = parseDaenapId(body.id);
  if (id === null) {
    return NextResponse.json(
      { error: "삭제할 대납을 지정하지 못했습니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  // 행을 지우면 photo_urls도 같이 사라지므로 삭제 전에 경로를 확보해둔다.
  const before = await readPhotoPaths(sb, id);
  if (before.error) {
    return NextResponse.json(
      { error: `대납을 불러오지 못했습니다: ${before.error}` },
      { status: 500 },
    );
  }
  if (!before.found) {
    return NextResponse.json(
      { error: "삭제할 대납을 찾을 수 없습니다. 목록을 새로고침해주세요" },
      { status: 404 },
    );
  }

  const { error } = await sb.from("daenap").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `대납 삭제에 실패했습니다: ${error.message}` },
      { status: 500 },
    );
  }

  await removePhotoFiles(sb, before.paths);

  return NextResponse.json({ ok: true, id, deletedPhotos: before.paths.length });
}

/**
 * 사진 1장을 daenap-photos 버킷에 업로드하고 Storage 경로를 돌려준다.
 * 경로는 {연도}/{타임스탬프}-{랜덤}.{확장자} 형식.
 */
async function uploadPhoto(body: VaultBody) {
  const contentType = (body.contentType ?? "").trim().toLowerCase();
  const base64 = typeof body.data === "string" ? body.data : "";

  if (!ALLOWED_MIME.includes(contentType as (typeof ALLOWED_MIME)[number])) {
    return NextResponse.json(
      { error: "JPG, PNG, WEBP, HEIC 이미지만 첨부할 수 있습니다" },
      { status: 400 },
    );
  }
  if (!base64) {
    return NextResponse.json(
      { error: "사진 데이터가 비어 있습니다" },
      { status: 400 },
    );
  }

  let buffer: Buffer;
  try {
    // data URL 접두사가 붙어 와도 받아들인다
    const commaIdx = base64.indexOf(",");
    const pure = base64.startsWith("data:") && commaIdx >= 0 ? base64.slice(commaIdx + 1) : base64;
    buffer = Buffer.from(pure, "base64");
  } catch {
    return NextResponse.json(
      { error: "사진 데이터를 읽지 못했습니다" },
      { status: 400 },
    );
  }

  if (buffer.length === 0) {
    return NextResponse.json(
      { error: "사진 데이터를 읽지 못했습니다" },
      { status: 400 },
    );
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `사진 용량이 너무 큽니다 (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하). 다시 촬영하거나 크기를 줄여주세요`,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const random = Math.random().toString(36).slice(2, 10);
  const path = `${year}/${now.getTime()}-${random}.${extFromMime(contentType)}`;

  const sb = createAdminClient();
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });

  if (upErr) {
    return NextResponse.json(
      { error: `사진 업로드에 실패했습니다: ${upErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ path });
}
