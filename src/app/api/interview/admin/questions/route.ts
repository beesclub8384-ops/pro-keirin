import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("interview_questions")
    .select(
      "code, category, subcategory, question_text, format, choices, requires_auto_generate",
    )
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const questions = (data ?? []).map((q) => ({
    code: q.code,
    category: q.category,
    subcategory: q.subcategory,
    questionText: q.question_text,
    format: q.format,
    choices: q.choices,
    requiresAutoGenerate: q.requires_auto_generate,
  }));
  return NextResponse.json({ questions });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    originalCode?: string;
    questionText?: string;
    category?: string;
    subcategory?: string;
  } | null;

  if (!body?.originalCode || !body.questionText || !body.category || !body.subcategory) {
    return NextResponse.json(
      { error: "originalCode, questionText, category, subcategory 필수" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const newCode = `${body.originalCode}-custom-${Math.floor(Date.now() / 1000)}`;

  const { data, error } = await sb
    .from("interview_questions")
    .insert({
      code: newCode,
      category: body.category,
      subcategory: body.subcategory,
      question_text: body.questionText,
      format: "text",
      parent_code: body.originalCode,
      is_custom: true,
      is_active: true,
    })
    .select("code, category, subcategory, question_text, format, choices")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    question: {
      code: data.code,
      category: data.category,
      subcategory: data.subcategory,
      questionText: data.question_text,
      format: data.format,
      choices: data.choices,
    },
  });
}
