import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { extractRegion } from "@/lib/gyeongshullin";

/**
 * GET: 토큰으로 요청 정보 조회 (선수 이름/팀 미리 채우기용)
 * POST: 선수가 폼 제출 → gyeongshullin_restaurants에 draft로 저장
 *       + gyeongshullin_requests.status = 'completed' 처리
 *
 * 이 라우트는 공개(auth 없음) — 대신 form_token으로만 접근 가능.
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: request, error } = await sb
    .from("gyeongshullin_requests")
    .select("id, player_name, grade, region, status")
    .eq("form_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!request) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (request.status === "pending") {
    return NextResponse.json(
      { error: "아직 발송되지 않은 요청입니다", status: "pending" },
      { status: 403 },
    );
  }
  if (request.status === "completed") {
    return NextResponse.json(
      { error: "이미 제출된 요청입니다", status: "completed" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: request.id,
    playerName: request.player_name,
    grade: request.grade,
    region: request.region,
    status: request.status,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  let body: {
    name?: string;
    address?: string;
    menu?: string;
    menuDescription?: string;
    otherNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const restaurantName = (body.name ?? "").trim();
  const address = (body.address ?? "").trim();
  if (!restaurantName || !address) {
    return NextResponse.json(
      { error: "가게 이름과 주소는 필수입니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  // 1. 토큰으로 요청 조회
  const { data: request } = await sb
    .from("gyeongshullin_requests")
    .select("id, player_name, grade, region, status")
    .eq("form_token", token)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (request.status === "completed") {
    return NextResponse.json(
      { error: "이미 제출된 요청입니다" },
      { status: 409 },
    );
  }
  if (request.status !== "sent" && request.status !== "in_progress") {
    return NextResponse.json(
      { error: `제출할 수 없는 상태입니다: ${request.status}` },
      { status: 403 },
    );
  }

  // 2. raw_note 조립 (선수가 준 정보 원문)
  const noteLines: string[] = [];
  if (body.menu?.trim()) noteLines.push(`[메뉴] ${body.menu.trim()}`);
  if (body.menuDescription?.trim())
    noteLines.push(`[메뉴 특징] ${body.menuDescription.trim()}`);
  if (body.otherNote?.trim()) noteLines.push(`[기타] ${body.otherNote.trim()}`);
  const rawNote = noteLines.join("\n\n");

  // 3. restaurants에 draft로 저장
  const { data: restaurant, error: insertErr } = await sb
    .from("gyeongshullin_restaurants")
    .insert({
      name: restaurantName,
      address,
      region: extractRegion(address),
      menu: body.menu?.trim() ?? null,
      memo: null,
      raw_note: rawNote || null,
      food_photos: [],
      menu_photos: [],
      recommender_name: request.player_name,
      recommender_grade: request.grade,
      recommender_region: request.region,
      status: "draft" as const,
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 4. requests 완료 처리
  const { error: updateErr } = await sb
    .from("gyeongshullin_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      restaurant_id: restaurant.id,
    })
    .eq("id", request.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, restaurantId: restaurant.id });
}
