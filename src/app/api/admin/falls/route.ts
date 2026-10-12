import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { withAdmin } from "@/lib/auth/with-admin";
import {
  MAX_RANGE_DAYS,
  VENUES,
  buildFallsReport,
  diffDays,
  type Venue,
} from "@/lib/falls-query";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** YYYY-MM-DD 형식이면서 실제로 존재하는 날짜인지 */
function isValidDate(s: string | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/admin/falls?from=YYYY-MM-DD&to=YYYY-MM-DD&venue=광명|창원|부산|all
 *
 * 낙차 대장 조회 — **읽기 전용**. 쓰기는 2단계(지급 건)에서 별도 라우트로 붙인다.
 *
 * 인증은 withAdmin() 이 담당한다. service role 로 RLS 를 우회하므로
 * 이 래퍼가 빠지면 전 선수 사고 이력이 익명에게 열린다 (scripts/check-admin-guards.mjs 가 감시).
 */
export const GET = withAdmin(async (request: Request) => {
  const url = new URL(request.url);
  const venueParam = url.searchParams.get("venue") ?? "all";
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (venueParam !== "all" && !VENUES.includes(venueParam as Venue)) {
    return NextResponse.json(
      { error: `venue 는 ${VENUES.join(", ")} 또는 all 이어야 합니다` },
      { status: 400 },
    );
  }

  // 기본값: 최근 30일
  const today = new Date();
  const defaultTo = toISODate(today);
  const defaultFrom = toISODate(
    new Date(today.getTime() - 29 * 86_400_000),
  );

  const from = isValidDate(fromParam) ? fromParam : defaultFrom;
  const to = isValidDate(toParam) ? toParam : defaultTo;

  if (from > to) {
    return NextResponse.json(
      { error: "from 이 to 보다 뒤입니다" },
      { status: 400 },
    );
  }

  // 기간 상한 — 전 기간 조회로 함수가 타임아웃되는 것을 막는다
  const span = diffDays(from, to) + 1;
  if (span > MAX_RANGE_DAYS) {
    return NextResponse.json(
      {
        error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다 (요청: ${span}일)`,
      },
      { status: 400 },
    );
  }

  try {
    const sb = createAdminClient();
    const report = await buildFallsReport(sb, {
      from,
      to,
      venue: venueParam as Venue | "all",
    });
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error("[admin/falls] 조회 실패:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
