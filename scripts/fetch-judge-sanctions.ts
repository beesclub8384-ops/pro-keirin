/**
 * 심판제재선수 수집 스크립트
 * 출처: https://www.kcycle.or.kr/race/judge/sanctionsracer
 * 범위: 2022년 ~ 현재
 *
 * 실행:
 *   npx tsx scripts/fetch-judge-sanctions.ts              # 2022~현재 전체
 *   npx tsx scripts/fetch-judge-sanctions.ts --year 2026  # 특정 연도
 *   npx tsx scripts/fetch-judge-sanctions.ts --dry-run    # 저장 없이 파싱만 테스트
 */

import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = 'https://www.kcycle.or.kr/race/judge/sanctionsracer'
const DELAY_MS = 1200

interface SanctionRecord {
  no: number
  racer_name: string
  generation: string | null
  racer_id: string | null
  race_info: string | null
  race_year: number | null
  venue: string | null
  round: number | null
  day: number | null
  race_no: number | null
  regulation: string | null
  reason: string | null
  sanction_type: string | null
  sanction_value: string | null
  sanction_days: number | null
  sanction_unit: string | null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseRaceYear(s: string): number | null {
  const m = s.match(/(\d{2})년/)
  return m ? 2000 + parseInt(m[1]) : null
}

function parseVenue(s: string): string | null {
  for (const v of ['광명', '창원', '부산']) {
    if (s.includes(v)) return v
  }
  return null
}

function parseRound(s: string): number | null {
  const m = s.match(/제(\d+)회/)
  return m ? parseInt(m[1]) : null
}

function parseDay(s: string): number | null {
  const m = s.match(/(\d+)일차/)
  return m ? parseInt(m[1]) : null
}

function parseRaceNo(s: string): number | null {
  const m = s.match(/(\d+)경주/)
  return m ? parseInt(m[1]) : null
}

function parseSanction(raw: string) {
  const types = ['출전정지', '서면경고', '주선제외', '경주관여금지', '경주관여정지', '등록취소', '기타']
  let sanction_type: string | null = null
  for (const t of types) {
    if (raw.includes(t)) { sanction_type = t; break }
  }
  const m = raw.match(/(\d+)(일|회|개월)/)
  return {
    sanction_type,
    sanction_value: raw.trim() || null,
    sanction_days: m ? parseInt(m[1]) : null,
    sanction_unit: m ? m[2] : null,
  }
}

function parseRows(html: string): SanctionRecord[] {
  const $ = cheerio.load(html)
  const records: SanctionRecord[] = []

  $('table tbody tr').each((_, row) => {
    // kcycle uses mixed <th> and <td> cells in tbody rows
    const cells = $(row).find('th, td')
    if (cells.length < 4) return

    const no = parseInt($(cells[0]).text().trim())
    if (isNaN(no)) return

    const racerRaw = $(cells[1]).text().trim()
    const racerMatch = racerRaw.match(/^(.+?)\s*\/\s*(\d+기)(?:\s+(\d+))?/)
    const racer_name = racerMatch ? racerMatch[1].trim() : racerRaw
    const generation = racerMatch ? racerMatch[2].trim() : null
    const racer_id = racerMatch?.[3]?.trim() || null

    const content = $(cells[2]).text().trim()
    const raceInfoMatch = content.match(/ㅁ해당경주[:：]\s*(.+?)(?=ㅁ|$)/s)
    const regulationMatch = content.match(/ㅁ시행규정[:：]\s*(.+?)(?=ㅁ|$)/s)
    const reasonMatch = content.match(/ㅁ제재사유[:：]\s*(.+?)(?=ㅁ|$)/s)

    const race_info = raceInfoMatch ? raceInfoMatch[1].trim() : null
    const regulation = regulationMatch ? regulationMatch[1].trim() : null
    const reason = reasonMatch ? reasonMatch[1].trim() : null

    const { sanction_type, sanction_value, sanction_days, sanction_unit } =
      parseSanction($(cells[3]).text().trim())

    records.push({
      no,
      racer_name,
      generation,
      racer_id,
      race_info,
      race_year: race_info ? parseRaceYear(race_info) : null,
      venue: race_info ? parseVenue(race_info) : null,
      round: race_info ? parseRound(race_info) : null,
      day: race_info ? parseDay(race_info) : null,
      race_no: race_info ? parseRaceNo(race_info) : null,
      regulation,
      reason,
      sanction_type,
      sanction_value,
      sanction_days,
      sanction_unit,
    })
  })

  return records
}

function parseLastPage(html: string): number {
  // Extract max page from fnSearch(N) onclick calls
  let maxPage = 1
  const matches = html.matchAll(/fnSearch\((\d+)\)/g)
  for (const m of matches) {
    const n = parseInt(m[1])
    if (n > maxPage) maxPage = n
  }
  return maxPage
}

async function fetchPage(year: number, pageIndex: number): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': BASE_URL,
    },
    body: `stndYear=${year}&pagination.currentPage=${pageIndex}`,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${BASE_URL} (year=${year}, page=${pageIndex})`)
  return res.text()
}

// ── 교차검증 ──────────────────────────────────────────────────
function validate(year: number, records: SanctionRecord[]): boolean {
  console.log(`\n🔍 [교차검증] ${year}년`)

  // 1. 중복 no 검사
  const noList = records.map(r => r.no)
  const noSet = new Set(noList)
  const duplicates = noList.filter((n, i) => noList.indexOf(n) !== i)
  console.log(`  중복 no: ${duplicates.length === 0 ? '없음 ✅' : `${duplicates.join(', ')} ❌`}`)

  // 2. no 연속성 검사 (빠진 번호)
  const sorted = [...noSet].sort((a, b) => a - b)
  const missing: number[] = []
  for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) {
    if (!noSet.has(i)) missing.push(i)
  }
  if (missing.length === 0) {
    console.log(`  no 연속성: 이상 없음 ✅`)
  } else {
    console.log(`  누락 no: ${missing.join(', ')} ⚠️ (${missing.length}건, 연도 경계 가능)`)
  }

  // 3. race_year 불일치 검사
  const mismatches = records.filter(r => r.race_year !== null && r.race_year !== year)
  if (mismatches.length === 0) {
    console.log(`  연도 일치: ✅`)
  } else {
    console.log(`  연도 불일치: ${mismatches.length}건 ⚠️`)
    mismatches.slice(0, 3).forEach(r =>
      console.log(`    → no.${r.no} ${r.racer_name}: "${r.race_info}" (파싱=${r.race_year})`)
    )
  }

  // 4. 필수 필드 누락 검사
  const noName = records.filter(r => !r.racer_name)
  console.log(`  이름 누락: ${noName.length === 0 ? '없음 ✅' : `${noName.length}건 ❌`}`)

  // 5. 제재유형 파싱 실패 검사
  const noType = records.filter(r => !r.sanction_type)
  console.log(`  제재유형 미파싱: ${noType.length}건 ${noType.length === 0 ? '✅' : '⚠️'}`)

  const passed = duplicates.length === 0 && noName.length === 0
  console.log(`  결과: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  return passed
}

