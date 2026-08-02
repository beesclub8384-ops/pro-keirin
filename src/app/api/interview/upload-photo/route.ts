import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { applyFilmFilter, FILM_FILTER_OUTPUT } from "@/lib/film-filter";

const BUCKET = "interview-photos";

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 60 ? base.slice(-60) : base;
}

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
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
  } catch {
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

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드 가능합니다" },
      { status: 400 },
    );
  }
  const MAX = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX) {
    return NextResponse.json(
      { error: "10MB 이하 파일만 업로드 가능합니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const timestamp = Date.now();

  let uploadBuffer: Buffer = Buffer.from(await file.arrayBuffer());
  let uploadType = file.type;
  let uploadExt = extFromMime(file.type);

  if (applyFilter) {
    try {
      uploadBuffer = await applyFilmFilter(uploadBuffer);
      uploadType = FILM_FILTER_OUTPUT.contentType;
      uploadExt = FILM_FILTER_OUTPUT.ext;
    } catch (e) {
      // 필터 실패 시 원본으로 폴백 (제출 자체는 막지 않는다)
      console.error("[upload-photo] 필름 필터 적용 실패, 원본 업로드:", e);
    }
  }

  // 파일명: 원본 확장자를 떼고 실제 업로드 포맷 확장자를 붙인다
  const rawBase = file.name ? sanitizeFilename(file.name) : "photo";
  const baseName = rawBase.replace(/\.[^.]+$/, "") || "photo";
  const path = `interview/${requestId}/${timestamp}_${baseName}.${uploadExt}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, uploadBuffer, {
      contentType: uploadType,
      upsert: false,
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: pub.publicUrl, path });
}
