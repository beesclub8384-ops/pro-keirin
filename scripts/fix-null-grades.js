/**
 * race_sales에서 grade=null인 건을 kcycle에서 재수집하여 grade만 업데이트
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DELAY_MS = 500;

function decodeHtml(str) {
  return str
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function parseGrade(html) {
  const decoded = decodeHtml(html);
  const m = decoded.match(/경주\s*\(\s*([^\d]+?)\s*\d{1,2}\s*:/);
  if (!m) return null;
  const raw = m[1].trim();

  if (raw === '선발' || raw === '우수' || raw === '특선') return raw;
  if (raw.includes('준결')) return '특선';
  if (raw.includes('특우')) return '특선';
  if (raw.includes('그랑프리')) return '특선';
  if (raw.includes('B Final')) return '특선';
  if (raw.includes('특별')) return '특선';

  return null;
}

async function fetchGrade(year, round, day, raceNo) {
  const rr = String(round).padStart(2, '0');
  const rn = String(raceNo).padStart(2, '0');
  const url = `https://www.kcycle.or.kr/race/dividendrate/final/${year}/${rr}/${day}/001/${rn}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      return parseGrade(html);
    } catch (err) {
      if (attempt < 2) await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
  return null;
}

async function updateGrade(year, round, day, raceNo, grade) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/race_sales?year=eq.${year}&round=eq.${round}&day=eq.${day}&race_no=eq.${raceNo}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ grade }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PATCH 오류: ${res.status} ${err}`);
  }
}

async function main() {
  // grade=null 목록을 Supabase에서 조회
  const listRes = await fetch(
    `${SUPABASE_URL}/rest/v1/race_sales?grade=is.null&select=year,round,day,race_no&order=year,round,day,race_no`,
    {
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY },
    }
  );
  const nullRows = await listRes.json();
  console.log(`\ngrade=null 건수: ${nullRows.length}건\n`);

  if (nullRows.length === 0) {
    console.log('처리할 건이 없습니다.');
    return;
  }

  const stats = { updated: 0, stillNull: 0, error: 0 };
  const stillNull = [];

  for (let i = 0; i < nullRows.length; i++) {
    const { year, round, day, race_no } = nullRows[i];
    const grade = await fetchGrade(year, round, day, race_no);

    if (grade) {
      try {
        await updateGrade(year, round, day, race_no, grade);
        stats.updated++;
      } catch (err) {
        stats.error++;
        console.error(`  ERROR ${year}-${round}-${day}-${race_no}: ${err.message}`);
      }
    } else {
      stats.stillNull++;
      stillNull.push({ year, round, day, race_no });
    }

    if ((i + 1) % 50 === 0 || i === nullRows.length - 1) {
      console.log(`  ${i + 1}/${nullRows.length} 처리 (업데이트: ${stats.updated}, null유지: ${stats.stillNull}, 에러: ${stats.error})`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n=== 완료 ===`);
  console.log(`  업데이트: ${stats.updated}건`);
  console.log(`  null 유지: ${stats.stillNull}건`);
  console.log(`  에러: ${stats.error}건`);

  if (stillNull.length > 0) {
    console.log(`\n  여전히 null인 건:`);
    stillNull.forEach(r => console.log(`    ${r.year}-${r.round}-${r.day}-${r.race_no}`));
  }
}

main().catch(err => { console.error('치명적 에러:', err); process.exit(1); });
