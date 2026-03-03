// ============================================================
// 누적순위 데이터 수집 스크립트 (정적, 단일 요청)
// 사용법: npm run fetch-win-accrued
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface WinAccruedRecord {
  rank: number;
  racerName: string;
  generation: number;     // 기수
  totalWins: number;      // 전체 누적승수
  preemptiveWins: number; // 선행 누적승수
  pushWins: number;       // 젖히기 누적승수
  chaseWins: number;      // 추입 누적승수
  markWins: number;       // 마크 누적승수
}

// --- HTML 파싱 ---
function safeNum(val: string): number {
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseWinAccrued(html: string): WinAccruedRecord[] {
  const records: WinAccruedRecord[] = [];

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return records;

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, "").trim());

    if (tds.length < 8) continue;

    const rank = parseInt(tds[0]);
    if (isNaN(rank)) continue;

    records.push({
      rank,
      racerName: tds[1],
      generation: safeNum(tds[2]),
      totalWins: safeNum(tds[3]),
      preemptiveWins: safeNum(tds[4]),
      pushWins: safeNum(tds[5]),
      chaseWins: safeNum(tds[6]),
      markWins: safeNum(tds[7]),
    });
  }

  return records;
}

// --- 메인 ---
async function main() {
  console.log("누적순위 데이터 수집 시작...");

  const url = "https://www.kcycle.or.kr/racer/ranking/winaccrued";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const records = parseWinAccrued(html);
  console.log(`  ${records.length}건 파싱 완료`);

  const outPath = path.join(__dirname, "..", "src", "data", "win-accrued-data.json");
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), "utf-8");
  console.log(`저장: ${outPath}`);
  console.log("\n=== 누적순위 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
