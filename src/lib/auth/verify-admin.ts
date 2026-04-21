import { cookies } from 'next/headers';

const COOKIE_NAME = 'interview_admin_token';

/**
 * 서버 측 관리자 인증 검증.
 * 쿠키의 토큰 값과 INTERVIEW_ADMIN_PASSWORD env를 비교.
 * 인증 성공 시 true, 실패 시 false.
 *
 * 사용 사례: admin API 라우트 최상단에서 매 호출마다 검증.
 */
export async function verifyAdmin(): Promise<boolean> {
  const adminPassword = process.env.INTERVIEW_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('[verifyAdmin] INTERVIEW_ADMIN_PASSWORD env not set');
    return false;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return false;
  return token === adminPassword;
}
