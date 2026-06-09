/**
 * 경륜 매출 데이터 → Supabase 업로드 스크립트
 * 사용법: node scripts/upload-race-sales.js
 */

const fs = require('fs');
const path = require('path');

// ─── 환경변수 로드 ───────────────────────────────────────────
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ .env.local에 NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'src', 'data', 'yearly-race-sales');
const BATCH_SIZE = 500; // 한 번에 500건씩 업로드

// ─── Supabase upsert 함수 ────────────────────────────────────
// on_conflict=year,round,day,race_no + resolution=merge-duplicates 로
// 동일 경주 재업로드 시 중복 INSERT 대신 갱신(UPSERT) 처리 (자동화 반복 실행 안전)
async function upsert(rows) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/race_sales?on_conflict=year,round,day,race_no`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Prefer': 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase 오류: ${res.status} ${err}`);
  }
}

// ─── 메인 ────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   경륜 매출 데이터 Supabase 업로드                  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^\d{4}\.json$/.test(f))
    .sort();

  if (files.length === 0) {
    console.error('❌ yearly-race-sales 폴더에 JSON 파일 없음');
    process.exit(1);
  }

  let totalInserted = 0;

  for (const file of files) {
    const year = parseInt(file);
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`  [${year}] ⚠ 데이터 없음, 스킵`);
      continue;
    }

    // 데이터 변환
    const rows = data.map(r => ({
      year:     r.year,
      round:    r.round,
      day:      r.day,
      race_no:  r.raceNo,
      meet_cd:  r.meetCd || '001',     // 광명 전용 수집 (수집 스크립트 미출력분 보정)
      meet_name: r.meetName || '광명',
      grade:    r.grade || null,
      race_date: r.date || null,
      s_단승:   r.sales?.단승   || 0,
      s_연승:   r.sales?.연승   || 0,
      s_쌍승:   r.sales?.쌍승   || 0,
      s_복승:   r.sales?.복승   || 0,
      s_삼복승: r.sales?.삼복승 || 0,
      s_쌍복승: r.sales?.쌍복승 || 0,
      s_삼쌍승: r.sales?.삼쌍승 || 0,
      s_합계:   r.sales?.합계   || 0,
    }));

    // 배치 업로드
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await upsert(batch);
      inserted += batch.length;
      process.stdout.write(`\r  [${year}] ${inserted}/${rows.length}건 업로드 중...`);
    }

    totalInserted += rows.length;
    console.log(`\r  [${year}] ✅ ${rows.length}건 완료`);
  }

  console.log(`\n  ─────────────────────────────────`);
  console.log(`  🎉 전체 완료: ${totalInserted.toLocaleString()}건 업로드`);
  console.log(`  ─────────────────────────────────\n`);
}

main().catch(err => {
  console.error('\n❌ 오류 발생:', err.message);
  process.exit(1);
});
