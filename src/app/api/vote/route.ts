import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { VOTE_ITEM_IDS, VOTE_TOTAL } from "@/lib/vote-config";

export const dynamic = "force-dynamic";

const TOKEN_MIN = 4;
const TOKEN_MAX = 128;

/**
 * 투표 제출 페이로드 검증.
 * 정상이면 null, 문제가 있으면 에러 메시지를 반환.
 */
function validate(body: Record<string, unknown>): string | null {
  // 토큰 검증
  const token = body.token;
  if (typeof token !== "string") {
    return "유효하지 않은 투표 링크입니다.";
  }
  const trimmed = token.trim();
  if (trimmed.length < TOKEN_MIN || trimmed.length > TOKEN_MAX) {
    return "유효하지 않은 투표 링크입니다.";
  }

  // votes 검증: 정확히 15개 항목, 각 값은 boolean, 키는 화이트리스트
  const votes = body.votes;
  if (typeof votes !== "object" || votes === null || Array.isArray(votes)) {
    return "투표 항목 형식이 올바르지 않습니다.";
  }
  const entries = Object.entries(votes as Record<string, unknown>);
  if (entries.length !== VOTE_TOTAL) {
    return `모든 항목(${VOTE_TOTAL}개)에 투표해 주세요.`;
  }
  for (const [key, val] of entries) {
    if (!VOTE_ITEM_IDS.has(key)) {
      return `허용되지 않은 항목입니다: ${key}`;
    }
    if (typeof val !== "boolean") {
      return "찬성/반대 값이 올바르지 않습니다.";
    }
  }
  // 모든 화이트리스트 항목이 빠짐없이 포함됐는지 확인
  for (const id of VOTE_ITEM_IDS) {
    if (!(id in (votes as Record<string, unknown>))) {
      return `누락된 항목이 있습니다: ${id}`;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const error = validate(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const token = (body.token as string).trim();
  const votes = body.votes as Record<string, boolean>;

  // service_role 로 RLS 우회하여 저장
  const supabase = createAdminClient();
  const { error: dbError } = await supabase
    .from("pkru_vote_2026")
    .insert({ token, votes });

  if (dbError) {
    // UNIQUE(token) 위반 = 이미 이 링크로 투표함
    if (dbError.code === "23505") {
      return NextResponse.json(
        { error: "이미 이 링크로 투표하셨습니다." },
        { status: 409 },
      );
    }
    console.error("[vote] insert error:", dbError);
    return NextResponse.json(
      { error: "저장 중 오류가 발생했습니다. 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

// GET 등 다른 메서드는 차단
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
