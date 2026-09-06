import { NextResponse } from "next/server";
import { recordUploadFailure } from "@/lib/interview-upload-failure";

/**
 * 클라이언트가 사진 업로드 실패를 신고하는 초경량 엔드포인트.
 *
 * ⚠️ 존재 이유:
 *   업로드 실패의 유력한 원인인 Vercel 요청 본문 상한 4.5MB 초과(413)는
 *   /api/interview/upload-photo 핸들러에 **도달조차 못 해** 서버가 아무것도 남길 수 없다.
 *   타임아웃·네트워크 끊김도 마찬가지다. 그래서 브라우저가 직접 신고한다.
 *   이 요청 본문은 텍스트뿐(수백 바이트)이라 4.5MB 벽과 무관하게 항상 도달한다.
 *
 * ⚠️ 설계 원칙:
 *   - 인증 없음. 인터뷰 폼은 로그인이 없고, 신고를 막으면 증거가 안 남는다.
 *   - 대신 **쓰기 전용**이다. 조회하지 않고, 저장한 값을 되돌려주지도 않는다.
 *     응답은 항상 { ok: true } 하나뿐이라 이 엔드포인트로는 아무 정보도 캐낼 수 없다.
 *   - 텍스트 필드는 recordUploadFailure 가 500자로 자른다 (대용량 신고 방지).
 *   - 어떤 경우에도 실패를 알리지 않는다. 신고가 실패했다고 화면에 띄울 것이 없다.
 */
export async function POST(req: Request) {
  let body: {
    requestId?: unknown;
    errorMessage?: unknown;
    fileName?: unknown;
    fileSize?: unknown;
    originalSize?: unknown;
    userAgent?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    // 본문이 깨졌어도 신고자에게 알릴 것은 없다
    return NextResponse.json({ ok: true });
  }

  await recordUploadFailure({
    stage: "client_fetch",
    requestId: body.requestId,
    errorMessage: body.errorMessage,
    fileName: body.fileName,
    fileSize: body.fileSize,
    originalSize: body.originalSize,
    // UA 는 헤더가 더 신뢰할 만하다. 없으면 본문 값으로 폴백.
    userAgent: req.headers.get("user-agent") ?? body.userAgent,
  });

  return NextResponse.json({ ok: true });
}
