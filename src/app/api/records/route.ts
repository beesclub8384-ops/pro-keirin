import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

/**
 * 노동조합 문서 자료실(/records) API — 비밀번호 인증 후 업로드 URL 발급 / 문서 등록.
 *
 * - /api/vault(대납)와 같은 구조다. 브라우저는 Supabase에 직접 접근하지 않고
 *   이 라우트(service role key, RLS 우회)를 거친다. records 테이블은 RLS 정책이 0개라
 *   anon 키로는 아무것도 읽고 쓸 수 없다.
 * - 모든 요청은 POST { action, password, ...data } 형태.
 *
 * ⚠️ 파일 전송만은 vault와 다르다.
 *   vault는 사진을 base64로 이 라우트에 실어 보내지만(3MB 상한), 여기는 문서라
 *   파일당 50MB를 받아야 한다. Vercel 서버리스 함수의 요청 본문 상한은 4.5MB라서
 *   base64 방식으로는 50MB를 절대 통과시킬 수 없다(핸들러에 도달하기도 전에 413).
 *   그래서 서버는 서명 업로드 URL만 발급하고(sign-upload), 실제 바이트는
 *   브라우저 → Supabase Storage로 직접 올린다. service role 키는 여전히 서버에만 있다.
 *
 * 이번 단계는 "올리기"만 구현한다. 목록/검색/열람은 다음 단계.
 */

/** ⚠️ src/app/records/page.tsx 의 CATEGORIES 와 반드시 동일하게 유지할 것 */
const CATEGORIES = ["회의록", "발송공문", "수신공문", "기타"] as const;

/** 문서 첨부 비공개 버킷 (마이그레이션에서 public: false, 50MB로 생성) */
const BUCKET = "records-files";

/** 문서 1건당 첨부 최대 개수 — page.tsx MAX_FILES 와 동일하게 유지할 것 */
const MAX_FILES = 20;

/**
 * 파일 1개당 상한 (50MB). 버킷 자체 상한(52428800)과 동일하게 맞춘다.
 * 서버가 여기서 먼저 막지 않으면 50MB를 다 올린 뒤에야 Storage가 거부해서
 * 사용자는 한참 기다린 끝에 영문 모를 에러를 본다.
 */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * 허용 확장자. MIME이 아니라 확장자로 거른다.
 * hwp는 브라우저·OS마다 application/x-hwp / application/haansofthwp / 빈 문자열로
 * 제각각 와서 MIME으로 막으면 정상 파일이 튕긴다.
 * ⚠️ page.tsx 의 ALLOWED_EXT 와 반드시 동일하게 유지할 것.
 */
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

/**
 * sign-upload가 발급하는 경로 형식.
 * create로 들어온 file_paths가 이 형식인지 확인해, 남의 경로나 엉뚱한 문자열이
 * DB에 들어가는 것을 막는다. 예) 2026/1755600000000-a1b2c3__회의록.pdf
 */
const PATH_PATTERN = /^\d{4}\/\d{10,}-[a-z0-9]{6,10}__[^/]{1,120}$/;

/** 첨부 존재 확인용 서명 URL의 짧은 유효기간 (초) */
const VERIFY_TTL = 60;

interface RecordsBody {
  action?: string;
  password?: string;
  // sign-upload 전용
  filename?: string;
  size?: number | string;
  // create 전용
  category?: string;
  title?: string;
  doc_date?: string | null;
  counterpart?: string | null;
  doc_number?: string | null;
  memo?: string | null;
  file_paths?: unknown;
}

interface RecordRow {
  id: string | number;
  category: string;
  title: string;
  doc_date: string | null;
  counterpart: string | null;
  doc_number: string | null;
  memo: string | null;
  file_paths: string[] | null;
  created_at: string | null;
}

const SELECT_COLUMNS =
  "id, category, title, doc_date, counterpart, doc_number, memo, file_paths, created_at";

/**
 * YYYY-MM-DD 이면서 실제로 존재하는 날짜인지 확인한다.
 * 형식만 검사하면 2026-13-99 같은 값이 통과해 Postgres date 캐스팅에서 터지고,
 * 사용자에게는 400 대신 500으로 보인다. (vault route.ts와 동일)
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

/** 파일명에서 확장자를 소문자로 뽑는다. 없으면 빈 문자열 */
function extOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0 || idx === filename.length - 1) return "";
  return filename.slice(idx + 1).toLowerCase();
}

