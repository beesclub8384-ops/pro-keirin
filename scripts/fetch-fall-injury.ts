// ============================================================
// 낙차부상 데이터 수집 스크립트 (목록 + 상세, 중단 재개 지원)
// 사용법: npm run fetch-fall-injury
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface FallInjuryListItem {
  seqId: string;          // 상세 URL용 ID
  title: string;          // 게시물 제목
  regDate: string;        // 등록일
}

interface FallInjuryDetail {
  seqId: string;
  title: string;
  regDate: string;
  raceInfo: string;       // 출전경주 정보
  racerName: string;      // 선수명
  injuryPart: string;     // 부상부위
  note: string;           // 비고
  bodyText: string;       // 본문 원문 (테이블 미지원 시 fallback)
}

// --- 설정 ---
const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const PROGRESS_PATH = path.join(DATA_DIR, "fall-injury-progress.json");

// --- 유틸 ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// --- 목록 페이지 파싱 ---
function parseListPage(html: string): { items: FallInjuryListItem[]; lastPage: number } {
  const items: FallInjuryListItem[] = [];

  // 마지막 페이지 번호
  const pageNums = [...html.matchAll(/fnSearch\((\d+)\)/g)].map(m => parseInt(m[1]));
  const lastPage = pageNums.length > 0 ? Math.max(...pageNums) : 1;

  // tbody 파싱
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { items, lastPage };

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
    // seqId 추출: fnMoveDetail("12855", 'N')
    const seqMatch = tr[1].match(/fnMoveDetail\((?:&quot;|")(\d+)(?:&quot;|")/);
    if (!seqMatch) continue;

    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()));

    if (tds.length < 3) continue;

    items.push({
      seqId: seqMatch[1],
      title: tds[1].replace(/\s+/g, " ").trim(),
      regDate: tds[2].trim(),
    });
  }

  return { items, lastPage };
}

// --- 상세 페이지 파싱 ---
function parseDetailPage(html: string, listItem: FallInjuryListItem): FallInjuryDetail {
  let raceInfo = "";
  let racerName = "";
  let injuryPart = "";
  let note = "";

  // 구조화 테이블 파싱 시도
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const tr of trs) {
      const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map(m => decodeHtml(m[1].replace(/<[^>]*>/g, "").trim()));

      for (let i = 0; i < cells.length - 1; i++) {
        const label = cells[i].replace(/\s+/g, "");
        const value = cells[i + 1].replace(/\s+/g, " ").trim();
        if (label.includes("출전경주")) raceInfo = value;
        else if (label.includes("선수명")) racerName = value;
        else if (label.includes("부상부위") || label.includes("부상")) injuryPart = value;
        else if (label.includes("비고")) note = value;
      }
    }
  }

  // 본문 원문 추출 (fallback)
  const bodyMatch = html.match(/class="[^"]*view[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const bodyText = bodyMatch
    ? decodeHtml(bodyMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
    : "";

  return {
    seqId: listItem.seqId,
    title: listItem.title,
    regDate: listItem.regDate,
    raceInfo,
    racerName,
    injuryPart,
    note,
    bodyText,
  };
}

// --- Progress ---
function loadProgress(): { processedIds: Set<string>; records: FallInjuryDetail[] } {
  if (fs.existsSync(PROGRESS_PATH)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
    return {
      processedIds: new Set(data.processedIds || []),
      records: data.records || [],
    };
  }
  return { processedIds: new Set(), records: [] };
}

function saveProgress(processedIds: Set<string>, records: FallInjuryDetail[]): void {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify({
    processedIds: [...processedIds],
    records,
  }, null, 2), "utf-8");
}

function clearProgress(): void {
  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
}

// --- 메인 ---
async function main() {
  console.log("낙차부상 데이터 수집 시작...");

  // Phase 1: 전체 목록 수집
  console.log("\n--- Phase 1: 목록 수집 ---");
  const allItems: FallInjuryListItem[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const url = "https://www.kcycle.or.kr/racer/state/fallinjury";
        const res = page === 1
          ? await fetch(url)
          : await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: `pagination.currentPage=${page}`,
            });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const result = parseListPage(html);
        success = true;

        if (page === 1) {
          lastPage = result.lastPage;
          console.log(`  총 ${lastPage} 페이지`);
        }

        allItems.push(...result.items);
        if (page % 10 === 0 || page === lastPage) {
          console.log(`  페이지 ${page}/${lastPage}: 누적 ${allItems.length}건`);
        }
        page++;
        if (page <= lastPage) await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES - 1) {
          await delay((attempt + 1) * 3000);
        } else {
          console.error(`  ERROR 목록 페이지 ${page}: ${msg}`);
          page++;
        }
      }
    }
  }

  console.log(`\n총 ${allItems.length}건 목록 수집 완료`);

  // Phase 2: 상세 수집
  console.log("\n--- Phase 2: 상세 수집 ---");
  const { processedIds, records } = loadProgress();
  if (processedIds.size > 0) {
    console.log(`  이전 진행 재개: ${processedIds.size}건 처리됨`);
  }

  const todoItems = allItems.filter(item => !processedIds.has(item.seqId));
  console.log(`  미수집 ${todoItems.length}건`);

  for (let i = 0; i < todoItems.length; i++) {
    const item = todoItems[i];
    let success = false;

    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const url = `https://www.kcycle.or.kr/racer/state/fallinjury/${item.seqId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const detail = parseDetailPage(html, item);
        success = true;

        records.push(detail);
        processedIds.add(item.seqId);

        if ((i + 1) % 50 === 0 || i === todoItems.length - 1) {
          console.log(`  ${i + 1}/${todoItems.length}: 수집 ${records.length}건`);
          saveProgress(processedIds, records);
        }

        await delay(DELAY_MS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_RETRIES - 1) {
          await delay((attempt + 1) * 3000);
        } else {
          console.error(`  ERROR ${item.seqId}: ${msg}`);
        }
      }
    }
  }

  // 저장
  const outPath = path.join(DATA_DIR, "fall-injury-data.json");
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), "utf-8");
  clearProgress();
  console.log(`\n총 ${records.length}건 저장: ${outPath}`);
  console.log("\n=== 낙차부상 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
