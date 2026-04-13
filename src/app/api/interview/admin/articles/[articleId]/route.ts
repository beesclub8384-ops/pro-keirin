import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type Params = { params: Promise<{ articleId: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_req: Request, { params }: Params) {
  const { articleId } = await params;
  const id = parseId(articleId);
  if (id === null) {
    return NextResponse.json({ error: "invalid articleId" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: article, error } = await sb
    .from("interview_articles")
    .select(
      "id, request_id, player_name, grade, region, article_raw, article_edited, headline, photos, analysis_note, status, reject_reason, published_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!article) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: responses, error: respErr } = await sb
    .from("interview_responses")
    .select("id, question_code, question_text, answer_text, answer_choice, photo_urls")
    .eq("request_id", article.request_id)
    .order("id", { ascending: true });

  if (respErr) {
    return NextResponse.json({ error: respErr.message }, { status: 500 });
  }

  return NextResponse.json({
    article: {
      id: article.id,
      requestId: article.request_id,
      playerName: article.player_name,
      grade: article.grade,
      region: article.region,
      articleRaw: article.article_raw,
      articleEdited: article.article_edited,
      headline: article.headline,
      photos: article.photos,
      analysisNote: article.analysis_note,
      status: article.status,
      rejectReason: article.reject_reason,
      publishedAt: article.published_at,
      createdAt: article.created_at,
      updatedAt: article.updated_at,
    },
    responses: (responses ?? []).map((r) => ({
      id: r.id,
      questionCode: r.question_code,
      questionText: r.question_text,
      answerText: r.answer_text,
      answerChoice: r.answer_choice,
      photoUrls: r.photo_urls,
    })),
  });
}

export async function PUT(req: Request, { params }: Params) {
  const { articleId } = await params;
  const id = parseId(articleId);
  if (id === null) {
    return NextResponse.json({ error: "invalid articleId" }, { status: 400 });
  }

  let body: { articleEdited?: string; headline?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("interview_articles")
    .update({
      article_edited: body.articleEdited ?? null,
      headline: body.headline ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: Request, { params }: Params) {
  const { articleId } = await params;
  const id = parseId(articleId);
  if (id === null) {
    return NextResponse.json({ error: "invalid articleId" }, { status: 400 });
  }

  let body: { status?: string; rejectReason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const status = body.status;
  const allowed = ["approved", "rejected", "published", "review"];
  if (!status || !allowed.includes(status)) {
    return NextResponse.json(
      { error: `status는 ${allowed.join(", ")} 중 하나여야 합니다` },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "rejected") {
    update.reject_reason = body.rejectReason ?? null;
  }
  if (status === "published") {
    update.published_at = new Date().toISOString();
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("interview_articles")
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
