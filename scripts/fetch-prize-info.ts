// ============================================================
// 상금지급 정보 수집 스크립트 (정적 참조 테이블, 단일 요청)
// 사용법: npm run fetch-prize-info
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface PrizeRow {
  category: string;       // 구분 (특선, 우수, 선발 등)
  grade: string;          // 등급
  prize1st: string;       // 1위 상금
  prize2nd: string;       // 2위
  prize3rd: string;       // 3위
  prize4th: string;       // 4위
  prize5th: string;       // 5위
  prize6th: string;       // 6위
}

interface PrizeTable {
  title: string;
  rows: PrizeRow[];
}

// --- HTML 파싱 ---
function parsePrizeInfo(html: string): PrizeTable[] {
  const tables: PrizeTable[] = [];

  // tbody 추출 (페이지에 4개 테이블)
  const tbodies = [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)];

  // 제목 추출을 위한 caption 또는 h 태그
  const captions = [...html.matchAll(/<caption[^>]*>([\s\S]*?)<\/caption>/g)]
    .map(m => m[1].replace(/<[^>]*>/g, "").trim());

  let lastCategory = "";

  for (let ti = 0; ti < tbodies.length; ti++) {
    const rows: PrizeRow[] = [];
    const trs = [...tbodies[ti][1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

    for (const tr of trs) {
      // th+td 모두 추출 (첫 1~2 컬럼이 th)
      const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(m => m[1].replace(/<[^>]*>/g, "").trim());

      if (cells.length >= 9) {
        // 9 cells: category(th rowspan) + grade(th) + 7 prizes(td)
        lastCategory = cells[0];
        rows.push({
          category: cells[0],
          grade: cells[1],
          prize1st: cells[2], prize2nd: cells[3], prize3rd: cells[4],
          prize4th: cells[5], prize5th: cells[6], prize6th: cells[7],
        });
      } else if (cells.length >= 8) {
        // 8 cells: grade(th) + 7 prizes(td) — rowspan이므로 category 없음
        rows.push({
          category: lastCategory,
          grade: cells[0],
          prize1st: cells[1], prize2nd: cells[2], prize3rd: cells[3],
          prize4th: cells[4], prize5th: cells[5], prize6th: cells[6],
        });
      }
    }

    if (rows.length > 0) {
      tables.push({
        title: captions[ti] || `테이블 ${ti + 1}`,
        rows,
      });
    }
  }

  return tables;
}

// --- 메인 ---
async function main() {
  console.log("상금지급 정보 수집 시작...");

  const url = "https://www.kcycle.or.kr/racer/prize/pymtinfo";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const tables = parsePrizeInfo(html);
  console.log(`  ${tables.length}개 테이블 파싱 완료`);
  for (const t of tables) {
    console.log(`    ${t.title}: ${t.rows.length}행`);
  }

  const outPath = path.join(__dirname, "..", "src", "data", "prize-info-data.json");
  fs.writeFileSync(outPath, JSON.stringify(tables, null, 2), "utf-8");
  console.log(`저장: ${outPath}`);
  console.log("\n=== 상금지급 정보 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
