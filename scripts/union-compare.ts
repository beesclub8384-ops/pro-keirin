/**
 * 노조별 출전 선수 비교 스크립트 (페이지네이션 완전 적용)
 *
 * 그룹 분류:
 *   비파업_프로경륜  = CSV 217명 중 출전자
 *   비파업_비조합원  = 별도 10명 중 출전자
 *   파업_한국경륜    = 나머지
 *   미분류          = 어디에도 안 걸리는 이름 (있으면 출력)
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!.trim()
);

// ─── 페이지네이션 헬퍼 ───
async function fetchAll<T>(buildQuery: () => any): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ─── 1. CSV → 프로경륜 217명 ───
function extractProUnionFromCSV(): Set<string> {
  const csv = fs.readFileSync(
    "C:/Users/win10/Downloads/프로경륜선수노동조합명단(고어택스 추가).csv",
    "utf-8"
  );
  const nameRe = /^[가-힣]{2,5}$/;
  const exclude = new Set([
    "위원장","부위원장","대위원","감사","사무국장","설립일","노태양",
    "금정","청평","동서울","김포","수성","광명","개인",
    "창원A","동광주","김해B","청주","대전도안","세종","충남계룡",
    "메달리스트","코어택스","추가","인원","사이즈",
    "가평","강원개인","경기개인","경남개인","경북개인","광주개인","광주","구미",
    "김해","대구","대전","미원","부산","북광주","서울","신사","월평","유성",
    "의정부","인천","인천검단","일산","전주","진주","창원","팔당",
    "충북개인","충남개인","서울개인","대전개인","부산개인",
    "경기양주","경남진해","창원상남","창원성산","창원의창",
    "대전학하","서울한남","인천개인","김해장유",
  ]);
  const names = new Set<string>();
  for (const line of csv.split("\n")) {
    for (const cell of line.split(",")) {
      const t = cell.trim();
      if (t && nameRe.test(t) && !exclude.has(t)) names.add(t);
    }
  }
  return names;
}

// ─── 2. 비조합원 10명 ───
const nonUnion = new Set([
  "강동규","장인석","김원호","류근철","김현","이정운",
  "박종현","김이남","김규봉","박제원",
]);

// ─── 3. 연도별 출전 선수 이름 조회 (페이지네이션 완전 적용) ───
async function getYearlyRacerNames(year: number): Promise<Set<string>> {
  // pages
  const pages = await fetchAll<{ id: number }>(
    () => sb.from("decision_card_pages").select("id").eq("year", year)
  );
  if (pages.length === 0) return new Set();
  const pageIds = pages.map((p) => p.id);

  // races (chunk 200 + pagination)
  const allRaceIds: number[] = [];
  for (let i = 0; i < pageIds.length; i += 200) {
    const chunk = pageIds.slice(i, i + 200);
    const races = await fetchAll<{ id: number }>(
      () => sb.from("decision_card_races").select("id").in("page_id", chunk)
    );
    allRaceIds.push(...races.map((r) => r.id));
  }

  // entries → distinct racer_id (chunk 200 + pagination)
  const racerIdSet = new Set<string>();
  for (let i = 0; i < allRaceIds.length; i += 200) {
    const chunk = allRaceIds.slice(i, i + 200);
    const entries = await fetchAll<{ racer_id: string }>(
      () =>
        sb
          .from("decision_card_entries")
          .select("racer_id")
          .in("dc_race_id", chunk)
          .not("racer_id", "is", null)
    );
    for (const e of entries) if (e.racer_id) racerIdSet.add(e.racer_id);
  }

  // racer_id → name (해당 연도 우선, fallback 최신 연도)
  const racerIds = [...racerIdSet];
  const nameMap = new Map<string, string>();

  for (let i = 0; i < racerIds.length; i += 200) {
    const chunk = racerIds.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () =>
        sb
          .from("racer_ids")
          .select("racer_id, name")
          .eq("year", year)
          .in("racer_id", chunk)
    );
    for (const r of rows) nameMap.set(r.racer_id, r.name);
  }

  const missing = racerIds.filter((id) => !nameMap.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const rows = await fetchAll<{ racer_id: string; name: string }>(
      () =>
        sb
          .from("racer_ids")
          .select("racer_id, name")
          .in("racer_id", chunk)
          .order("year", { ascending: false })
    );
    for (const r of rows) if (!nameMap.has(r.racer_id)) nameMap.set(r.racer_id, r.name);
  }

  // "김  현" 같은 공백 이름 정규화
  return new Set([...nameMap.values()].map((n) => n.replace(/\s+/g, "")));
}

// ─── main ───
const jsonMode = process.argv.includes("--json");

async function main() {
  const proUnion = extractProUnionFromCSV();
  const jsonResult: Record<string, { pro: string[]; non: string[]; han: string[] }> = {};

  if (!jsonMode) {
    console.log(`프로경륜 명단: ${proUnion.size}명`);
    console.log(`비조합원 명단: ${nonUnion.size}명\n`);
  }

  for (const year of [2022, 2023, 2024, 2025]) {
    const allNames = await getYearlyRacerNames(year);

    const grpPro: string[] = [];
    const grpNon: string[] = [];
    const grpHan: string[] = [];
    const grpUnk: string[] = [];

    for (const name of [...allNames].sort()) {
      if (proUnion.has(name)) grpPro.push(name);
      else if (nonUnion.has(name)) grpNon.push(name);
      else grpHan.push(name);
    }

    jsonResult[String(year)] = { pro: grpPro, non: grpNon, han: grpHan };

    if (!jsonMode) {
      const total = grpPro.length + grpNon.length + grpHan.length;
      if (total !== allNames.size) grpUnk.push(`(합산 불일치: ${total} vs ${allNames.size})`);

      console.log("=".repeat(60));
      console.log(`${year}년  전체 출전: ${allNames.size}명`);
      console.log("-".repeat(60));
      console.log(`  비파업_프로경륜: ${grpPro.length}명`);
      console.log(`    ${grpPro.join(", ")}`);
      console.log(`  비파업_비조합원: ${grpNon.length}명`);
      console.log(`    ${grpNon.join(", ")}`);
      console.log(`  파업_한국경륜:   ${grpHan.length}명`);
      console.log(`    ${grpHan.join(", ")}`);
      if (grpUnk.length > 0) console.log(`  미분류: ${grpUnk.join(", ")}`);

      const proMissing = [...proUnion].filter((n) => !allNames.has(n)).sort();
      console.log(`  프로경륜 미출전: ${proMissing.length}명`);
      if (proMissing.length > 0) console.log(`    ${proMissing.join(", ")}`);
      const nonMissing = [...nonUnion].filter((n) => !allNames.has(n)).sort();
      console.log(`  비조합원 미출전: ${nonMissing.length}명`);
      if (nonMissing.length > 0) console.log(`    ${nonMissing.join(", ")}`);
      console.log();
    }
  }

  if (jsonMode) {
    const outPath = path.resolve(process.cwd(), "scripts/union-compare-result.json");
    fs.writeFileSync(outPath, JSON.stringify(jsonResult, null, 2), "utf-8");
    console.log(outPath);
  }
}

main().catch(console.error);
