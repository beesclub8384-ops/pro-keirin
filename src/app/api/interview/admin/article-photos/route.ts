import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { sanitizeFilename } from "@/lib/storage-path";

/**
 * 관리자가 기사에 사진을 추가할 때 쓰는 **서명 업로드 URL 발급** 라우트.
 *
 * ⚠️ /records 와 같은 구조다. 사진 바이트는 이 서버를 지나가지 않고
 *   브라우저 → Supabase Storage 로 직행한다. Vercel 서버리스 함수의 요청 본문
 *   상한 4.5MB 를 우회하려는 것이다 (2026-09-06 선수 폼 업로드 실패의 원인).
 *   service role 키는 여전히 서버에만 있다.
 *
 * ⚠️ 바이트가 서버를 안 지나가므로 크기 검사는 **클라이언트가 보낸 숫자**를 믿는
 *   1차 방어일 뿐이다. 최종 방어선은 버킷의 file_size_limit 과 Storage 자체다.
 *
 * ⚠️ 서버 가공이 없다 (upload-photo 는 sharp 로 JPEG 정규화를 한다).
 *   그래서 경로 확장자를 .jpg 로 고정하는 대신, 호출하는 화면이 compressImage()
 *   결과가 실제로 image/jpeg 인지 확인한 뒤에만 올려야 한다.
 */

const BUCKET = "interview-photos";

/** 1차 방어용 상한. 브라우저 compressImage() 를 거치면 보통 4MB 아래로 내려온다. */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { articleId?: unknown; fileName?: unknown; fileSize?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const articleId = Number(body.articleId);
  if (!Number.isFinite(articleId)) {
    return NextResponse.json(
      { error: "articleId가 필요합니다" },
      { status: 400 },
    );
  }

  const fileName =
    typeof body.fileName === "string" && body.fileName.trim()
      ? body.fileName.trim()
      : "photo";

  const fileSize = Number(body.fileSize);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json(
      { error: "파일 크기를 확인하지 못했습니다" },
      { status: 400 },
    );
  }
  if (fileSize > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `사진 1장은 ${Math.round(MAX_BYTES / 1024 / 1024)}MB까지만 올릴 수 있습니다`,
      },
      { status: 400 },
    );
  }

  // 원본 확장자를 떼고 실제 업로드 포맷(.jpg)을 붙인다 — upload-photo 와 같은 규칙
  const rawBase = sanitizeFilename(fileName);
  const baseName = rawBase.replace(/\.[^.]+$/, "") || "photo";
  // 선수 제출분(interview/{requestId}/...)과 섞이지 않게 admin/ 아래에 둔다
  const path = `admin/${articleId}/${Date.now()}_${baseName}.jpg`;

  const sb = createAdminClient();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error(
      "[article-photos] 서명 URL 발급 실패:",
      error?.message,
      path,
    );
    return NextResponse.json(
      {
        error: `업로드 준비에 실패했습니다: ${error?.message ?? "알 수 없는 오류"}`,
      },
      { status: 500 },
    );
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    path: data.path,
    token: data.token,
    publicUrl: pub.publicUrl,
  });
}