// ── DB 저장 후 재조회 검증 ──────────────────────────────────────
async function saveAndVerify(year: number, records: SanctionRecord[]): Promise<void> {
  console.log(`\n💾 Supabase 저장 중... (${records.length}건)`)

  const BATCH = 50
  let saved = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase
      .from('judge_sanctions')
      .upsert(batch, { onConflict: 'no,race_year,venue' })
    if (error) {
      console.error(`  ❌ 배치 저장 실패 (${i}~${i + BATCH}):`, error.message)
    } else {
      saved += batch.length
    }
  }
  console.log(`  저장 완료: ${saved}건`)

  // DB 재조회로 실제 저장 건수 확인
  const { count, error } = await supabase
    .from('judge_sanctions')
    .select('*', { count: 'exact', head: true })
    .eq('race_year', year)

  if (error) {
    console.log(`  DB 재조회 실패: ${error.message}`)
  } else {
    const ok = count === records.length
    console.log(`  DB 재조회: ${count}건 ${ok ? '✅' : `❌ (예상 ${records.length}건)`}`)
  }
}

// ── 연도별 수집 ────────────────────────────────────────────────
async function collectYear(year: number, dryRun: boolean): Promise<void> {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`📥 ${year}년 수집 시작`)

  // 1페이지 fetch
  let html: string
  try {
    html = await fetchPage(year, 1)
  } catch (e) {
    console.error(`  ❌ fetch 실패:`, e)
    return
  }

  const firstPage = parseRows(html)
  if (firstPage.length === 0) {
    console.log(`  ⚠️ ${year}년 데이터 없음 — HTML 앞 300자:`)
    console.log(html.substring(0, 300))
    return
  }

  const lastPage = parseLastPage(html)
  console.log(`  1페이지: ${firstPage.length}건 | 전체 ${lastPage}페이지 예상`)

  const allRecords: SanctionRecord[] = [...firstPage]

  for (let page = 2; page <= lastPage; page++) {
    await sleep(DELAY_MS)
    try {
      const pageHtml = await fetchPage(year, page)
      const rows = parseRows(pageHtml)
      if (rows.length === 0) {
        console.log(`  ⚠️ ${page}페이지 0건 — 종료`)
        break
      }
      allRecords.push(...rows)
      console.log(`  ${page}페이지: ${rows.length}건 (no: ${rows[rows.length-1]?.no}~${rows[0]?.no})`)
    } catch (e) {
      console.error(`  ❌ ${page}페이지 실패:`, e)
      break
    }
  }

  console.log(`\n  📊 총 수집: ${allRecords.length}건`)

  // 샘플 3건 출력 (항상)
  console.log(`\n  샘플 3건:`)
  allRecords.slice(0, 3).forEach(r =>
    console.log(`    no.${r.no} | ${r.racer_name}(${r.generation}) | ${r.race_info} | ${r.sanction_type} ${r.sanction_value}`)
  )

  // 교차검증
  const passed = validate(year, allRecords)

  if (dryRun) {
    console.log(`\n  [DRY RUN] DB 저장 건너뜀`)
    return
  }

  if (!passed) {
    console.log(`\n  ❌ 검증 실패 — DB 저장 중단. 위 결과 확인 후 재실행.`)
    return
  }

  await saveAndVerify(year, allRecords)
}

// ── 엔트리포인트 ───────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const yearIdx = args.indexOf('--year')
  const targetYear = yearIdx !== -1 ? parseInt(args[yearIdx + 1]) : null
  const dryRun = args.includes('--dry-run')

  const years = targetYear ? [targetYear] : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

  console.log(`🚀 심판제재선수 수집`)
  console.log(`대상: ${years.join(', ')}년`)
  console.log(`모드: ${dryRun ? 'DRY RUN' : '실제 저장'}`)

  for (const year of years) {
    await collectYear(year, dryRun)
    await sleep(2000)
  }

  console.log(`\n🏁 완료`)
}

main().catch(console.error)
