/**
 * 전 연도(2003~2026) 승식 도입 시점 + 합계 불일치 전수 검증
 * 사용법: node scripts/verify-all-years.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data', 'yearly-race-sales');
const 승식들 = ['단승', '연승', '쌍승', '복승', '삼복승', '쌍복승', '삼쌍승'];

function loadYear(year) {
  const p = path.join(DATA_DIR, `${year}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function formatWon(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
  if (n >= 1e8)  return `${Math.round(n / 1e8)}억`;
  if (n >= 1e4)  return `${Math.round(n / 1e4)}만`;
  return n.toLocaleString() + '원';
}

// ─────────────────────────────────────────────────────────────
// 1단계: 연도별 승식 활성화 현황
// ─────────────────────────────────────────────────────────────
function step1_승식도입현황() {
  console.log('\n' + '═'.repeat(70));
  console.log('  1단계: 연도별 승식 도입 현황');
  console.log('  O = 전체 경주에 있음 / X = 전혀 없음 / ?(N건) = 일부만 있음');
  console.log('═'.repeat(70));

  const header = '연도  ' + 승식들.map(s => s.padEnd(8)).join(' ');
  console.log('\n  ' + header);
  console.log('  ' + '─'.repeat(header.length));

  for (let y = 2003; y <= 2026; y++) {
    const data = loadYear(y);
    if (!data) { console.log(`  ${y}  ❌ 파일 없음`); continue; }

    const row = [String(y).padEnd(4)];
    for (const s of 승식들) {
      const total  = data.length;
      const active = data.filter(r => r.sales?.[s] > 0).length;
      if (active === 0)          row.push('X       ');
      else if (active === total) row.push('O       ');
      else                       row.push(`?(${String(active).padStart(4)}) `);
    }
    console.log('  ' + row.join(' '));
  }
}

// ─────────────────────────────────────────────────────────────
// 2단계: 연도별 합계 불일치 전수 검증
// ─────────────────────────────────────────────────────────────
function step2_합계불일치() {
  console.log('\n' + '═'.repeat(70));
  console.log('  2단계: 연도별 합계 불일치 전수 검증');
  console.log('  (승식별 합산 vs sales.합계 필드 비교, 허용 오차 1원)');
  console.log('═'.repeat(70));

  console.log(`\n  ${'연도'.padEnd(6)} ${'전체'.padStart(6)} ${'불일치'.padStart(6)} ${'비율'.padStart(6)}  ${'평균차이'.padStart(12)}  판정`);
  console.log('  ' + '─'.repeat(58));

  const issues = [];

  for (let y = 2003; y <= 2026; y++) {
    const data = loadYear(y);
    if (!data) { console.log(`  ${y}   ❌ 파일 없음`); continue; }

    let mismatch = 0;
    let totalDiff = 0;
    const mismatchSamples = [];

    for (const r of data) {
      if (!r.sales) continue;
      const calc   = 승식들.reduce((s, f) => s + (r.sales[f] || 0), 0);
      const stored = r.sales.합계 || 0;
      const diff   = stored - calc;
      if (Math.abs(diff) > 1) {
        mismatch++;
        totalDiff += diff;
        if (mismatchSamples.length < 3) mismatchSamples.push({ r, diff });
      }
    }

    const pct     = ((mismatch / data.length) * 100).toFixed(1);
    const avgDiff = mismatch > 0 ? Math.round(totalDiff / mismatch) : 0;
    const mark    = mismatch === 0 ? '✅ 정상' : '⚠ 이슈';

    console.log(
      `  ${String(y).padEnd(6)} ${String(data.length).padStart(6)} ` +
      `${String(mismatch).padStart(6)} ${String(pct + '%').padStart(6)}  ` +
      `${formatWon(Math.abs(avgDiff)).padStart(12)}  ${mark}`
    );

    if (mismatch > 0) issues.push({ y, mismatch, avgDiff, mismatchSamples, total: data.length });
  }

  // 이슈 연도 상세 출력
  if (issues.length > 0) {
    console.log('\n  ── 이슈 연도 상세 ───────────────────────────────────────');
    for (const { y, mismatch, avgDiff, mismatchSamples, total } of issues) {
      console.log(`\n  [${y}년] 불일치 ${mismatch}건 / ${total}건  평균차이 ${formatWon(Math.abs(avgDiff))}`);
      for (const { r, diff } of mismatchSamples) {
        const calc  = 승식들.reduce((s, f) => s + (r.sales[f] || 0), 0);
        const zeros = 승식들.filter(s => !(r.sales[s] > 0));
        console.log(`    round=${r.round ?? '?'} day=${r.day ?? '?'} raceNo=${r.raceNo ?? '?'}`);
        console.log(`      승식합산: ${calc.toLocaleString()}원`);
        console.log(`      합계필드: ${(r.sales.합계 || 0).toLocaleString()}원`);
        console.log(`      차이:    +${diff.toLocaleString()}원`);
        if (zeros.length > 0) console.log(`      0인 승식: ${zeros.join(', ')}`);
      }
    }
  } else {
    console.log('\n  🎉 전 연도 합계 불일치 없음!');
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────
// 3단계: 각 승식 최초 등장 회차 추적
// ─────────────────────────────────────────────────────────────
function step3_도입시점추적() {
  console.log('\n' + '═'.repeat(70));
  console.log('  3단계: 각 승식의 최초 등장 연도·회차 추적');
  console.log('═'.repeat(70));

  const firstAppearance = {};
  for (const s of 승식들) firstAppearance[s] = null;

  for (let y = 2003; y <= 2026; y++) {
    const data = loadYear(y);
    if (!data) continue;

    for (const s of 승식들) {
      if (firstAppearance[s]) continue;

      const firstRace = data
        .filter(r => r.sales?.[s] > 0)
        .sort((a, b) => (a.round - b.round) || (a.day - b.day) || (a.raceNo - b.raceNo))[0];

      if (firstRace) {
        firstAppearance[s] = {
          year:   y,
          round:  firstRace.round,
          day:    firstRace.day,
          raceNo: firstRace.raceNo,
          amount: firstRace.sales[s],
        };
      }
    }
  }

  console.log('\n  승식      최초 등장');
  console.log('  ' + '─'.repeat(55));
  for (const s of 승식들) {
    const f = firstAppearance[s];
    if (!f) {
      console.log(`  ${s.padEnd(6)}  ❌ 전 연도에서 매출 없음`);
    } else {
      console.log(
        `  ${s.padEnd(6)}  ${f.year}년 ${f.round}회차 ${f.day}일차 ${f.raceNo}경주` +
        `  (첫 매출: ${f.amount.toLocaleString()}원)`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 4단계: 최종 요약
// ─────────────────────────────────────────────────────────────
function step4_최종요약(issues) {
  console.log('\n' + '═'.repeat(70));
  console.log('  4단계: 연간 총매출 최종 집계 (sales.합계 기준)');
  console.log('═'.repeat(70));

  let grandTotal = 0;
  for (let y = 2003; y <= 2026; y++) {
    const data = loadYear(y);
    if (!data) continue;
    const total = data.reduce((s, r) => s + (r.sales?.합계 || 0), 0);
    grandTotal += total;
    const flag = issues.find(i => i.y === y) ? ' ⚠ 승식분해 일부누락' : '';
    console.log(`  ${y}: ${formatWon(total)}${flag}`);
  }
  console.log(`\n  전체 합계: ${formatWon(grandTotal)}`);

  console.log('\n  ▶ 개발 가이드:');
  console.log('  ✅ 연간 총매출 집계 → sales.합계 사용 (전 연도 신뢰 가능)');
  if (issues.length === 0) {
    console.log('  ✅ 승식별 비중 분석 → 전 연도 사용 가능');
  } else {
    console.log('  ⚠ 승식별 비중 분석 → 아래 연도 주의:');
    for (const { y, mismatch, total } of issues) {
      console.log(`     - ${y}년: ${mismatch}건 (${((mismatch / total) * 100).toFixed(1)}%) 승식 분해 누락`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   경륜 매출 전 연도(2003~2026) 전수 검증 스크립트       ║');
console.log('╚══════════════════════════════════════════════════════════╝');

step1_승식도입현황();
const issues = step2_합계불일치();
step3_도입시점추적();
step4_최종요약(issues);

console.log('\n' + '═'.repeat(70));
console.log('  검증 완료');
console.log('═'.repeat(70) + '\n');
