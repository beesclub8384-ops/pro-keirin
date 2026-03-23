// ============================================================
// 판정 상세(violations) 소급 수집 스크립트
// 사용법: npx tsx scripts/backfill-violations.ts
// races 테이블에서 2022-01-01 이후 경주를 조회하고
// kcycle 경주결과 상세 페이지에서 violations만 파싱하여 upsert
// ============================================================

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 ANON_KEY)가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DELAY_MS = 500;
const BATCH_SIZE = 200;

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// --- 타입 ---
interface Violation {
  backNo: number;
  name: string;
  timing: string;
  location: string;
  article: string;
  paragraph: string;
  clause: string;
  judgment: string;
}

interface RaceInfo {
  id: number;
  year: number;
  round: number;
  day: number;
  race_no: number;
  date: string;
}

// --- kcycle HTML 파싱 (violations만) ---
function parseViolations(html: string): Violation[] {
  const violations: Violation[] = [];
  const violationIdx = html.indexOf("위반시기");
  if (violationIdx === -1) return violations;

  const afterViolation = html.substring(violationIdx);
  const tbodyMatch = afterViolation.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return violations;

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  for (const tr of trs) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(m => decodeHtmlEntities(m[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));

    if (cells.length < 7) continue;

    const vNameMatch = cells[0].match(/^(\d+)\s+(.+)/);
    if (!vNameMatch) continue;

    violations.push({
      backNo: parseInt(vNameMatch[1]),
      name: vNameMatch[2].trim(),
      timing: cells[1] || "",
      location: cells[2] || "",
      article: cells[3] || "",
      paragraph: cells[4] || "",
      clause: cells[5] || "",
      judgment: cells[6] || "",
    });
  }

  return violations;
}

// --- kcycle fetch ---
async function fetchRaceDetailHtml(year: number, round: number, day: number, raceNo: number): Promise<string> {
  const paddedRaceNo = String(raceNo).padStart(2, "0");
  const url = `https://www.kcycle.or.kr/race/result/general/${year}/${round}/${day}/001/${paddedRaceNo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// --- 메인 ---
async function main() {
  console.log("=== violations 소급 수집 시작 (2022-01-01~) ===\n");

  // 1. races 테이블에서 대상 경주 조회
  const PAGE = 1000;
  let allRaces: RaceInfo[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("races")
      .select("id, year, round, day, race_no, date")
      .gte("date", "2022-01-01")
      .order("date", { ascending: true })
      .order("race_no", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`races 조회 에러: ${error.message}`);
    if (!data || data.length === 0) break;
    allRaces = allRaces.concat(data as RaceInfo[]);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`대상 경주: ${allRaces.length}건\n`);

  // 2. 이미 수집된 violations의 race_id 확인 (스킵용)
  const existingSet = new Set<number>();
  offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("violations")
      .select("race_id")
      .range(offset, offset + PAGE - 1);

    if (error) break;
    if (!data || data.length === 0) break;
    for (const row of data) {
      existingSet.add(row.race_id);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`이미 수집된 violations race_id: ${existingSet.size}건\n`);

  // 3. 경주별 violations 수집
  let totalViolations = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < allRaces.length; i++) {
    const race = allRaces[i];

    // 이미 수집된 경주 스킵
    if (existingSet.has(race.id)) {
      skipped++;
      continue;
    }

    try {
      const html = await fetchRaceDetailHtml(race.year, race.round, race.day, race.race_no);
      const violations = parseViolations(html);

      // 실격/경고만 필터
      const filtered = violations.filter(v => v.judgment === "실격" || v.judgment === "경고" || v.judgment === "주의");

      if (filtered.length > 0) {
        const rows = filtered.map(v => ({
          race_id: race.id,
          back_no: v.backNo,
          name: v.name,
          violation_time: v.timing || null,
          violation_place: v.location || null,
          article: v.article || null,
          paragraph: v.paragraph || null,
          clause: v.clause || null,
          judgment: v.judgment || null,
        }));

        const { error } = await supabase
          .from("violations")
          .upsert(rows, { onConflict: "race_id,back_no,judgment" });

        if (error) {
          console.error(`  upsert 에러 (${race.date} ${race.race_no}R): ${error.message}`);
          errors++;
        } else {
          totalViolations += rows.length;
        }
      }

      // 진행 로그 (100건마다 또는 마지막)
      if ((i + 1) % 100 === 0 || i === allRaces.length - 1) {
        console.log(`  ${i + 1}/${allRaces.length}: violations ${totalViolations}건 저장, 스킵 ${skipped}건, 에러 ${errors}건`);
      }

      await delay(DELAY_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR (${race.date} ${race.round}회${race.day}일 ${race.race_no}R): ${msg}`);
      errors++;
      await delay(DELAY_MS * 2);
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`총 경주: ${allRaces.length}건`);
  console.log(`스킵 (이미 수집): ${skipped}건`);
  console.log(`violations 저장: ${totalViolations}건`);
  console.log(`에러: ${errors}건`);
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
