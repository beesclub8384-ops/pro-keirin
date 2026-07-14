const COOKIE_NAME = "interview_admin_token";

/**
 * 요청 쿠키에서 관리자 토큰을 읽어 INTERVIEW_ADMIN_PASSWORD와 일치하는지 검증한다.
 *
 * - admin/auth 라우트가 로그인 성공 시 httpOnly 쿠키(`interview_admin_token`)에
 *   비밀번호 값을 저장한다. 그 쿠키를 서버에서 검증하는 용도.
 * - 비밀번호 미설정(env 없음)이거나 쿠키 없음/불일치 → false.
 *
 * 사용:
 *   if (!verifyAdminAuth(req)) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 */
export function verifyAdminAuth(request: Request): boolean {
  const expected = process.env.INTERVIEW_ADMIN_PASSWORD;
  if (!expected) return false; // 서버에 비밀번호 미설정 → 안전하게 거부

  const header = request.headers.get("cookie");
  if (!header) return false;

  const raw = readCookie(header, COOKIE_NAME);
  if (raw === null) return false;

  // Next.js가 쿠키 값을 URL-encode해 저장하므로 원문/디코딩 값 둘 다 비교
  if (raw === expected) return true;
  try {
    return decodeURIComponent(raw) === expected;
  } catch {
    return false;
  }
}

/** Cookie 헤더에서 name에 해당하는 값을 추출 (없으면 null) */
function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}
