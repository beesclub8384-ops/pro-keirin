// admin-guard: public
// 로그인 엔드포인트 자체이므로 인증 가드를 걸 수 없다 (걸면 로그인이 불가능해진다).
// POST 는 비밀번호를 직접 비교하고, GET 은 쿠키 유효성만 돌려준다.
// 이 선언은 scripts/check-admin-guards.mjs 가 의도적 공개임을 알아보게 하려는 것이다.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "interview_admin_token";
const MAX_AGE = 60 * 60 * 24; // 24시간

export async function POST(req: Request) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const expected = process.env.INTERVIEW_ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "서버에 비밀번호가 설정되지 않았습니다" },
      { status: 500 },
    );
  }

  if (!body.password || body.password !== expected) {
    return NextResponse.json(
      { error: "비밀번호가 틀렸습니다" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

export async function GET() {
  const expected = process.env.INTERVIEW_ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ authenticated: false });
  }
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return NextResponse.json({ authenticated: token === expected });
}
