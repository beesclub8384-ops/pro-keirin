// ============================================================
// 최다연승 데이터 수집 스크립트 (정적, 단일 요청)
// 사용법: npm run fetch-most-win-streaks
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface MostWinStreakRecord {
  rank: number;
  racerName: string;
  generation: number;     // 기수
  maxStreak: number;      // 최다연승
  streakPeriod: string;   // 연승기간
  note: string;           // 비고
}

// --- HTML 파싱 ---
function parseMostWinStreaks(html: string): MostWinStreakRecord[] {
  const records: MostWinStreakRecord[] = [];

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return records;

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, "").trim());

    if (tds.length < 5) continue;

    const rank = parseInt(tds[0]);
    if (isNaN(rank)) continue;

    records.push({
      rank,
      racerName: tds[1],
      generation: parseInt(tds[2]) || 0,
      maxStreak: parseInt(tds[3]) || 0,
      streakPeriod: tds[4].replace(/\s+/g, " ").trim(),
      note: (tds[5] || "").trim(),
    });
  }

  return records;
}

// --- 메인 ---
async function main() {
  console.log("최다연승 데이터 수집 시작...");

  const url = "https://www.kcycle.or.kr/racer/ranking/mostwinstreaks";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const records = parseMostWinStreaks(html);
  console.log(`  ${records.length}건 파싱 완료`);

  const outPath = path.join(__dirname, "..", "src", "data", "most-win-streaks-data.json");
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), "utf-8");
  console.log(`저장: ${outPath}`);
  console.log("\n=== 최다연승 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
