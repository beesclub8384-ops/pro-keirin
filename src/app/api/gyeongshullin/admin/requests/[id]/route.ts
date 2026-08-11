import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyAdminAuth } from "@/lib/admin-auth";

/**
 * 관리자: 요청 삭제
 */

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("gyeongshullin_requests")
    .delete()
    .eq("id", numId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
