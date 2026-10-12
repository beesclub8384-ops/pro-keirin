import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * 관리자 전용 라우트 핸들러 래퍼.
 *
 * 왜 필요한가:
 *   이 앱에는 middleware.ts 가 없어 라우트를 일괄 차단하는 지점이 없다.
 *   각 라우트가 최상단에서 verifyAdmin() 을 직접 불러야 하는데, **한 줄 빼먹으면
 *   그 라우트는 그대로 공개된다.** 에러도 안 나고 테스트도 통과한다.
 *   service role 로 RLS 를 우회하는 라우트에서 이게 빠지면 전 선수 사고 이력이
 *   익명에게 열린다.
 *
 *   withAdmin() 으로 감싸면 인증이 export 구조의 일부가 되어 "빼먹을 자리"가 없어진다.
 *   보조 장치로 scripts/check-admin-guards.mjs 가 가드 없는 admin 라우트를 잡는다.
 *
 * 사용:
 *   export const GET = withAdmin(async (req) => { ... });
 */
export function withAdmin<Ctx = unknown>(
  handler: (request: Request, context: Ctx) => Promise<Response> | Response,
): (request: Request, context: Ctx) => Promise<Response> {
  return async (request: Request, context: Ctx) => {
    const authorized = await verifyAdmin();
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request, context);
  };
}
