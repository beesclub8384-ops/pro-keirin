import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * 사무국장 전용 대납(daenap) API — 비밀번호 인증 후 조회/등록.
 *
 * - 대납 데이터는 민감정보이므로 브라우저에서 Supabase에 직접 접근하지 않는다.
 *   반드시 이 라우트(service role key, RLS 우회)를 거친다.
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

/** PostgREST 기본 limit(1000) 회피용 페이지 크기 */
const PAGE_SIZE = 1000;

interface VaultBody {
  action?: string;
  password?: string;
  date?: string;
  recipient?: string;
  amount?: number | string;
  description?: string;
  category?: string;
  sub_category?: string | null;
}

interface DaenapRow {
  id: string | number;
  date: string;
  recipient: string | null;
  amount: number | null;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  photo_url: string | null;
  created_at: string | null;
}

const SELECT_COLUMNS =
  "id, date, recipient, amount, description, category, sub_category, photo_url, created_at";

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

/** daenap 전체를 날짜 내림차순으로 조회 (1000행 제한 회피용 페이지네이션) */
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

  return NextResponse.json({ items: rows, count: rows.length });
}

/** 대납 1건 등록 */
async function createDaenap(body: VaultBody) {
  const date = (body.date ?? "").trim();
  const recipient = (body.recipient ?? "").trim();
  const description = (body.description ?? "").trim();
  const category = (body.category ?? "").trim();
  const subCategoryRaw = (body.sub_category ?? "").toString().trim();

  if (!isValidDateString(date)) {
    return NextResponse.json(
      { error: "날짜를 실제 존재하는 YYYY-MM-DD 형식으로 입력해주세요" },
      { status: 400 },
    );
  }
  if (!recipient) {
    return NextResponse.json(
      { error: "누구에게 지급했는지 입력해주세요" },
      { status: 400 },
    );
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: "금액은 0 이상의 숫자로 입력해주세요" },
      { status: 400 },
    );
  }

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json(
      { error: "성격분류를 목록에서 선택해주세요" },
      { status: 400 },
    );
  }

  // 세부분류는 '임원 및 대의원 지출'일 때만 저장. 그 외에는 값이 와도 무시(null)한다.
  let subCategory: string | null = null;
  if (category === SUB_CATEGORY_PARENT && subCategoryRaw) {
    if (!SUB_CATEGORIES.includes(subCategoryRaw as (typeof SUB_CATEGORIES)[number])) {
      return NextResponse.json(
        { error: "세부분류를 목록에서 선택해주세요" },
        { status: 400 },
      );
    }
    subCategory = subCategoryRaw;
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("daenap")
    .insert({
      date,
      recipient,
      amount,
      description: description || null,
      category,
      sub_category: subCategory,
    })
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
