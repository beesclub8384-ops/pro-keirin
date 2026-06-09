// ============================================================
// 선수 상세 프로필 데이터 수집 스크립트 (전체 연도, 중단 재개 지원)
// 사용법: npm run fetch-racer-profile
// kcycle.or.kr HTML 스크래핑
// Phase 1: 랭킹 페이지에서 racerId 목록 추출
// Phase 2: 각 선수 프로필 페이지 파싱
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface RacerProfile {
  racerId: string;
  name: string;
  year: number;
  // 신체정보 (.infoItem)
  birthYear: string;     // "73년 09월 15일"
  height: number;        // 175 (cm)
  weight: number;        // 85 (kg)
  bloodType: string;     // "O형"
  // Table 0: 기본 정보
  gradeChange: string;   // (전)SS -> (현)SS
  grade: string;         // gradeChange 파싱한 현재 등급 (예: "SS"). 빈 문자열 가능.
  winRate: number;        // 승률(%)
  top2Rate: number;       // 연대율(%)
  top3Rate: number;       // 삼연대율(%)
  raceCount: number;      // 출주횟수
  runDays: number;        // 출주일수
  // Table 1: 성적
  recent3Score: number;   // 최근3회 종합득점
  recent3Rank: number;    // 최근3회 종합순위
  totalAvgScore: number;  // 총 평균 득점
  totalRankScore: number; // 총 순위 득점
  recent200m: string;     // 최근 3경주 200m 최고기록
  training: string;       // 훈련지 / 동참훈련자
  // Table 2-3: 전술별 1-3위
  tactics: {
    preemptive: number[];  // 선행 [1위, 2위, 3위]
    push: number[];        // 젖히기 [1위, 2위, 3위]
    chase: number[];       // 추입 [1위, 2위, 3위]
    mark: number[];        // 마크 [1위, 2위, 3위]
  };
  // Table 4: 위반
  violations: {
    disqualification: number; // 실격행위
    warning: number;          // 경고행위
    caution: number;          // 주의행위
    fallWithdraw: number;     // 낙차기권
    fallEntry: number;        // 낙차입
    accidentWithdraw: number; // 사고기권
    accidentEntry: number;    // 사고입
  };
  // Table 6: 분석 지수
  indices: {
    preemptive: number;  // 선행지수
    push: number;        // 젖히기지수
    chase: number;       // 추입지수
    mark: number;        // 마크지수
  };
  // Table 7: 착순위 정보 (1-7위)
  finishPositions: number[];  // [1위, 2위, 3위, 4위, 5위, 6위, 7위]
  // Table 8: 전술 비율
  tacticRatios: {
    preemptive: string;  // "16(25.0%)"
    push: string;        // "19(29.7%)"
    chase: string;       // "27(42.2%)"
    mark: string;        // "2(3.1%)"
  };
}

interface YearProfiles {
  year: number;
  totalRacers: number;
  profiles: RacerProfile[];
}

// --- 설정 ---
const START_YEAR = parseInt(process.env.START_YEAR || "2003", 10);
const END_YEAR = parseInt(process.env.END_YEAR || "2026", 10);
const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

const DELAY_MS = 500;
const MAX_RETRIES = 3;
const YEARLY_DIR = path.join(__dirname, "..", "src", "data", "yearly-racer-profile");
const RACER_IDS_DIR = path.join(__dirname, "..", "src", "data", "racer-ids");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeNum(val: string): number {
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

function decodeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ==========================================================
// Phase 1: 랭킹 페이지에서 racerId 추출
// ==========================================================

interface RacerIdEntry {
  racerId: string;
  name: string;
  rank: number;
}

function parseRacerIdsFromRankingPage(html: string): { ids: RacerIdEntry[]; lastPage: number } {
  const ids: RacerIdEntry[] = [];

  // 페이지 번호
  const pageNums = [...html.matchAll(/fnSearch\((\d+)\)/g)].map(m => parseInt(m[1]));
  const lastPage = pageNums.length > 0 ? Math.max(...pageNums) : 1;

  // tbody에서 racerId 추출
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { ids, lastPage };

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    // racerId from onclick: fnRacer.popup("20190018", "2024")
    const idMatch = tr[1].match(/fnRacer\.popup\(&quot;(\d+)&quot;/);
    if (!idMatch) continue;

    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, "").trim());

    if (tds.length < 2) continue;

    ids.push({
      racerId: idMatch[1],
      name: tds[1] || "",
      rank: parseInt(tds[0]) || 0,
    });
  }

  return { ids, lastPage };
}

