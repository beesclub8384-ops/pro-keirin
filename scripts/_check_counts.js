const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATA_DIR = path.join(__dirname, '..', 'src', 'data', 'yearly-race-sales');

async function getDbCount(year) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/race_sales?select=id&year=eq.${year}`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
    }
  );
  const range = res.headers.get('content-range') || '';
  const match = range.match(/\/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

async function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}\.json$/.test(f)).sort();
  let totalJson = 0, totalDb = 0;
  const mismatch = [];

  console.log('연도  | JSON건수 | DB건수 | 차이');
  console.log('------|----------|--------|-----');

  for (const file of files) {
    const year = parseInt(file);
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    const jsonCount = data.length;
    const dbCount = await getDbCount(year);
    const diff = dbCount - jsonCount;
    totalJson += jsonCount;
    totalDb += dbCount;
    const mark = diff !== 0 ? ' ⚠️' : ' ✅';
    console.log(`${year}  | ${String(jsonCount).padStart(8)} | ${String(dbCount).padStart(6)} | ${diff >= 0 ? '+' : ''}${diff}${mark}`);
    if (diff !== 0) mismatch.push(year);
  }

  console.log('------|----------|--------|-----');
  console.log(`합계  | ${String(totalJson).padStart(8)} | ${String(totalDb).padStart(6)} | ${totalDb - totalJson >= 0 ? '+' : ''}${totalDb - totalJson}`);
  console.log(`\n원래: 46,258건 / JSON: ${totalJson.toLocaleString()}건 / DB: ${totalDb.toLocaleString()}건`);
  if (mismatch.length > 0) {
    console.log(`\n⚠️ 불일치 연도: ${mismatch.join(', ')}`);
  } else {
    console.log('\n✅ 모든 연도 JSON = DB 일치');
  }
}

main();
