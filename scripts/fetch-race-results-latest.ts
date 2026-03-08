// ============================================================
// 최신 경주결과 수집 + Supabase 시딩 CLI 스크립트
// 사용법:
//   npx tsx scripts/fetch-race-results-latest.ts
//   npx tsx scripts/fetch-race-results-latest.ts --date 2026-03-08
//   npx tsx scripts/fetch-race-results-latest.ts --date today
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { fetchAndSeedLatestResults } from "../src/lib/race-results-latest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseDateArg(): string | undefined {
  const idx = process.argv.indexOf("--date");
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val) {
    console.error("ERROR: --date 값이 필요합니다 (YYYY-MM-DD 또는 today)");
    process.exit(1);
  }
  if (val === "today") {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    console.error("ERROR: 날짜 형식이 잘못됨:", val);
    process.exit(1);
  }
  return val;
}

async function main() {
  const date = parseDateArg();

  if (date) {
    console.log(`날짜 지정: ${date}`);
  } else {
    console.log("오늘 날짜 자동 수집...");
  }

  const result = await fetchAndSeedLatestResults(supabase, {
    date,
    apiKey: process.env.DATA_GO_KR_API_KEY,
  });

  if (result.success) {
    console.log(`\n성공: ${result.date}`);
    console.log(`  경주: ${result.racesCount}개, 선수: ${result.resultsCount}명, 배당: ${result.oddsCount}건`);
  } else {
    console.log(`\n실패: ${result.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
