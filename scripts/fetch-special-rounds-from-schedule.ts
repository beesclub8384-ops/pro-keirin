/**
 * fetch-special-rounds-from-schedule.ts
 *
 * kcycle 경주 일정 페이지에서 특별경주(대상GII/왕중왕GI/그랑프리GP) 회차를
 * 크롤링하여 Supabase special_rounds 테이블에 저장하는 스크립트.
 *
 * URL: https://www.kcycle.or.kr/race/schedule/{year}
 * 파란색(code=2) 표시 날짜가 특별경주임.
 *
 * 실행: npx tsx scripts/fetch-special-rounds-from-schedule.ts
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import https from "https";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i); // 2015~2025
const DELAY_MS = 500;

interface ScheduleEntry {
  year: number;
  round: number;
  name: string;
}

interface SpecialRound {
  year: number;
  round: number;
  race_type: string;
  source: string;
  note: string | null;
}

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    };
    https.get(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * HTML에서 code=2 (파란색/특별경주) 항목 추출
 */
function parseSpecialEntries(html: string, year: number): ScheduleEntry[] {
  // fnScheduleOpen(this, &quot;2&quot;, &quot;DATE&quot;, &quot;ROUND_INFO&quot;, &quot;NAME&quot;)
  const re =
    /fnScheduleOpen\(this, &quot;2&quot;, &quot;([^&]+)&quot;, &quot;([^&]+)&quot;, &quot;([^&]*)&quot;\)/g;
  let m: RegExpExecArray | null;
  const entries: ScheduleEntry[] = [];

  while ((m = re.exec(html)) !== null) {
    const decodeUnicode = (s: string) =>
      s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );

    const roundInfo = decodeUnicode(m[2]); // e.g. "제07회차 01일째"
    const name = decodeUnicode(m[3]); // e.g. "스포츠서울배"

    // 회차 번호 추출
    const roundMatch = roundInfo.match(/(\d+)\s*회차/);
    if (!roundMatch) continue;
    const round = parseInt(roundMatch[1], 10);

    entries.push({ year, round, name });
  }

  return entries;
}

/**
 * 경주 이름으로 특별경주 종류 분류
 */
function classifyRaceType(name: string): string {
  const lower = name.toLowerCase();

  // 1) 그랑프리 (문화체육관광부 장관배 포함)
  if (lower.includes("그랑프리") || lower.includes("장관배")) {
    return "그랑프리GP";
  }

  // 2) 왕중왕
  if (lower.includes("왕중왕")) {
    return "왕중왕GI";
  }

  // 3) 나머지 code=2(파란색)은 대상경륜
  //    (대상경륜, 스포츠서울배, 스포츠조선배, 이사장배, 스포츠동아배, 일간스포츠배,
  //     최강자전, 스타전 등)
  return "대상GII";
}

async function main() {
  console.log("=== kcycle 일정 페이지 특별경주 크롤링 시작 ===\n");

  const allEntries: ScheduleEntry[] = [];

  for (const year of YEARS) {
    const url = `https://www.kcycle.or.kr/race/schedule/${year}`;
    process.stdout.write(`${year}년 조회 중... `);

    try {
      const html = await fetchPage(url);

      if (html.includes("400 Bad Request") || html.length < 5000) {
        console.log(`스킵 (데이터 없음, ${html.length} bytes)`);
        await sleep(DELAY_MS);
        continue;
      }

      const entries = parseSpecialEntries(html, year);

      // 회차별 중복 제거 (같은 회차의 여러 일차 → 하나만)
      const uniqueRounds = new Map<number, ScheduleEntry>();
      for (const e of entries) {
        if (!uniqueRounds.has(e.round)) {
          uniqueRounds.set(e.round, e);
        }
      }

      const unique = [...uniqueRounds.values()];
      allEntries.push(...unique);
      console.log(`${unique.length}개 특별경주 회차 발견`);
    } catch (err) {
      console.log(`에러: ${(err as Error).message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n총 ${allEntries.length}개 특별경주 회차 추출됨\n`);

  // 분류
  const results: SpecialRound[] = allEntries.map((e) => ({
    year: e.year,
    round: e.round,
    race_type: classifyRaceType(e.name),
    source: "schedule",
    note: e.name,
  }));

  // special_rounds에 upsert (source='schedule'인 것만 교체)
  console.log("special_rounds 테이블에 upsert 중...");

  // 기존 데이터 전체 삭제 (schedule 소스가 더 정확하므로 auto 포함 교체)
  const { error: deleteError } = await supabase
    .from("special_rounds")
    .delete()
    .in("source", ["auto", "schedule"]);
  if (deleteError) throw deleteError;

  if (results.length > 0) {
    const { error: insertError } = await supabase
      .from("special_rounds")
      .insert(results);
    if (insertError) throw insertError;
  }

  console.log(`  → ${results.length}개 행 저장 완료\n`);

  // 결과 출력
  console.log("===== 특별경주 회차 결과 (kcycle 일정 기준) =====\n");
  console.log(
    "연도 | 회차 | 분류         | 경주명"
  );
  console.log(
    "-----|------|-------------|----------------------------------------"
  );
  for (const r of results) {
    const y = String(r.year);
    const rd = String(r.round).padStart(3);
    const rt = r.race_type.padEnd(13);
    console.log(`${y} | ${rd}  | ${rt} | ${r.note}`);
  }

  // 요약
  const summary = new Map<string, number>();
  for (const r of results) {
    summary.set(r.race_type, (summary.get(r.race_type) || 0) + 1);
  }
  console.log("\n--- 요약 ---");
  for (const [type, count] of summary) {
    console.log(`  ${type}: ${count}개`);
  }
  console.log(`  총: ${results.length}개`);
}

main().catch((err) => {
  console.error("에러 발생:", err);
  process.exit(1);
});
