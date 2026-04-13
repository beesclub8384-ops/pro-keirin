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
