/**
 * race_sales에서 특정 범위의 경주를 kcycle에서 fetch하여
 * 제목에 "특별"이 포함된 경주만 출력
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DELAY_MS = 300; // 1782건이라 300ms로

function decodeHtml(str) {
  return str.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function extractTitle(html) {
  const decoded = decodeHtml(html);
  // "N경주 (XXX HH : MM)" 패턴에서 괄호 안 전체 추출
  const m = decoded.match(/(\d+)경주\s*\(([^)]+)\)/);
  if (!m) return null;
  return `${m[1]}경주 (${m[2].trim()})`;
}

async function fetchTitle(year, round, day, raceNo) {
  const rr = String(round).padStart(2, '0');
  const rn = String(raceNo).padStart(2, '0');
  const url = `https://www.kcycle.or.kr/race/dividendrate/final/${year}/${rr}/${day}/001/${rn}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    return extractTitle(html);
  } catch { return null; }
}

async function main() {
  // Supabase에서 대상 목록 조회 (페이지네이션)
  const allRows = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/race_sales?select=year,round,day,race_no&or=(and(year.eq.2017,round.gte.17,round.lte.45),and(year.eq.2018,round.gte.7,round.lte.41),and(year.eq.2019,round.gte.14,round.lte.35))&race_no=gte.9&order=year,round,day,race_no&offset=${offset}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY },
    });
    const rows = await res.json();
    allRows.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  console.log(`대상: ${allRows.length}건\n`);

  const results = [];
  for (let i = 0; i < allRows.length; i++) {
    const { year, round, day, race_no } = allRows[i];
    const title = await fetchTitle(year, round, day, race_no);

    if (title && title.includes('특별')) {
      results.push({ year, round, day, race_no, title });
      console.log(`  [특별] ${year} / ${round}회 / ${day}일 / ${race_no}R / ${title}`);
    }

    if ((i + 1) % 100 === 0) {
      process.stderr.write(`\r  진행: ${i + 1}/${allRows.length} (특별: ${results.length}건)`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n\n=== 완료 ===`);
  console.log(`총 조회: ${allRows.length}건`);
  console.log(`"특별" 경주: ${results.length}건\n`);

  // 요약 출력
  console.log('연도 / 회차 / 일차 / 경주번호 / kcycle 제목');
  console.log('─'.repeat(60));
  for (const r of results) {
    console.log(`${r.year} / ${r.round}회 / ${r.day}일 / ${r.race_no}R / ${r.title}`);
  }
}

main().catch(err => { console.error('에러:', err); process.exit(1); });
