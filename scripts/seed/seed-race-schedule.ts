// ============================================================
// 경주 일정 시딩 스크립트
// 1) race_schedule 테이블 생성 (없으면)
// 2) race-schedule-{year}.json → Supabase race_schedule 테이블
// 사용법: npx tsx scripts/seed/seed-race-schedule.ts [year]
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_DIR = path.join(process.cwd(), "src", "data");

async function ensureTable() {
  // 테이블 존재 여부 확인: 간단한 select 시도
  const { error } = await supabase
    .from("race_schedule")
    .select("id")
    .limit(1);

  if (error && error.message.includes("does not exist")) {
    console.log("race_schedule 테이블이 없습니다. 생성 중...");

    // Supabase SQL endpoint (service role key로 직접 호출)
    const sqlUrl = `${supabaseUrl}/rest/v1/rpc/`;
    // PostgREST로는 DDL 실행 불가 → 대안: Supabase Management API 또는 수동 실행 필요
    console.error(
      "\n[ERROR] race_schedule 테이블을 자동 생성할 수 없습니다.\n" +
        "Supabase SQL Editor에서 다음 SQL을 먼저 실행해주세요:\n\n" +
        fs.readFileSync(
          path.join(process.cwd(), "scripts/migrations/create-race-schedule.sql"),
          "utf-8"
        )
    );
    process.exit(1);
  }

  if (error) {
    // 다른 종류의 에러는 무시 (테이블은 존재하지만 빈 경우 등)
    console.log("테이블 확인:", error.message);
  } else {
    console.log("race_schedule 테이블 확인 완료.");
  }
}

async function seedRaceSchedule() {
  await ensureTable();

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
      label?: string;
    }>;
    const year = data.year as number;

    // 중복 제거 (year,round,day 기준)
    const seen = new Set<string>();
    const unique = schedule.filter((s) => {
      const key = `${year}-${s.round}-${s.day}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`\n${year}년: ${schedule.length}일 → 중복 제거 후 ${unique.length}일 시딩...`);

    const rows = unique.map((s) => ({
      year,
      date: s.date,
      round: s.round,
      day: s.day,
      label: s.label || null,
    }));

    const { error } = await supabase
      .from("race_schedule")
      .upsert(rows, { onConflict: "year,round,day" });

    if (error) {
      console.error(`  오류: ${error.message}`);
    } else {
      console.log(`  ${rows.length}건 완료`);
    }

    // 검증: 시딩된 건수 확인
    const { count } = await supabase
      .from("race_schedule")
      .select("*", { count: "exact", head: true })
      .eq("year", year);
    console.log(`  DB 확인: ${year}년 ${count}건`);
  }

  console.log("\nDone.");
}

seedRaceSchedule().catch(console.error);
