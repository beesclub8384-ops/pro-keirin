import { createAdminClient } from "@/lib/supabase";

/**
 * 인터뷰 사진 업로드 실패를 interview_upload_failures 에 기록한다.
 *
 * ⚠️ 존재 이유 (2026-09-06):
 *   Vercel Hobby 런타임 로그는 1시간이면 사라진다. 실제 사고 때 41분 뒤에 이미
 *   로그가 비어 있어 어느 단계에서 끊겼는지 특정하지 못했다. 그래서 DB에 남긴다.
 *
 * ⚠️ 이 함수는 절대 throw 하지 않는다.
 *   기록이 업로드 자체를 방해하면 배보다 배꼽이 크다. insert 가 실패하면
 *   console.error 만 남기고 조용히 넘어간다 — 호출부는 await 만 하면 된다.
 */

/** 텍스트 필드 저장 상한. 악의적인 대용량 신고를 막는다. */
const MAX_TEXT = 500;

export type UploadFailureStage =
  | "client_fetch" // 브라우저가 응답을 못 받거나 4xx/5xx 수신 (413 본문 초과 포함)
  | "server_formdata" // multipart 파싱 실패 (본문이 잘려 도착한 경우 등)
  | "server_convert" // sharp / heic-convert JPEG 변환 실패
  | "server_storage"; // Supabase Storage 업로드 실패

export interface UploadFailureInput {
  stage: UploadFailureStage;
  // 신고 본문에서 그대로 넘어오는 값이 있어 전부 unknown 으로 받고 아래에서 정제한다
  requestId?: unknown;
  errorMessage?: unknown;
  fileName?: unknown;
  fileSize?: unknown;
  originalSize?: unknown;
  userAgent?: unknown;
}

/** 문자열만 통과시키고 MAX_TEXT 로 자른다. 그 외에는 null */
function clipText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
}

/** 유한한 수만 통과시킨다. 그 외에는 null */
function toBigint(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function recordUploadFailure(
  input: UploadFailureInput,
): Promise<void> {
  try {
    const sb = createAdminClient();
    const { error } = await sb.from("interview_upload_failures").insert({
      request_id: toBigint(input.requestId),
      stage: input.stage,
      error_message: clipText(input.errorMessage),
      file_name: clipText(input.fileName),
      file_size: toBigint(input.fileSize),
      original_size: toBigint(input.originalSize),
      user_agent: clipText(input.userAgent),
    });
    if (error) {
      console.error("[upload-failure] 기록 insert 실패:", error.message);
    }
  } catch (e) {
    // 기록 실패는 삼킨다 — 업로드 응답에 영향을 주면 안 된다
    console.error("[upload-failure] 기록 중 예외:", e);
  }
}
