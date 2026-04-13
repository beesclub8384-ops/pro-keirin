import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

interface ResponseInput {
  questionCode: string;
  questionText: string;
  answerText?: string | null;
  answerChoice?: string | null;
  photoUrls?: string[] | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const id = Number(requestId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid requestId" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: request, error: reqErr } = await sb
    .from("interview_requests")
    .select("id, player_name, grade, region, status, selected_questions")
    .eq("id", id)
    .maybeSingle();

  if (reqErr) {
    return NextResponse.json({ error: reqErr.message }, { status: 500 });
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
  if (request.status !== "sent" && request.status !== "in_progress") {
    return NextResponse.json(
      { error: `조회할 수 없는 상태입니다: ${request.status}` },
      { status: 403 },
    );
  }

  const codes: string[] = Array.isArray(request.selected_questions)
    ? request.selected_questions
    : [];

  const { data: questions, error: qErr } = await sb
    .from("interview_questions")
    .select("code, question_text, format, choices")
    .in("code", codes.length > 0 ? codes : [""]);

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const byCode = new Map(
    (questions ?? []).map((q) => [q.code as string, q]),
  );
  const ordered = codes
    .map((c) => byCode.get(c))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => ({
      code: q.code,
      questionText: q.question_text,
      format: q.format,
      choices: q.choices,
    }));

  return NextResponse.json({
    request: {
      id: request.id,
      playerName: request.player_name,
      grade: request.grade,
      region: request.region,
      status: request.status,
    },
    questions: ordered,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const id = Number(requestId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid requestId" }, { status: 400 });
  }

  let body: { responses?: ResponseInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const responses = body.responses;
  if (!Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json(
      { error: "responses 배열이 필요합니다" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  const { data: request, error: reqErr } = await sb
    .from("interview_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (reqErr) {
    return NextResponse.json({ error: reqErr.message }, { status: 500 });
  }
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

  const rows = responses.map((r) => ({
    request_id: id,
    question_code: r.questionCode,
    question_text: r.questionText,
    answer_text: r.answerText ?? null,
    answer_choice: r.answerChoice ?? null,
    photo_urls: r.photoUrls ?? null,
  }));

  const { error: insErr } = await sb.from("interview_responses").insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { error: updErr } = await sb
    .from("interview_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
