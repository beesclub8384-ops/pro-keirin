// ============================================================
// kcycle.or.kr/racer/info 페이지에서 전체 현역 선수 이름/등급/기수 추출 (일회성)
// 실행: npx tsx scripts/fetch-all-racer-names.ts
// 출력: data/all-racer-names.json
// ============================================================
//
// 실제 HTML 구조 (작업 명세의 <strong>은 실제로 <b class="name">):
//   <h2>ㄱ</h2>
//   <ul class="prsnList">
//     <li class="prsnItem">
//       <a ... onclick="fnMoveTo('/racer/info', "19990041")">
//         <div class="txtWrap">
//           <b class="name">강동국</b>
//           <div class="cateGroup">
//             <span class="cate mint">B3</span>   <- 등급 (S1/S2/S3/SS/A1/A2/A3/B1/B2/B3/--)
//             <span class="cate">06기</span>      <- 기수
//           </div>
//         </div>
//       </a>
//     </li>
//   </ul>
//
// 검증은 Cheerio 추출과 정규식 추출의 교차검증으로 무음 실패를 차단.

import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";

const URL = "https://www.kcycle.or.kr/racer/info";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CONSONANTS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const OUT_FILE = path.join("src", "data", "all-racer-names.json");

interface Racer {
  name: string;
  grade: string;
  cohort: string;
  initial: string;
}

function normalizeName(raw: string): string {
  // 한자/한글 외 문자 제거, 공백 제거 (예: "김  현" → "김현")
  return raw.replace(/\s+/g, "").trim();
}

function isValidKoreanName(name: string): boolean {
  // 한글 2~4글자
  return /^[가-힣]{2,4}$/.test(name);
}

async function fetchPage(): Promise<{ status: number; html: string }> {
  const res = await fetch(URL, { headers: { "User-Agent": USER_AGENT } });
  return { status: res.status, html: await res.text() };
}

// ---------- 검증 1차 ----------
function verifyPageStructure(status: number, html: string): void {
  if (status !== 200) {
    throw new Error(`[검증1] HTTP ${status} (200 기대)`);
  }
  if (!html.includes("선수조회")) {
    throw new Error('[검증1] HTML에 "선수조회" 텍스트 없음');
  }
  const foundConsonants = CONSONANTS.filter((c) =>
    new RegExp(`<h2>\\s*${c}\\s*</h2>`).test(html)
  );
  if (foundConsonants.length < 10) {
    throw new Error(
      `[검증1] 자음 헤더 ${foundConsonants.length}개만 발견 (10개 이상 필요): ${foundConsonants.join(",")}`
    );
  }
  console.log(`✅ 검증1 통과 — HTTP ${status}, "선수조회" 확인, 자음 헤더 ${foundConsonants.length}개 (${foundConsonants.join(", ")})`);
}

// ---------- Cheerio 추출 ----------
function extractByCheerio(html: string): Racer[] {
  const $ = cheerio.load(html);
  const racers: Racer[] = [];

  // h2(자음) → 같은 상위 컨테이너 내 다음 ul.prsnList
  $("h2").each((_, h2El) => {
    const txt = $(h2El).text().trim();
    if (!CONSONANTS.includes(txt)) return;

    // 같은 부모 다음에 등장하는 ul.prsnList을 찾는다
    let ul = $(h2El).parent().next("ul.prsnList");
    if (ul.length === 0) {
      // 폴백: 다음 형제 중 ul.prsnList
      ul = $(h2El).nextAll("ul.prsnList").first();
    }
    ul.find("li.prsnItem").each((__, li) => {
      const name = normalizeName($(li).find("b.name").text());
      const cates = $(li)
        .find("span.cate")
        .map((___, s) => $(s).text().trim())
        .get();
      const cohort = cates.find((c) => /기$/.test(c)) || "";
      const grade = cates.find((c) => !/기$/.test(c)) || "";
      if (!name) return;
      racers.push({ name, grade, cohort, initial: txt });
    });
  });

  return racers;
}

