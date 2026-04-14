/**
 * fetch-special-rounds.ts
 *
 * decision_card_races 테이블에서 특별경주 회차를 추출하여
 * special_rounds 테이블에 저장하는 스크립트.
 *
 * 실행: npx tsx scripts/fetch-special-rounds.ts
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SpecialRoundRow {
  year: number;
  round: number;
  types: string[];
}

interface SpecialRound {
  year: number;
  round: number;
  race_type: string;
  source: string;
  note: string | null;
}

/**
 * race_type 배열을 보고 특별경주 종류를 분류한다.
 */
function classify(types: string[]): { race_type: string; note: string | null } | null {
  const joined = types.join(",");

  // 1) 그랑프리결승 포함 → 그랑프리GP
  if (types.some((t) => t.includes("그랑프리결승"))) {
    return { race_type: "그랑프리GP", note: null };
  }

  // 2) 특별결승 포함 → 대상GII 또는 왕중왕GI (구분 불가)
  if (types.some((t) => t === "특별결승")) {
    return { race_type: "대상GII_or_왕중왕GI", note: "수동확인필요 - 특별결승 포함" };
  }

  // 3) 특별특선 포함 → 대상/왕중왕 계열 (특선급 특별경주)
  if (types.some((t) => t === "특별특선")) {
    return { race_type: "대상GII_or_왕중왕GI", note: "수동확인필요 - 특별특선 포함" };
  }

  // 4) 특별우수 포함 → 대상/왕중왕 계열 (우수급 특별경주)
  if (types.some((t) => t === "특별우수")) {
    return { race_type: "대상GII_or_왕중왕GI", note: "수동확인필요 - 특별우수 포함" };
  }

  // 5) '특별' 단독 → 대상/왕중왕 예선 가능성
  if (types.some((t) => t === "특별")) {
    return { race_type: "대상GII_or_왕중왕GI", note: "수동확인필요 - 특별 경주 포함" };
  }

  // 6) 준결+특우 조합 (그랑프리결승 없이) → 2015~2016 그랑프리 패턴
  if (types.includes("준결") && types.includes("특우")) {
    return { race_type: "그랑프리GP", note: "수동확인필요 - 준결+특우 패턴 (그랑프리결승 라벨 없음)" };
  }

  // 7) 준결 계열만 (선발준결/우수준결/특선준결) → 일반 등급 준결승, 스킵
  const onlySemiFinals = types.every((t) =>
    ["선발준결", "우수준결", "특선준결"].includes(t)
  );
  if (onlySemiFinals) {
    return null; // 일반 준결승 — 특별경주 아님
  }

  // 기타
  return { race_type: "미분류", note: `수동확인필요 - types: ${joined}` };
}

async function main() {
  console.log("=== 특별경주 회차 추출 시작 ===\n");

  // Step 1: 모든 decision_card_pages (2015~2025) 가져오기
  console.log("1. decision_card_pages 조회 중...");
  let allPages: { id: number; year: number; round: number; day: number }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("decision_card_pages")
      .select("id, year, round, day")
      .gte("year", 2015)
      .lte("year", 2025)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    allPages = [...allPages, ...data];
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  → ${allPages.length}개 페이지 조회됨`);

  // Step 2: 해당 페이지의 race_type 중 특별경주 패턴 조회
  console.log("2. decision_card_races에서 특별경주 race_type 조회 중...");
  const pageIds = allPages.map((p) => p.id);
  const specialTypes = [
    "그랑프리결승",
    "특별결승",
    "특별특선",
    "특별우수",
    "특별",
    "특우",
    "준결",
    "선발준결",
    "우수준결",
    "특선준결",
  ];

  let allRaces: { page_id: number; race_type: string }[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("decision_card_races")
      .select("page_id, race_type")
      .in("page_id", pageIds)
      .in("race_type", specialTypes)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    allRaces = [...allRaces, ...data];
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  → ${allRaces.length}개 특별 race_type 행 조회됨`);

  // Step 3: page_id → (year, round) 매핑 + race_type 그룹핑
  const pageMap = new Map<number, { year: number; round: number }>();
  for (const p of allPages) {
    pageMap.set(p.id, { year: p.year, round: p.round });
  }

  const groupKey = (year: number, round: number) => `${year}-${round}`;
  const grouped = new Map<string, { year: number; round: number; types: Set<string> }>();

  for (const race of allRaces) {
    const page = pageMap.get(race.page_id);
    if (!page) continue;
    const key = groupKey(page.year, page.round);
    if (!grouped.has(key)) {
      grouped.set(key, { year: page.year, round: page.round, types: new Set() });
    }
    grouped.get(key)!.types.add(race.race_type);
  }

  // Step 4: 분류
  console.log("\n3. 분류 중...\n");
  const results: SpecialRound[] = [];
  const skipped: { year: number; round: number; types: string[] }[] = [];

  const sorted = [...grouped.values()].sort(
    (a, b) => a.year - b.year || a.round - b.round
  );

  for (const { year, round, types } of sorted) {
    const typesArr = [...types];
    const classified = classify(typesArr);
    if (classified) {
      results.push({
        year,
        round,
        race_type: classified.race_type,
        source: "auto",
        note: classified.note,
      });
    } else {
      skipped.push({ year, round, types: typesArr });
    }
  }

  console.log(`분류 완료: ${results.length}개 특별경주, ${skipped.length}개 일반 준결승 스킵`);

  // Step 5: special_rounds에 upsert
  console.log("\n4. special_rounds 테이블에 upsert 중...");

  // 기존 데이터 삭제 후 삽입 (source='auto'인 것만)
  const { error: deleteError } = await supabase
    .from("special_rounds")
    .delete()
    .eq("source", "auto");
  if (deleteError) throw deleteError;

  if (results.length > 0) {
    const { error: insertError } = await supabase
      .from("special_rounds")
      .insert(results);
    if (insertError) throw insertError;
  }

  console.log(`  → ${results.length}개 행 저장 완료`);

  // Step 6: 결과 출력
  console.log("\n===== 특별경주 회차 결과 =====\n");
  console.log(
    "연도  | 회차 | 분류                    | 비고"
  );
  console.log(
    "------|------|-------------------------|------------------------------"
  );
  for (const r of results) {
    const y = String(r.year).padEnd(4);
    const rd = String(r.round).padStart(3).padEnd(4);
    const rt = r.race_type.padEnd(23);
    const note = r.note || "";
    console.log(`${y}  | ${rd} | ${rt} | ${note}`);
  }

  console.log(`\n총 ${results.length}개 특별경주 회차 저장됨`);

  if (skipped.length > 0) {
    console.log(`\n--- 스킵된 일반 준결승 (${skipped.length}개) ---`);
    for (const s of skipped) {
      console.log(`  ${s.year} R${s.round}: ${s.types.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error("에러 발생:", err);
  process.exit(1);
});
