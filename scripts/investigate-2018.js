/**
 * 2018년 데이터 정밀 조사 스크립트
 * 사용법: node scripts/investigate-2018.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data', 'yearly-race-sales');

function loadYear(year) {
  const p = path.join(DATA_DIR, `${year}.json`);
  if (!fs.existsSync(p)) { console.log(`❌ ${year}.json 없음`); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ─── 0. 실제 데이터 구조 확인 ───────────────────────────
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   2018년 데이터 정밀 조사                ║');
console.log('╚══════════════════════════════════════════╝');

const data2018 = loadYear(2018);

console.log('\n▶ 0. 실제 필드 구조 (첫 번째 레코드)');
console.log(JSON.stringify(data2018[0], null, 2));
console.log(`\n  총 레코드 수: ${data2018.length}건`);
console.log(`  필드 목록: ${Object.keys(data2018[0]).join(', ')}`);
if (data2018[0].sales) {
  console.log(`  sales 필드 목록: ${Object.keys(data2018[0].sales).join(', ')}`);
}

// ─── 1. 승식 필드 존재 여부 통계 ───────────────────────
console.log('\n▶ 1. 승식별 필드 존재 여부 통계');
const 승식들 = ['단승','연승','쌍승','복승','삼복승','쌍복승','삼쌍승'];
const stats = {};
for (const s of 승식들) {
  stats[s] = { 있음: 0, 없음: 0, 영: 0 };
}

for (const r of data2018) {
  for (const s of 승식들) {
    const v = r.sales?.[s];
    if (v === undefined || v === null) stats[s].없음++;
    else if (v === 0) stats[s].영++;
    else stats[s].있음++;
  }
}

console.log(`  ${'승식'.padEnd(8)} ${'값있음'.padStart(6)} ${'값=0'.padStart(6)} ${'필드없음'.padStart(8)}`);
console.log('  ' + '─'.repeat(32));
for (const s of 승식들) {
  const { 있음, 영, 없음 } = stats[s];
  const flag = 없음 > 0 ? ' ⚠' : '';
  console.log(`  ${s.padEnd(8)} ${String(있음).padStart(6)} ${String(영).padStart(6)} ${String(없음).padStart(8)}${flag}`);
}

// ─── 2. 합계 불일치 건 샘플 10개 ───────────────────────
console.log('\n▶ 2. 합계 불일치 건 샘플 (최대 10개)');
const mismatch = [];
for (const r of data2018) {
  if (!r.sales) continue;
  const calc = 승식들.reduce((s, f) => s + (r.sales[f] || 0), 0);
  const stored = r.sales.합계 || 0;
  const diff = stored - calc;
  if (Math.abs(diff) > 1) mismatch.push({ ...r, _calc: calc, _diff: diff });
}

console.log(`  총 불일치 건수: ${mismatch.length}건`);
if (mismatch.length > 0) {
  console.log(`\n  샘플 10건:`);
  const sample = mismatch.slice(0, 10);
  for (const r of sample) {
    // 날짜 필드는 실제 구조에 따라 다를 수 있음
    const dateKey = r.date || r.raceDate || r.경주일 || '날짜미상';
    console.log(`\n  레코드: ${JSON.stringify(r).slice(0, 120)}`);
    console.log(`    → 승식 합산: ${r._calc.toLocaleString()}원`);
    console.log(`    → 합계 필드: ${(r.sales.합계||0).toLocaleString()}원`);
    console.log(`    → 차이: +${r._diff.toLocaleString()}원 (합계가 더 큼)`);
  }

  // 차이 패턴 분석
  const positiveCount = mismatch.filter(r => r._diff > 0).length;
  const negativeCount = mismatch.filter(r => r._diff < 0).length;
  console.log(`\n  패턴 분석:`);
  console.log(`    합계 > 승식합산 (합계가 더 큼): ${positiveCount}건`);
  console.log(`    합계 < 승식합산 (승식합산이 더 큼): ${negativeCount}건`);
  
  const avgDiff = mismatch.reduce((s, r) => s + r._diff, 0) / mismatch.length;
  console.log(`    평균 차이: ${Math.round(avgDiff).toLocaleString()}원`);
}

// ─── 3. 2017/2019년과 비교 ─────────────────────────────
console.log('\n▶ 3. 인접 연도(2017, 2019)와 승식 구조 비교');
for (const year of [2017, 2019]) {
  const d = loadYear(year);
  const ex = d[0];
  const fields = ex.sales ? Object.keys(ex.sales) : [];
  console.log(`  [${year}] sales 필드: ${fields.join(', ')}`);
  
  let mm = 0;
  for (const r of d) {
    if (!r.sales) continue;
    const calc = 승식들.reduce((s, f) => s + (r.sales[f] || 0), 0);
    if (Math.abs(calc - (r.sales.합계 || 0)) > 1) mm++;
  }
  console.log(`         불일치 건수: ${mm}건`);
}

// ─── 4. 2018년 날짜별 불일치 분포 ─────────────────────
console.log('\n▶ 4. 2018년 월별 불일치 건수 분포');

// 날짜 필드 자동 탐지
const dateField = data2018[0].date ? 'date' 
  : data2018[0].raceDate ? 'raceDate' 
  : data2018[0]['경주일'] ? '경주일' 
  : null;

if (dateField) {
  const monthly = {};
  for (const r of mismatch) {
    const raw = r[dateField] || '';
    const m = String(raw).slice(0, 7); // YYYY-MM
    monthly[m] = (monthly[m] || 0) + 1;
  }
  const sorted = Object.entries(monthly).sort((a,b) => a[0].localeCompare(b[0]));
  for (const [m, cnt] of sorted) {
    const bar = '█'.repeat(Math.min(Math.round(cnt / 10), 40));
    console.log(`  ${m} : ${String(cnt).padStart(4)}건 ${bar}`);
  }
} else {
  console.log('  ⚠ 날짜 필드를 찾을 수 없음. 실제 필드명 확인 필요');
  console.log('  실제 필드 목록:', Object.keys(data2018[0]));
}

// ─── 5. 결론 ─────────────────────────────────────────
console.log('\n▶ 5. 결론 및 대응 방안');
if (mismatch.length === 0) {
  console.log('  ✅ 불일치 없음 — 데이터 정확');
} else if (mismatch.every(r => r._diff > 0)) {
  console.log('  📌 합계 필드가 승식합산보다 항상 큰 패턴');
  console.log('  → kcycle 서버가 합계를 별도 집계 (일부 승식 누락 반영 가능)');
  console.log('  → 합계 필드 값이 더 신뢰할 수 있는 값일 가능성 높음');
  console.log('  → 통계 페이지에서는 sales.합계 필드를 기준으로 사용 권장');
} else {
  console.log('  ⚠ 혼재 패턴 — 추가 분석 필요');
}

console.log('\n' + '═'.repeat(44));
console.log('  조사 완료');
console.log('═'.repeat(44) + '\n');
