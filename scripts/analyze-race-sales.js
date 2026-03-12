/**
 * 경륜 매출 데이터 분석 & 검증 스크립트
 * 사용법: node scripts/analyze-race-sales.js
 *
 * 수행 작업:
 * 1. 수집된 데이터 상세 설명
 * 2. 빈값/누락 데이터 체크
 * 3. 정확성 검증 계획 실행
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data', 'yearly-race-sales');

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function formatWon(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(4)}조`;
  if (n >= 1e8)  return `${Math.round(n / 1e8)}억`;
  return n.toLocaleString() + '원';
}

function loadYear(year) {
  const filePath = path.join(DATA_DIR, `${year}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ─────────────────────────────────────────────
// 1단계: 수집 데이터 상세 설명
// ─────────────────────────────────────────────
function step1_describe() {
  console.log('\n' + '═'.repeat(60));
  console.log('  1단계: 수집된 데이터 구조 및 내용 설명');
  console.log('═'.repeat(60));

  const sample = loadYear(2024);
  if (!sample || sample.length === 0) {
    console.log('  ⚠ 2024.json 없음 또는 비어있음');
    return;
  }

  const ex = sample[0];
  console.log('\n▶ 데이터 위치: src/data/yearly-race-sales/{연도}.json');
  console.log('\n▶ 레코드 1건 예시 (2024년 첫 번째 경주):');
  console.log(JSON.stringify(ex, null, 2));

  console.log('\n▶ 필드 설명:');
  const fields = {
    year:     '연도 (number)',
    round:    '회차 번호 (number) — 예: 1회차',
    day:      '일차 (number) — 1일차/2일차/3일차',
    raceNo:   '경주 번호 (number) — 예: 1경주~13경주',
    meetCd:   '경기장 코드 (string) — 001=광명, 002=창원, 003=부산',
    meetName: '경기장 이름 (string)',
    date:     '경주 날짜 (string, YYYY-MM-DD)',
    'sales.단승':  '단승식 매출 (원)',
    'sales.연승':  '연승식 매출 (원)',
    'sales.쌍승':  '쌍승식 매출 (원)',
    'sales.복승':  '복승식 매출 (원)',
    'sales.삼복승': '삼복승식 매출 (원)',
    'sales.쌍복승': '쌍복승식 매출 (원)',
    'sales.삼쌍승': '삼쌍승식 매출 (원)',
    'sales.합계': '경주 전체 합계 매출 (원)',
  };
  for (const [k, v] of Object.entries(fields)) {
    console.log(`  ${k.padEnd(15)} : ${v}`);
  }

  // 연도별 요약
  console.log('\n▶ 연도별 수집 현황:');
  console.log('  ' + '─'.repeat(54));
  console.log(`  ${'연도'.padEnd(6)} ${'경주수'.padEnd(8)} ${'연간 총매출'.padEnd(18)} ${'경기장수'}`);
  console.log('  ' + '─'.repeat(54));

  let totalRaces = 0, totalSales = 0;
  for (let y = 2003; y <= 2026; y++) {
    const data = loadYear(y);
    if (!data) { console.log(`  ${String(y).padEnd(6)} ❌ 파일 없음`); continue; }

    const races = data.length;
    const sales = data.reduce((s, r) => s + (r.sales?.합계 || 0), 0);
    const venues = [...new Set(data.map(r => r.meetName))].join('/');

    totalRaces += races;
    totalSales += sales;

    const marker = (races === 0) ? '⚠ ' : '✅ ';
    console.log(`  ${marker}${String(y).padEnd(4)} ${String(races).padStart(6)}건  ${formatWon(sales).padEnd(16)} ${venues}`);
  }
  console.log('  ' + '─'.repeat(54));
  console.log(`  ${'합계'.padEnd(6)} ${String(totalRaces).padStart(6)}건  ${formatWon(totalSales)}`);
}

// ─────────────────────────────────────────────
// 2단계: 빈값/누락 데이터 체크
// ─────────────────────────────────────────────
function step2_checkMissing() {
  console.log('\n' + '═'.repeat(60));
  console.log('  2단계: 빈값 / 누락 데이터 체크');
  console.log('═'.repeat(60));

  const salesFields = ['단승','연승','쌍승','복승','삼복승','쌍복승','삼쌍승','합계'];
  let totalIssues = 0;

  for (let y = 2003; y <= 2026; y++) {
    const data = loadYear(y);
    if (!data) { console.log(`\n  [${y}] ❌ 파일 없음`); totalIssues++; continue; }

    const issues = [];

    // A. 레코드 수 0건
    if (data.length === 0) issues.push('레코드 0건');

    // B. 필수 필드 누락
    let missingFields = 0, nullSales = 0, zeroTotal = 0, badDate = 0;
    for (const r of data) {
      if (!r.year || !r.round || !r.day || !r.raceNo || !r.meetCd || !r.date) missingFields++;
      if (!r.sales) { nullSales++; continue; }

      // 합계가 0인 경주
      if (r.sales.합계 === 0) zeroTotal++;

      // 날짜 형식 체크 (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) badDate++;
    }

    if (missingFields > 0) issues.push(`필수필드 누락 ${missingFields}건`);
    if (nullSales > 0)     issues.push(`sales 객체 없음 ${nullSales}건`);
    if (zeroTotal > 0)     issues.push(`합계=0 ${zeroTotal}건`);
    if (badDate > 0)       issues.push(`날짜형식 이상 ${badDate}건`);

    // C. 경기장 코드 체크
    const invalidMeet = data.filter(r => !['001','002','003'].includes(r.meetCd));
    if (invalidMeet.length > 0) issues.push(`미확인 경기장코드 ${invalidMeet.length}건`);

    // D. 승식별 합계 검증 (오차 1원 이내)
    let sumMismatch = 0;
    for (const r of data) {
      if (!r.sales) continue;
      const calc = salesFields.slice(0, -1).reduce((s, f) => s + (r.sales[f] || 0), 0);
      if (Math.abs(calc - (r.sales.합계 || 0)) > 1) sumMismatch++;
    }
    if (sumMismatch > 0) issues.push(`승식합계 불일치 ${sumMismatch}건`);

    if (issues.length === 0) {
      console.log(`\n  [${y}] ✅ 이상 없음 (${data.length}건)`);
    } else {
      console.log(`\n  [${y}] ⚠ 문제 발견 (${data.length}건):`);
      issues.forEach(i => console.log(`       - ${i}`));
      totalIssues += issues.length;
    }
  }

  console.log(`\n  ─────────────────────────────`);
  if (totalIssues === 0) {
    console.log('  🎉 전체 데이터 이상 없음!');
  } else {
    console.log(`  ⚠ 총 ${totalIssues}개 이슈 발견 → 3단계 검증 계획 참고`);
  }
}

// ─────────────────────────────────────────────
// 3단계: 정확성 검증 계획 출력
// ─────────────────────────────────────────────
function step3_verificationPlan() {
  console.log('\n' + '═'.repeat(60));
  console.log('  3단계: 데이터 정확성 검증 계획');
  console.log('═'.repeat(60));

  // 샘플 교차검증: kcycle.or.kr TOP3 vs 우리 데이터
  console.log('\n▶ [검증 A] kcycle.or.kr TOP3 vs 우리 데이터 교차검증');
  console.log('  kcycle.or.kr은 연도별 매출 TOP3 회차를 공개합니다.');
  console.log('  우리 데이터에서 상위 3 회차를 뽑아 비교합니다.\n');

  for (const year of [2022, 2023, 2024, 2025]) {
    const data = loadYear(year);
    if (!data || data.length === 0) continue;

    // 회차별 합계
    const byRound = {};
    for (const r of data) {
      const key = `${r.round}회차`;
      byRound[key] = (byRound[key] || 0) + (r.sales?.합계 || 0);
    }
    const top3 = Object.entries(byRound)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    console.log(`  [${year}년] 우리 데이터 TOP3 회차:`);
    top3.forEach(([k, v], i) =>
      console.log(`    ${i+1}위 ${k.padEnd(6)} : ${formatWon(v)}`)
    );
    console.log(`  → kcycle.or.kr에서 직접 확인 필요: https://www.kcycle.or.kr/race/statistics/salesStat`);
    console.log();
  }

  // 검증 B: 연간 합계 총계
  console.log('▶ [검증 B] 연간 총매출 합산 일치 여부');
  console.log('  경주별 sales.합계를 모두 더한 값 = 연간 총 발매액이어야 함\n');
  for (const year of [2022, 2023, 2024]) {
    const data = loadYear(year);
    if (!data) continue;
    const total = data.reduce((s, r) => s + (r.sales?.합계 || 0), 0);
    const byField = data.reduce((s, r) => {
      if (!r.sales) return s;
      return s + ['단승','연승','쌍승','복승','삼복승','쌍복승','삼쌍승']
        .reduce((ss, f) => ss + (r.sales[f] || 0), 0);
    }, 0);
    const diff = Math.abs(total - byField);
    const ok = diff <= data.length; // 경주당 1원 오차 허용
    console.log(`  [${year}] 합계필드 합산: ${formatWon(total)}`);
    console.log(`         승식별 합산: ${formatWon(byField)}`);
    console.log(`         차이: ${diff}원 → ${ok ? '✅ 정상' : '⚠ 불일치'}\n`);
  }

  // 검증 C: 날짜 연속성
  console.log('▶ [검증 C] 날짜 연속성 — 비정상적 공백 탐지');
  for (const year of [2022, 2023, 2024, 2025]) {
    const data = loadYear(year);
    if (!data) continue;
    const dates = [...new Set(data.map(r => r.date))].sort();
    let maxGap = 0, maxGapDate = '';
    for (let i = 1; i < dates.length; i++) {
      const gap = (new Date(dates[i]) - new Date(dates[i-1])) / 86400000;
      if (gap > maxGap) { maxGap = gap; maxGapDate = `${dates[i-1]} → ${dates[i]}`; }
    }
    console.log(`  [${year}] 최대 공백: ${maxGap}일 (${maxGapDate})`);
  }

  console.log('\n▶ [검증 D] 수동 샘플 체크 가이드');
  console.log('  아래 URL에서 직접 경주 1~2개를 선택해 매출 숫자를 비교하세요:');
  console.log('  https://www.kcycle.or.kr/race/dividendrate/final/{연도}/{회차}/{일차}/{경기장코드}/{경주번호}');
  console.log('  예시 (2024년 1회차 1일차 광명 1경주):');
  console.log('  https://www.kcycle.or.kr/race/dividendrate/final/2024/1/1/001/1\n');

  console.log('▶ [검증 E] 코로나 특이값 확인');
  console.log('  2020년 402건, 2021년 798건은 경주 자체가 적었던 것임');
  const d2020 = loadYear(2020), d2021 = loadYear(2021);
  if (d2020) {
    const dates2020 = [...new Set(d2020.map(r => r.date))].sort();
    console.log(`  2020 첫 경주일: ${dates2020[0]}, 마지막: ${dates2020[dates2020.length-1]}`);
  }
  if (d2021) {
    const dates2021 = [...new Set(d2021.map(r => r.date))].sort();
    console.log(`  2021 첫 경주일: ${dates2021[0]}, 마지막: ${dates2021[dates2021.length-1]}`);
  }
}

// ─────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────
console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║   경륜 매출 데이터 분석 & 검증 스크립트 v1.0      ║');
console.log('╚═══════════════════════════════════════════════════╝');

step1_describe();
step2_checkMissing();
step3_verificationPlan();

console.log('\n' + '═'.repeat(60));
console.log('  분석 완료');
console.log('═'.repeat(60) + '\n');
