// ============================================================
// 경주 일정 시딩 스크립트
// race-schedule-{year}.json → Supabase race_schedule 테이블
// 사용법: npx tsx scripts/seed/seed-race-schedule.ts [year]
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATA_DIR = path.join(process.cwd(), "src", "data");

async function seedRaceSchedule() {
  // 특정 연도 또는 모든 race-schedule-*.json
  const targetYear = process.argv[2];
  const files = targetYear
    ? [`race-schedule-${targetYear}.json`]
    : fs
        .readdirSync(DATA_DIR)
        .filter((f) => f.match(/^race-schedule-\d{4}\.json$/))
        .sort();

  if (files.length === 0) {
    console.log("시딩할 race-schedule 파일이 없습니다.");
    return;
  }

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`파일 없음: ${filePath}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const schedule = data.schedule as Array<{
      date: string;
      round: number;
      day: number;
    }>;
    const year = data.year as number;

    console.log(`${year}년: ${schedule.length}일 시딩...`);

    const rows = schedule.map((s) => ({
      year,
      date: s.date,
      round: s.round,
      day: s.day,
    }));

    const { error } = await supabase
      .from("race_schedule")
      .upsert(rows, { onConflict: "year,round,day" });

    if (error) {
      console.error(`  오류: ${error.message}`);
    } else {
      console.log(`  ${rows.length}건 완료`);
    }
  }

  console.log("Done.");
}

seedRaceSchedule().catch(console.error);
