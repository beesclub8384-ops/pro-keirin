// ============================================================
// 최신 확정출주표 수집 + Supabase 시딩 CLI 스크립트
// 사용법:
//   npx tsx scripts/fetch-decision-card-latest.ts
//   npx tsx scripts/fetch-decision-card-latest.ts --round 11 --day 1
//   npx tsx scripts/fetch-decision-card-latest.ts --round 11 --day 1 --year 2026
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { fetchAndSeedLatest } from "../src/lib/decision-card-latest";

// Supabase 클라이언트: SERVICE_ROLE_KEY 우선, 없으면 ANON_KEY fallback
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CLI 옵션 파싱
function parseArgs(): { round?: number; day?: number; year?: number } {
  const args = process.argv.slice(2);
  const opts: { round?: number; day?: number; year?: number } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--round" && args[i + 1]) {
      opts.round = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--day" && args[i + 1]) {
      opts.day = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--year" && args[i + 1]) {
      opts.year = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return opts;
}

async function main() {
  const opts = parseArgs();

  if (opts.round && opts.day) {
    console.log(`수동 지정: ${opts.year || "올해"} ${opts.round}회차 ${opts.day}일차`);
  } else {
    console.log("자동 타겟 결정 모드...");
  }

  const result = await fetchAndSeedLatest(supabase, opts);

  if (result.success) {
    console.log(`\n성공: ${result.year}년 ${result.round}회차 ${result.day}일차 (${result.date})`);
    console.log(`  경주: ${result.racesCount}개, 선수: ${result.entriesCount}명`);
  } else {
    console.log(`\n실패: ${result.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
