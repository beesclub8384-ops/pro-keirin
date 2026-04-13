import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface InterviewQuestion {
  code: string;
  category: string;
  subcategory: string;
  question_text: string;
  format: string;
  choices: unknown | null;
  condition: unknown | null;
  requires_race_specific: boolean;
  requires_auto_generate: boolean;
  requires_player_explain: boolean;
  note: string | null;
}

async function main() {
  const filePath = path.join(process.cwd(), "src", "data", "interview-questions.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const questions: InterviewQuestion[] = JSON.parse(raw);

  console.log(`[seed] 총 ${questions.length}건의 질문을 upsert 합니다...`);

  let success = 0;
  let failed = 0;
  const failures: { code: string; error: string }[] = [];

  for (const q of questions) {
    const { error } = await supabase
      .from("interview_questions")
      .upsert(
        {
          code: q.code,
          category: q.category,
          subcategory: q.subcategory,
          question_text: q.question_text,
          format: q.format,
          choices: q.choices,
          condition: q.condition,
          requires_race_specific: q.requires_race_specific,
          requires_auto_generate: q.requires_auto_generate,
          requires_player_explain: q.requires_player_explain,
          note: q.note,
          is_active: true,
        },
        { onConflict: "code" },
      );

    if (error) {
      failed++;
      failures.push({ code: q.code, error: error.message });
      console.error(`  ✗ ${q.code}: ${error.message}`);
    } else {
      success++;
    }
  }

  console.log("");
  console.log(`[seed] 완료: 성공 ${success}건 / 실패 ${failed}건`);
  if (failures.length > 0) {
    console.log("[seed] 실패 목록:");
    for (const f of failures) console.log(`  - ${f.code}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[seed] 치명적 오류:", err);
  process.exit(1);
});