/**
 * 원본 파일명을 Storage 키에 넣어도 안전한 형태로 다듬는다.
 *
 * records 테이블에는 파일명 컬럼이 없고 경로(file_paths)만 있다. 경로에 원본 이름을
 * 남겨두지 않으면 다음 단계(열람)에서 "무슨 파일인지" 표시할 방법이 사라진다.
 * 그래서 고유 접두사 뒤에 다듬은 원본 이름을 붙여 보관한다.
 */
function safeBaseName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const cleaned = base
    .replace(/[\\/]/g, "_")
    // 한글·영숫자·일부 기호만 남긴다. 공백/특수문자는 _ 로
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ._()-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
  return (cleaned || "문서").slice(0, 60);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RecordsBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  // 1) 비밀번호 검증 — 어떤 action이든 이 관문을 먼저 통과해야 한다
  const expected = process.env.RECORDS_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "서버에 비밀번호(RECORDS_PASSWORD)가 설정되지 않았습니다" },
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
      case "auth":
        // 비밀번호만 확인한다. 위 관문을 통과했다는 것 자체가 성공.
        return NextResponse.json({ ok: true });
      case "sign-upload":
        return await signUpload(body);
      case "discard":
        return await discardFiles(body);
      case "create":
        return await createRecord(body);
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
 * 첨부 1개를 올릴 서명 업로드 URL을 발급한다.
 * 경로는 {연도}/{타임스탬프}-{랜덤}__{원본이름}.{확장자} 형식이며, 유효기간은 2시간(Supabase 고정).
 */
