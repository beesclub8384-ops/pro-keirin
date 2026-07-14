import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyAdminAuth } from "@/lib/admin-auth";

const BUCKET = "racer-photos";

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
}

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  return "bin";
}

export async function POST(req: Request) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  const racerIdRaw = form.get("racerId");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file 필드가 필요합니다" },
      { status: 400 },
    );
  }
  if (typeof racerIdRaw !== "string" || !racerIdRaw.trim()) {
    return NextResponse.json(
      { error: "racerId가 필요합니다" },
      { status: 400 },
    );
  }
  const racerId = racerIdRaw.trim();

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드 가능합니다" },
      { status: 400 },
    );
  }
  const MAX = 5 * 1024 * 1024;
  if (file.size > MAX) {
    return NextResponse.json(
      { error: "5MB 이하 파일만 업로드 가능합니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const timestamp = Date.now();
  const origName = file.name
    ? sanitize(file.name)
    : `photo.${extFromMime(file.type)}`;
  const path = `${racerId}/${timestamp}_${origName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: dbErr } = await sb
    .from("racer_profiles")
    .update({ photo_url: url })
    .eq("racer_id", racerId);

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ url, path });
}

export async function DELETE(req: Request) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const racerId = searchParams.get("racerId")?.trim();
  if (!racerId) {
    return NextResponse.json(
      { error: "racerId가 필요합니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("racer_profiles")
    .update({ photo_url: null })
    .eq("racer_id", racerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
