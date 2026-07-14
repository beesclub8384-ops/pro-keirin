import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function GET(req: Request) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();

  const { data: articles, error } = await sb
    .from("interview_articles")
    .select(
      "id, request_id, player_name, grade, region, headline, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requestIds = Array.from(
    new Set((articles ?? []).map((a) => a.request_id as number)),
  );

  let typeByReq = new Map<number, string>();
  if (requestIds.length > 0) {
    const { data: reqs, error: reqErr } = await sb
      .from("interview_requests")
      .select("id, request_type")
      .in("id", requestIds);
    if (reqErr) {
      return NextResponse.json({ error: reqErr.message }, { status: 500 });
    }
    typeByReq = new Map(
      (reqs ?? []).map((r) => [r.id as number, r.request_type as string]),
    );
  }

  const rows = (articles ?? []).map((a) => ({
    id: a.id,
    requestId: a.request_id,
    requestType: typeByReq.get(a.request_id as number) ?? null,
    playerName: a.player_name,
    grade: a.grade,
    region: a.region,
    headline: a.headline,
    status: a.status,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  }));

  return NextResponse.json({ articles: rows });
}
