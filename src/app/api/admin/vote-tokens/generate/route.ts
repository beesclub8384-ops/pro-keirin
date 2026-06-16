import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyAdmin } from "@/lib/auth/verify-admin";

export const dynamic = "force-dynamic";

const MIN_COUNT = 1;
const MAX_COUNT = 20;
const TOKEN_LENGTH = 16;

/** UUID 기반 16글자 토큰 1개 생성 */
function makeToken(): string {
  return randomUUID().replace(/-/g, "").slice(0, TOKEN_LENGTH);
}

/**
 * 고유 토큰 N개 생성 (저장하지 않고 반환).
 * 배치 내 중복은 Set 으로 제거하며 부족분을 채운다.
 */
function makeUniqueTokens(count: number): string[] {
  const set = new Set<string>();
  // 안전장치: 무한루프 방지 (충돌 확률은 사실상 0)
  let guard = count * 10 + 50;
  while (set.size < count && guard-- > 0) {
    set.add(makeToken());
  }
  return [...set];
}

export async function POST(req: NextRequest) {
  // 어드민 인증 (쿠키 재검증)
  const authorized = await verifyAdmin();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 개수 검증: 정수 1~20
  const count = body.count;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < MIN_COUNT ||
    count > MAX_COUNT
  ) {
    return NextResponse.json(
      { error: `생성 개수는 ${MIN_COUNT}~${MAX_COUNT} 사이의 정수여야 합니다.` },
      { status: 400 },
    );
  }

  const tokens = makeUniqueTokens(count);

  return NextResponse.json({ tokens });
}

// GET 등 다른 메서드 차단
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
