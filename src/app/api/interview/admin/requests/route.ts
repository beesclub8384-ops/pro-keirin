import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("interview_requests")
    .select(
      "id, racer_id, player_name, grade, region, request_type, selected_questions, status, form_url, sent_at, completed_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: Request) {
  let body: {
    playerName?: string;
    grade?: string;
    region?: string;
    racerId?: number;
    requestType?: string;
    selectedQuestions?: string[];
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
  if (!Array.isArray(body.selectedQuestions) || body.selectedQuestions.length === 0) {
    return NextResponse.json(
      { error: "selectedQuestions 배열이 필요합니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("interview_requests")
    .insert({
      racer_id: body.racerId ?? null,
      player_name: playerName,
      grade: body.grade ?? null,
      region: body.region ?? null,
      request_type: body.requestType ?? "regular",
      selected_questions: body.selectedQuestions,
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