async function signUpload(body: RecordsBody) {
  const filename = (body.filename ?? "").toString().trim();
  if (!filename) {
    return NextResponse.json(
      { error: "파일 이름이 비어 있습니다" },
      { status: 400 },
    );
  }

  const ext = extOf(filename);
  if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
    return NextResponse.json(
      {
        error:
          "한글(hwp/hwpx), PDF, 워드(doc/docx), 엑셀(xls/xlsx), 이미지 파일만 올릴 수 있습니다",
      },
      { status: 400 },
    );
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: "파일 크기를 확인하지 못했습니다" },
      { status: 400 },
    );
  }
  if (size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `파일 1개는 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB까지만 올릴 수 있습니다`,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  // padEnd로 길이를 8자로 고정한다. toString(36)이 짧게 나오는 드문 경우에
  // 경로가 PATH_PATTERN을 벗어나면 업로드는 성공하고 저장만 거부되는 꼴이 된다.
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  const path = `${now.getFullYear()}/${now.getTime()}-${random}__${safeBaseName(filename)}.${ext}`;

  const sb = createAdminClient();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: `업로드 준비에 실패했습니다: ${error?.message ?? "알 수 없는 오류"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}

/** file_paths 입력값 검증 — sign-upload가 발급한 형식의 문자열 배열만 통과시킨다 */
function parseFilePaths(
  raw: unknown,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "첨부 목록 형식이 올바르지 않습니다" };
  }

  const paths: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !PATH_PATTERN.test(item.trim())) {
      return { ok: false, error: "첨부 경로 형식이 올바르지 않습니다" };
    }
    paths.push(item.trim());
  }
  if (paths.length > MAX_FILES) {
    return {
      ok: false,
      error: `첨부는 최대 ${MAX_FILES}개까지 올릴 수 있습니다`,
    };
  }
  if (new Set(paths).size !== paths.length) {
    return { ok: false, error: "같은 첨부가 중복되었습니다" };
  }
  return { ok: true, value: paths };
}

/** 검증을 통과한 문서 입력값 — 그대로 insert에 넣는다 */
interface RecordFields {
  category: string;
  title: string;
  doc_date: string | null;
  counterpart: string | null;
  doc_number: string | null;
  memo: string | null;
  file_paths: string[];
}

function validateRecordFields(
  body: RecordsBody,
): { ok: true; value: RecordFields } | { ok: false; error: string } {
  const category = (body.category ?? "").toString().trim();
  const title = (body.title ?? "").toString().trim();
  const docDate = (body.doc_date ?? "").toString().trim();
  const counterpart = (body.counterpart ?? "").toString().trim();
  const docNumber = (body.doc_number ?? "").toString().trim();
  const memo = (body.memo ?? "").toString().trim();

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return { ok: false, error: "분류를 목록에서 선택해주세요" };
  }
  if (!title) {
    return { ok: false, error: "문서 제목을 입력해주세요" };
  }
  if (title.length > 300) {
    return { ok: false, error: "문서 제목이 너무 깁니다 (300자 이하)" };
  }
  // 날짜는 선택 항목이다. 비어 있으면 통과, 값이 있으면 실재하는 날짜여야 한다.
  if (docDate && !isValidDateString(docDate)) {
    return {
      ok: false,
      error: "문서 날짜를 실제 존재하는 YYYY-MM-DD 형식으로 입력해주세요",
    };
  }

  const files = parseFilePaths(body.file_paths);
  if (!files.ok) {
    return { ok: false, error: files.error };
  }

  return {
    ok: true,
    value: {
      category,
      title,
      doc_date: docDate || null,
      counterpart: counterpart || null,
      doc_number: docNumber || null,
      memo: memo || null,
      // file_paths는 NOT NULL(default '{}')이라 null을 명시하면 삽입이 거부된다.
      file_paths: files.value,
    },
  };
}

/**
 * 경로들이 버킷에 실제로 올라와 있는지 확인한다. 없는 경로만 배열로 돌려준다.
 *
 * 실제 업로드는 브라우저가 직접 하므로, 업로드가 실패했는데 경로만 DB에 저장되는
 * 무음 실패가 가능하다. 그러면 목록에는 첨부가 있다고 뜨는데 열면 아무것도 없다.
 * 서명 URL 발급을 존재 확인 용도로 쓴다(없는 오브젝트는 항목별 error가 채워져 온다).
 *
 * 확인 자체가 실패하면(네트워크 등) 저장을 막지 않는다. 여기서 막으면
 * 파일은 멀쩡히 올라갔는데 저장만 안 되는, 더 나쁜 상황이 된다.
 */
async function findMissingPaths(
  sb: SupabaseClient,
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrls(paths, VERIFY_TTL);

  if (error || !data) {
    console.error("[records] 첨부 존재 확인 실패(저장은 계속):", error?.message);
    return [];
  }
  return data.filter((d) => d.error).map((d) => d.path ?? "(경로 불명)");
}

/**
 * 버킷에서 파일을 지운다. 실패해도 예외를 던지지 않는다.
 * (vault removePhotoFiles와 같은 이유 — 남은 고아 파일은 로그로만 남긴다)
 */
async function removeFilesQuietly(sb: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await sb.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error("[records] 첨부 파일 삭제 실패:", error.message, paths);
  }
}

/**
 * 이미 올라갔지만 결국 저장되지 못한 첨부를 지운다.
 *
 * 첨부 5개 중 3번째에서 업로드가 끊기면 1·2번은 버킷에 남는데 이 문서는 저장되지 않는다.
 * 화면이 그 경로들을 여기로 보내 정리한다. 50MB짜리가 쌓이므로 그냥 두면 안 된다.
 */
async function discardFiles(body: RecordsBody) {
  const files = parseFilePaths(body.file_paths);
  if (!files.ok) {
    return NextResponse.json({ error: files.error }, { status: 400 });
  }
  const sb = createAdminClient();
  await removeFilesQuietly(sb, files.value);
  return NextResponse.json({ ok: true, removed: files.value.length });
}

/** 문서 1건 등록 */
async function createRecord(body: RecordsBody) {
  const fields = validateRecordFields(body);
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const sb = createAdminClient();

  const missing = await findMissingPaths(sb, fields.value.file_paths);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `첨부 파일이 업로드되지 않았습니다 (${missing.length}개). 파일을 다시 선택해 저장해주세요`,
      },
      { status: 400 },
    );
  }

  const { data, error } = await sb
    .from("records")
    .insert(fields.value)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // 파일은 이미 버킷에 올라가 있는데 행 저장이 실패했다.
    // 그대로 두면 누구도 참조하지 않는 50MB짜리 고아 파일이 남는다.
    // 화면에서는 다시 저장하면 새로 업로드되므로 여기서 지우는 편이 안전하다.
    await removeFilesQuietly(sb, fields.value.file_paths);
    return NextResponse.json(
      { error: `문서 저장에 실패했습니다: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ item: data as unknown as RecordRow });
}
