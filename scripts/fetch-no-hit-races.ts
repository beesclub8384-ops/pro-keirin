// ============================================================
// 무적중경주 데이터 수집 스크립트 (정적, 단일 요청)
// 사용법: npm run fetch-no-hit-races
// kcycle.or.kr HTML 스크래핑
// 3개 이벤트 (1997~1999), 각 이벤트별 승식 테이블
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface NoHitPoolRow {
  poolType: string;       // 승식 (단승식, 연승식, ...)
  winNo: string;          // 승차
  dividend: string;       // 배당률
  sales: string;          // 매출액
}

interface NoHitRaceEvent {
  title: string;          // "1997년 17회차 2일차 2경주 (1997년 7월 5일) 단승식 무적중"
  pools: NoHitPoolRow[];
}

// --- HTML 파싱 ---
function decodeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseNoHitRaces(html: string): NoHitRaceEvent[] {
  const events: NoHitRaceEvent[] = [];

  // 이벤트 제목 추출 (h2 태그)
  const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
    .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()))
    .filter(t => t.match(/\d{4}년.*회차/));

  // 각 이벤트 테이블 (tbody)
  const tbodies = [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)];

  for (let i = 0; i < tbodies.length; i++) {
    const pools: NoHitPoolRow[] = [];
    const trs = [...tbodies[i][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

    for (const tr of trs) {
      const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()));

      if (cells.length < 4) continue;

      pools.push({
        poolType: cells[0],
        winNo: cells[1],
        dividend: cells[2],
        sales: cells[3].replace(/\s+/g, ""),
      });
    }

    if (pools.length > 0) {
      events.push({
        title: headings[i] || `이벤트 ${i + 1}`,
        pools,
      });
    }
  }

  return events;
}

// --- 메인 ---
async function main() {
  console.log("무적중경주 데이터 수집 시작...");

  const url = "https://www.kcycle.or.kr/race/stats/nohit";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const events = parseNoHitRaces(html);
  console.log(`  ${events.length}개 이벤트 파싱 완료`);
  for (const e of events) {
    console.log(`    ${e.title}: ${e.pools.length}개 승식`);
  }

  const outPath = path.join(__dirname, "..", "src", "data", "no-hit-races-data.json");
  fs.writeFileSync(outPath, JSON.stringify(events, null, 2), "utf-8");
  console.log(`저장: ${outPath}`);
  console.log("\n=== 무적중경주 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