// ---------- 정규식 추출 ----------
function extractByRegex(html: string): Racer[] {
  const racers: Racer[] = [];

  // h2 자음 헤더 위치를 기준으로 자르고, 각 구간 내에서 prsnItem 단위로 추출
  const headerRe = new RegExp(`<h2>\\s*(${CONSONANTS.join("|")})\\s*</h2>`, "g");
  const headers: { initial: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(html)) !== null) {
    headers.push({ initial: m[1], start: m.index });
  }
  headers.push({ initial: "", start: html.length }); // sentinel

  // prsnItem 블록 → name / grade / cohort
  // 등급(`--`, S1~SS, A1~A3, B1~B3)과 기수(\d{2}기)가 같은 cateGroup 안에 있음
  const itemRe =
    /<li class="prsnItem">[\s\S]*?<b class="name">([^<]+)<\/b>[\s\S]*?<div class="cateGroup">([\s\S]*?)<\/div>[\s\S]*?<\/li>/g;
  const cateRe = /<span class="cate(?:\s+[a-z]+)?">([^<]+)<\/span>/g;

  for (let i = 0; i < headers.length - 1; i++) {
    const { initial, start } = headers[i];
    const end = headers[i + 1].start;
    const section = html.slice(start, end);

    itemRe.lastIndex = 0;
    let im: RegExpExecArray | null;
    while ((im = itemRe.exec(section)) !== null) {
      const name = normalizeName(im[1]);
      const cateBlock = im[2];
      const cates: string[] = [];
      cateRe.lastIndex = 0;
      let cm: RegExpExecArray | null;
      while ((cm = cateRe.exec(cateBlock)) !== null) {
        cates.push(cm[1].trim());
      }
      const cohort = cates.find((c) => /기$/.test(c)) || "";
      const grade = cates.find((c) => !/기$/.test(c)) || "";
      if (!name) continue;
      racers.push({ name, grade, cohort, initial });
    }
  }

  return racers;
}

// ---------- 검증 2차 ----------
function verifyCrossExtraction(cheerioList: Racer[], regexList: Racer[]): void {
  const cheerioSet = new Set(cheerioList.map((r) => r.name));
  const regexSet = new Set(regexList.map((r) => r.name));

  const onlyInCheerio = [...cheerioSet].filter((n) => !regexSet.has(n));
  const onlyInRegex = [...regexSet].filter((n) => !cheerioSet.has(n));

  if (cheerioList.length !== regexList.length) {
    console.error(`Cheerio: ${cheerioList.length}명, Regex: ${regexList.length}명`);
    console.error("only in cheerio:", onlyInCheerio);
    console.error("only in regex:", onlyInRegex);
    throw new Error(`[검증2] 추출 개수 불일치 (cheerio=${cheerioList.length}, regex=${regexList.length})`);
  }

  if (onlyInCheerio.length > 0 || onlyInRegex.length > 0) {
    console.error("only in cheerio:", onlyInCheerio);
    console.error("only in regex:", onlyInRegex);
    throw new Error("[검증2] 두 방식의 이름 Set이 일치하지 않음");
  }

  if (cheerioList.length < 500) {
    throw new Error(`[검증2] 전체 ${cheerioList.length}명 (500명 미만)`);
  }

  const badNames = cheerioList.filter((r) => !isValidKoreanName(r.name));
  if (badNames.length > 0) {
    console.error("한글 2~4글자 범위 밖:", badNames);
    throw new Error(`[검증2] ${badNames.length}명의 이름이 한글 2~4글자 범위가 아님`);
  }

  console.log(`✅ 검증2 통과 — cheerio/regex 동일 (${cheerioList.length}명), 이름 Set 100% 일치, 모두 한글 2~4글자`);
}

// ---------- 메인 ----------
async function main() {
  console.log(`[1] GET ${URL}`);
  const { status, html } = await fetchPage();

  console.log("[2] 검증 1차 — 페이지 구조");
  verifyPageStructure(status, html);

  console.log("[3] Cheerio 추출");
  const cheerioList = extractByCheerio(html);

  console.log("[4] 정규식 추출");
  const regexList = extractByRegex(html);

  console.log("[5] 검증 2차 — 교차 추출");
  verifyCrossExtraction(cheerioList, regexList);

  // 자음별 분포
  const byInitial: Record<string, number> = {};
  for (const r of cheerioList) {
    byInitial[r.initial] = (byInitial[r.initial] || 0) + 1;
  }
  console.log(`\n총 ${cheerioList.length}명 추출`);
  console.log("자음별 분포:");
  for (const c of CONSONANTS) {
    if (byInitial[c]) console.log(`  ${c} ${byInitial[c]}명`);
  }

  // 디렉터리 생성 & 저장
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(cheerioList, null, 2), "utf-8");
  console.log(`\n저장 완료: ${OUT_FILE} (${cheerioList.length}건)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
