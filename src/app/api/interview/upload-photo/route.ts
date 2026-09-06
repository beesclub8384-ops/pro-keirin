import { NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase";
import { applyFilmFilter } from "@/lib/film-filter";
import { recordUploadFailure } from "@/lib/interview-upload-failure";

const BUCKET = "interview-photos";

// sharp 정규화 + 필름 필터는 큰 사진에서 수 초가 걸린다(실측: 12MP 약 4초, 20MP 약 10초).
// 기본 실행 시간 안에 못 끝내면 응답이 JSON 이 아닌 형태로 잘려 클라이언트는
// "업로드 실패" 한 줄만 보게 되므로 여유를 둔다.
export const maxDuration = 60;

// 업로드는 포맷과 무관하게 항상 JPEG 로 정규화해서 저장한다.
// 아이폰 사진은 확장자가 .jpg 여도 실제 내용이 HEIC 인 경우가 있는데,
// 브라우저는 HEIC 를 표시하지 못해 alt 텍스트만 보인다.
const JPEG_QUALITY = 92;

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 60 ? base.slice(-60) : base;
}

/** ISO-BMFF(ftyp) 컨테이너인지 — HEIC/HEIF/AVIF 계열이 여기 해당 */
function isIsoBmff(buf: Buffer): boolean {
  return buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp";
}

/**
 * 어떤 입력이든 브라우저가 표시 가능한 JPEG Buffer 로 변환한다.
 *
 * 1차: sharp — HEIC 포함 대부분을 처리하고 EXIF 회전(.rotate())까지 반영한다.
 * 2차: sharp 빌드에 HEVC 디코더가 없으면 ftyp 컨테이너에 한해 heic-convert(순수 JS)로 폴백.
 *      sharp 의 HEIF 지원 여부가 플랫폼(로컬 win32 / Vercel linux)마다 다를 수 있어 둔 안전망이다.
 */
async function normalizeToJpeg(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: "none" })
      .rotate()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (e) {
    if (!isIsoBmff(input)) throw e;
    const heicConvert = (await import("heic-convert")).default;
    const converted = await heicConvert({
      buffer: new Uint8Array(input),
      format: "JPEG",
      quality: JPEG_QUALITY / 100,
    });
    // heic-convert 출력은 EXIF 가 없으므로 회전 보정은 이미 픽셀에 반영된 상태다
    return Buffer.from(converted);
  }
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data로 전송해주세요" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    // 여기서 깨지면 requestId·파일명도 알 수 없다. 그래도 "왔다는 사실"은 남긴다.
    await recordUploadFailure({
      stage: "server_formdata",
      errorMessage: e instanceof Error ? e.message : String(e),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json(
      { error: "폼 데이터 파싱 실패" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const requestIdRaw = form.get("requestId");
  // applyFilter=true 일 때만 빈티지 필름 필터 적용 (자유 첨부 사진 전용).
  // 값이 없으면 원본 그대로 업로드 (관리자 사진 등 보호).
  const applyFilter = form.get("applyFilter") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다" }, { status: 400 });
  }
  const requestId = Number(requestIdRaw);
  if (!Number.isFinite(requestId)) {
    return NextResponse.json(
      { error: "requestId가 필요합니다" },
      { status: 400 },
    );
  }

  // 아이폰 HEIC 는 브라우저가 type 을 빈 문자열로 보내는 경우가 있어 빈 값은 통과시킨다.
  // 실제 이미지 여부는 아래 normalizeToJpeg 의 디코딩으로 판별한다 (MIME 문자열보다 신뢰도가 높다).
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드 가능합니다" },
      { status: 400 },
    );
  }
  // ⚠️ 방어용 검사다. Vercel 서버리스 함수의 요청 본문 상한 4.5MB 가 먼저 작동해
  //    그보다 큰 요청은 이 핸들러에 도달하지도 못한다(로그도 남지 않는다).
  //    실제 크기 방어는 클라이언트의 compressImage() 가 담당한다.
  const MAX = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX) {
    return NextResponse.json(
      { error: "10MB 이하 파일만 업로드 가능합니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const timestamp = Date.now();

  // 1) 항상 JPEG 로 정규화. 실패하면 저장하지 않는다 —
  //    표시 불가능한 원본(HEIC 등)을 그대로 넣으면 화면에 alt 텍스트만 남는 무음 실패가 된다.
  let uploadBuffer: Buffer;
  try {
    uploadBuffer = await normalizeToJpeg(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error("[upload-photo] JPEG 변환 실패:", e);
    await recordUploadFailure({
      stage: "server_convert",
      requestId,
      errorMessage: e instanceof Error ? e.message : String(e),
      fileName: file.name,
      fileSize: file.size,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json(
      { error: "이미지를 변환하지 못했습니다. 다른 사진으로 시도해주세요" },
      { status: 422 },
    );
  }

  // 2) 필터는 실패해도 정규화된 JPEG 로 계속 진행 (제출 자체는 막지 않는다)
  if (applyFilter) {
    try {
      uploadBuffer = await applyFilmFilter(uploadBuffer);
    } catch (e) {
      console.error("[upload-photo] 필름 필터 적용 실패, 무보정 JPEG 업로드:", e);
    }
  }

  // 파일명: 원본 확장자를 떼고 실제 업로드 포맷(.jpg)을 붙인다
  const rawBase = file.name ? sanitizeFilename(file.name) : "photo";
  const baseName = rawBase.replace(/\.[^.]+$/, "") || "photo";
  const path = `interview/${requestId}/${timestamp}_${baseName}.jpg`;

  // ⚠️ Buffer 를 그대로 넘기면 Vercel 런타임에서 본문이 UTF-8 문자열로 강제 변환돼
  //    바이트가 훼손된다(0xFF → EF BF BD). Blob 으로 감싸면 multipart 경로를 타서 안전하다.
  const body = new Blob([new Uint8Array(uploadBuffer)], { type: "image/jpeg" });

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, body, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (upErr) {
    console.error("[upload-photo] storage error:", upErr.message, path);
    await recordUploadFailure({
      stage: "server_storage",
      requestId,
      errorMessage: `${upErr.message} (path: ${path})`,
      fileName: file.name,
      fileSize: uploadBuffer.length,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: pub.publicUrl, path });
}
