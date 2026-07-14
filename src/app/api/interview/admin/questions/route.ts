import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function GET(req: Request) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null) as {
    originalCode?: string;
    questionText?: string;
    category?: string;
    subcategory?: string;
    isCustom?: boolean;
  } | null;

  if (!body?.questionText?.trim()) {
    return NextResponse.json(
      { error: "questionText 필수" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();
  const ts = Math.floor(Date.now() / 1000);
  const newCode = body.originalCode
    ? `${body.originalCode}-custom-${ts}`
    : `custom-${ts}-${Math.floor(Math.random() * 1000)}`;
  const category = body.category || "C";
  const subcategory = body.subcategory || "C-custom";

  const { data, error } = await sb
    .from("interview_questions")
    .insert({
      code: newCode,
      category,
      subcategory,
      question_text: body.questionText.trim(),
      format: "text",
      parent_code: body.originalCode || null,
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