async function fetchRacerIdsForYear(year: number): Promise<RacerIdEntry[]> {
  const idsPath = path.join(RACER_IDS_DIR, `${year}.json`);
  if (fs.existsSync(idsPath)) {
    return JSON.parse(fs.readFileSync(idsPath, "utf-8"));
  }

  const allIds: RacerIdEntry[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const url = `https://www.kcycle.or.kr/racer/ranking/total/${year}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `pagination.currentPage=${page}`,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const result = parseRacerIdsFromRankingPage(html);
        success = true;

        if (page === 1) {
          lastPage = result.lastPage;
          if (result.ids.length === 0) {
            console.log(`  ${year}년: 랭킹 데이터 없음`);
            return [];
          }
        }

        allIds.push(...result.ids);
        page++;
        if (page <= lastPage) await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES - 1) {
          await delay((attempt + 1) * 3000);
        } else {
          console.error(`  ERROR 랭킹 페이지 ${page}: ${msg}`);
          page++;
        }
      }
    }
  }

  // 저장
  fs.writeFileSync(idsPath, JSON.stringify(allIds, null, 2), "utf-8");
  console.log(`  ${year}년 racerId ${allIds.length}명 추출`);
  return allIds;
}

// ==========================================================
// Phase 2: 프로필 페이지 파싱
// ==========================================================

function parseInfoItems(html: string): { birthYear: string; height: number; weight: number; bloodType: string } {
  const result = { birthYear: "", height: 0, weight: 0, bloodType: "" };

  // Extract all <b class="tit">...</b><i class="txt">...</i> pairs from infoItem
  const items = [...html.matchAll(/<b class="tit">([\s\S]*?)<\/b>\s*<i class="txt">([\s\S]*?)<\/i>/g)];
  for (const m of items) {
    const key = m[1].replace(/<[^>]*>/g, "").trim();
    const val = decodeHtml(m[2].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ");

    if (key === "출생년도") {
      result.birthYear = val;
    } else if (key.includes("신장") && key.includes("체중")) {
      const hm = val.match(/(\d+)\s*cm/);
      const wm = val.match(/(\d+)\s*kg/);
      if (hm) result.height = parseInt(hm[1]);
      if (wm) result.weight = parseInt(wm[1]);
    } else if (key === "혈액형") {
      result.bloodType = val;
    }
  }

  return result;
}

function parseProfile(html: string, racerId: string, name: string, year: number): RacerProfile | null {
  // 신체정보 파싱 (.infoItem)
  const bodyInfo = parseInfoItems(html);

  // 테이블 파싱
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  if (tables.length < 9) return null;

  function getTds(tableIdx: number): string[] {
    const table = tables[tableIdx][1];
    return [...table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " "));
  }

  // Table 0: 기본 정보
  const t0 = getTds(0);
  // Table 1: 성적
  const t1 = getTds(1);
  // Table 2: 선행/젖히기
  const t2 = getTds(2);
  // Table 3: 추입/마크
  const t3 = getTds(3);
  // Table 4: 위반
  const t4 = getTds(4);
  // Table 6: 분석 지수
  const t6 = getTds(6);
  // Table 7: 착순위
  const t7 = getTds(7);
  // Table 8: 전술 비율
  const t8 = getTds(8);

  return {
    racerId,
    name,
    year,
    // 신체정보
    birthYear: bodyInfo.birthYear,
    height: bodyInfo.height,
    weight: bodyInfo.weight,
    bloodType: bodyInfo.bloodType,
    // Table 0
    gradeChange: t0[0] || "",
    // gradeChange "(전)X -> (현)Y" / "(전)X ->(현)Y" 에서 현재 등급 Y만 추출
    grade: ((t0[0] || "").match(/\(현\)\s*([A-Z0-9]+)/)?.[1]) || "",
    winRate: safeNum(t0[1] || "0"),
    top2Rate: safeNum(t0[2] || "0"),
    top3Rate: safeNum(t0[3] || "0"),
    raceCount: safeNum(t0[4] || "0"),
    runDays: safeNum(t0[5] || "0"),
    // Table 1
    recent3Score: safeNum(t1[0] || "0"),
    recent3Rank: safeNum(t1[1] || "0"),
    totalAvgScore: safeNum(t1[2] || "0"),
    totalRankScore: safeNum(t1[3] || "0"),
    recent200m: (t1[4] || "").trim(),
    training: (t1[5] || "").trim(),
    // Table 2-3: 전술
    tactics: {
      preemptive: [safeNum(t2[0] || "0"), safeNum(t2[1] || "0"), safeNum(t2[2] || "0")],
      push: [safeNum(t2[3] || "0"), safeNum(t2[4] || "0"), safeNum(t2[5] || "0")],
      chase: [safeNum(t3[0] || "0"), safeNum(t3[1] || "0"), safeNum(t3[2] || "0")],
      mark: [safeNum(t3[3] || "0"), safeNum(t3[4] || "0"), safeNum(t3[5] || "0")],
    },
    // Table 4: 위반
    violations: {
      disqualification: safeNum(t4[0] || "0"),
      warning: safeNum(t4[1] || "0"),
      caution: safeNum(t4[2] || "0"),
      fallWithdraw: safeNum(t4[3] || "0"),
      fallEntry: safeNum(t4[4] || "0"),
      accidentWithdraw: safeNum(t4[5] || "0"),
      accidentEntry: safeNum(t4[6] || "0"),
    },
    // Table 6: 분석 지수 (t6[0]은 빈 셀, 실제 값은 [1]~[4])
    indices: {
      preemptive: safeNum(t6[1] || "0"),
      push: safeNum(t6[2] || "0"),
      chase: safeNum(t6[3] || "0"),
      mark: safeNum(t6[4] || "0"),
    },
    // Table 7: 착순위
    finishPositions: [
      safeNum(t7[0] || "0"), safeNum(t7[1] || "0"), safeNum(t7[2] || "0"),
      safeNum(t7[3] || "0"), safeNum(t7[4] || "0"), safeNum(t7[5] || "0"),
      safeNum(t7[6] || "0"),
    ],
    // Table 8: 전술 비율
    tacticRatios: {
      preemptive: (t8[0] || "").trim(),
      push: (t8[1] || "").trim(),
      chase: (t8[2] || "").trim(),
      mark: (t8[3] || "").trim(),
    },
  };
}

async function fetchProfilePage(racerId: string, year: number): Promise<string> {
  const url = `https://www.kcycle.or.kr/racer/info/popup/${racerId}/${year}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// --- Checkpoint ---
function getCheckpointPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.json`);
}

function getProgressPath(year: number): string {
  return path.join(YEARLY_DIR, `${year}.progress.json`);
}

function isYearDone(year: number): boolean {
  return fs.existsSync(getCheckpointPath(year)) && !fs.existsSync(getProgressPath(year));
}

function saveCheckpoint(year: number, data: YearProfiles): void {
  fs.writeFileSync(getCheckpointPath(year), JSON.stringify(data, null, 2), "utf-8");
}

function loadCheckpoint(year: number): YearProfiles | null {
  const p = getCheckpointPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function saveProgress(year: number, lastIdx: number, profiles: RacerProfile[]): void {
  fs.writeFileSync(
    getProgressPath(year),
    JSON.stringify({ lastIdx, count: profiles.length }),
    "utf-8"
  );
  saveCheckpoint(year, { year, totalRacers: profiles.length, profiles });
}

function loadProgress(year: number): { lastIdx: number } | null {
  const p = getProgressPath(year);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function clearProgress(year: number): void {
  const p = getProgressPath(year);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// --- 단일 연도 수집 ---
async function fetchYear(year: number): Promise<YearProfiles> {
  // Phase 1: racerId 추출
  const racerIds = await fetchRacerIdsForYear(year);
  if (racerIds.length === 0) {
    return { year, totalRacers: 0, profiles: [] };
  }

  console.log(`  ${year}년 선수 ${racerIds.length}명 프로필 수집 시작`);

  // Phase 2: 프로필 수집
  let startIdx = 0;
  let profiles: RacerProfile[] = [];

  const progress = loadProgress(year);
  if (progress) {
    startIdx = progress.lastIdx + 1;
    const existing = loadCheckpoint(year);
    if (existing) profiles = existing.profiles;
    console.log(`  이전 진행 재개: ${startIdx}/${racerIds.length} (수집: ${profiles.length}명)`);
  }

  let failCount = 0;

  for (let i = startIdx; i < racerIds.length; i++) {
    const racer = racerIds[i];
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const html = await fetchProfilePage(racer.racerId, year);
        const profile = parseProfile(html, racer.racerId, racer.name, year);
        success = true;
        failCount = 0;

        if (profile) {
          profiles.push(profile);
        }

        if ((i + 1) % 50 === 0 || i === racerIds.length - 1) {
          console.log(`  ${i + 1}/${racerIds.length}: 수집 ${profiles.length}명`);
          saveProgress(year, i, profiles);
        }

        await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES - 1) {
          await delay((attempt + 1) * 3000);
        } else {
          console.error(`  ERROR ${racer.racerId} (${racer.name}): ${msg}`);
          failCount++;
          if (failCount >= 10) {
            console.error(`  연속 ${failCount}회 실패, ${year}년 중단`);
            saveProgress(year, i, profiles);
            return { year, totalRacers: profiles.length, profiles };
          }
        }
      }
    }
  }

  return { year, totalRacers: profiles.length, profiles };
}

// --- 병합 ---
function mergeAll(): void {
  console.log("\n=== 전체 병합 ===");
  const all: RacerProfile[] = [];
  for (const year of YEARS) {
    const data = loadCheckpoint(year);
    if (data && data.totalRacers > 0) {
      all.push(...data.profiles);
      console.log(`  ${year}년: ${data.totalRacers}명`);
    }
  }

  const outPath = path.join(__dirname, "..", "src", "data", "racer-profile-data.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`\n총 ${all.length}명 저장: ${outPath}`);
}

// --- 메인 ---
async function main() {
  if (!fs.existsSync(YEARLY_DIR)) fs.mkdirSync(YEARLY_DIR, { recursive: true });
  if (!fs.existsSync(RACER_IDS_DIR)) fs.mkdirSync(RACER_IDS_DIR, { recursive: true });

  console.log("선수 상세 프로필 수집 시작...");
  console.log(`수집 범위: ${START_YEAR}~${END_YEAR}년\n`);

  const doneYears = YEARS.filter(isYearDone);
  const todoYears = YEARS.filter((y) => !isYearDone(y));

  if (doneYears.length > 0) {
    console.log(`수집 완료 (${doneYears.length}개): ${doneYears.join(", ")}`);
    console.log(`남은 연도 (${todoYears.length}개): ${todoYears.join(", ")}\n`);
  }

  for (const year of todoYears) {
    console.log(`=== ${year}년 ===`);
    const data = await fetchYear(year);
    saveCheckpoint(year, data);
    clearProgress(year);
    console.log(`  ${year}년 완료: ${data.totalRacers}명\n`);
    await delay(DELAY_MS);
  }

  mergeAll();
  console.log("\n=== 선수 프로필 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
