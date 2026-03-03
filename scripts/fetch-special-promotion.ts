// ============================================================
// 특별승강급 데이터 수집 스크립트 (목록 + 상세, 중단 재개 지원)
// 사용법: npm run fetch-special-promotion
// kcycle.or.kr HTML 스크래핑
// ============================================================

import * as fs from "fs";
import * as path from "path";

// --- 타입 ---
interface SpecialPromotionListItem {
  seqId: string;
  title: string;
  regDate: string;
}

interface SpecialPromotionDetail {
  seqId: string;
  title: string;
  regDate: string;
  bodyText: string;       // 본문 원문 (비정형 텍스트)
}

// --- 설정 ---
const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const PROGRESS_PATH = path.join(DATA_DIR, "special-promotion-progress.json");

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
function parseListPage(html: string): { items: SpecialPromotionListItem[]; lastPage: number } {
  const items: SpecialPromotionListItem[] = [];

  const pageNums = [...html.matchAll(/fnSearch\((\d+)\)/g)].map(m => parseInt(m[1]));
  const lastPage = pageNums.length > 0 ? Math.max(...pageNums) : 1;

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { items, lastPage };

  const trs = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

  for (const tr of trs) {
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
function parseDetailPage(html: string, listItem: SpecialPromotionListItem): SpecialPromotionDetail {
  // 본문 추출 — 다양한 view 영역 패턴 시도
  let bodyText = "";

  // 패턴 1: class에 view 포함
  const viewMatch = html.match(/class="[^"]*(?:view|content|board)[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (viewMatch) {
    bodyText = decodeHtml(viewMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").trim());
  }

  // 패턴 2: 본문 영역이 특정 id에 감싸진 경우
  if (!bodyText) {
    const altMatch = html.match(/<div[^>]*id="[^"]*(?:cont|body|article)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (altMatch) {
      bodyText = decodeHtml(altMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").trim());
    }
  }

  // 패턴 3: tbody 내 본문
  if (!bodyText) {
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tbodyMatch) {
      bodyText = decodeHtml(tbodyMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").trim());
    }
  }

  return {
    seqId: listItem.seqId,
    title: listItem.title,
    regDate: listItem.regDate,
    bodyText,
  };
}

// --- Progress ---
function loadProgress(): { processedIds: Set<string>; records: SpecialPromotionDetail[] } {
  if (fs.existsSync(PROGRESS_PATH)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
    return {
      processedIds: new Set(data.processedIds || []),
      records: data.records || [],
    };
  }
  return { processedIds: new Set(), records: [] };
}

function saveProgress(processedIds: Set<string>, records: SpecialPromotionDetail[]): void {
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
  console.log("특별승강급 데이터 수집 시작...");

  // Phase 1: 전체 목록 수집
  console.log("\n--- Phase 1: 목록 수집 ---");
  const allItems: SpecialPromotionListItem[] = [];
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
      try {
        const url = "https://www.kcycle.or.kr/racer/state/specialpromotion";
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
        const url = `https://www.kcycle.or.kr/racer/state/specialpromotion/${item.seqId}`;
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
  const outPath = path.join(DATA_DIR, "special-promotion-data.json");
  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), "utf-8");
  clearProgress();
  console.log(`\n총 ${records.length}건 저장: ${outPath}`);
  console.log("\n=== 특별승강급 수집 완료 ===");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
