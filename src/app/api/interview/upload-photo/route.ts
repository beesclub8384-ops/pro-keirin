import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

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
  const origName = file.name
    ? sanitizeFilename(file.name)
    : `photo.${extFromMime(file.type)}`;
  const path = `interview/${requestId}/${timestamp}_${origName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: pub.publicUrl, path });
}
