import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyAdminAuth } from "@/lib/admin-auth";

/**
 * 관리자: 맛집 폼 요청 목록 조회 및 생성
 */

export async function GET(req: Request) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gyeongshullin_requests")
    .select(
      "id, racer_id, player_name, grade, region, form_token, form_url, status, restaurant_id, sent_at, completed_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requests = (data ?? []).map((r) => ({
    id: r.id,
    racerId: r.racer_id,
    playerName: r.player_name,
    grade: r.grade,
    region: r.region,
    formToken: r.form_token,
    formUrl: r.form_url,
    status: r.status,
    restaurantId: r.restaurant_id,
    sentAt: r.sent_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    playerName?: string;
    region?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const playerName = (body.playerName ?? "").trim();
  if (!playerName) {
    return NextResponse.json(
      { error: "playerName이 필요합니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  // 조합원 정보 자동 조회 (팀 등)
  let region = (body.region ?? "").trim();
  let racerId: string | null = null;

  const { data: profile } = await sb
    .from("racer_profiles")
    .select("racer_id, training")
    .eq("name", playerName)
    .eq("is_union", true)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profile) {
    racerId = (profile.racer_id as string) ?? null;
    if (!region) {
      const training = (profile.training as string | null) ?? "";
      region = training ? String(training).split("/")[0].trim() : "";
    }
  }

  const { data, error } = await sb
    .from("gyeongshullin_requests")
    .insert({
      player_name: playerName,
      racer_id: racerId,
      grade: null,
      region: region || null,
      status: "sent", // 생성 즉시 발송 가능한 상태로
      sent_at: new Date().toISOString(),
    })
    .select("id, form_token, player_name, grade, region")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    formToken: data.form_token,
    playerName: data.player_name,
    grade: data.grade,
    region: data.region,
  });
}
