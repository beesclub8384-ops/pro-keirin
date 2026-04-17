import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("interview_requests")
    .select(
      "id, racer_id, player_name, grade, region, request_type, selected_questions, status, form_url, sent_at, completed_at, created_at, interview_articles(id, status)",
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requests = (data ?? []).map((r) => {
    const articles = r.interview_articles as
      | { id: number; status: string }[]
      | null;
    const article = articles && articles.length > 0 ? articles[0] : null;
    return {
      id: r.id,
      racerId: r.racer_id,
      playerName: r.player_name,
      grade: r.grade,
      region: r.region,
      requestType: r.request_type,
      selectedQuestions: r.selected_questions,
      status: r.status,
      formUrl: r.form_url,
      sentAt: r.sent_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      articleId: article?.id ?? null,
      articleStatus: article?.status ?? null,
    };
  });

  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  let body: {
    playerName?: string;
    grade?: string;
    region?: string;
    racerId?: number;
    requestType?: string;
    selectedQuestions?: string[];
    status?: string;
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

  const isDraft = body.status === "draft";
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
      status: isDraft ? "draft" : "sent",
      sent_at: isDraft ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}

export async function PUT(req: Request) {
  let body: {
    id?: number;
    playerName?: string;
    grade?: string;
    region?: string;
    requestType?: string;
    selectedQuestions?: string[];
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.playerName !== undefined) update.player_name = body.playerName.trim();
  if (body.grade !== undefined) update.grade = body.grade || null;
  if (body.region !== undefined) update.region = body.region || null;
  if (body.requestType !== undefined) update.request_type = body.requestType;
  if (body.selectedQuestions !== undefined) update.selected_questions = body.selectedQuestions;
  if (body.status !== undefined) {
    update.status = body.status;
    if (body.status === "sent") {
      update.sent_at = new Date().toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "업데이트할 필드가 없습니다" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("interview_requests")
    .update(update)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
  }

  const sb = createAdminClient();

  await sb.from("interview_articles").delete().eq("request_id", body.id);
  await sb.from("interview_responses").delete().eq("request_id", body.id);

  const { error } = await sb
    .from("interview_requests")
    .delete()
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
