/**
 * 제재선수 현황 수집 스크립트 (제재유형 전체)
 * 출처: https://www.kcycle.or.kr/racer/state/sanction
 *
 * ⚠️ scripts/fetch-judge-sanctions.ts 와 출처가 다르다.
 *   - /race/judge/sanctionsracer : [No, 제재선수, 제재내용, 제재기간] — 합산적용 위주,
 *                                  서면경고가 거의 없음 (2026년 1건)
 *   - /racer/state/sanction      : [No, 제재선수, 처리결과, 제재사유, 시행일] — 서면경고 포함
 *                                  전 제재유형 (2026년 50건 중 서면경고 5건)
 *
 * ⚠️ pKind(제재종류) 필터를 걸면 No. 가 필터별로 1부터 다시 매겨진다.
 *    유형별로 나눠 수집하면 No 가 충돌하므로 반드시 pKind='' (전체) 로 한 번에 수집한다.
 *
 * 실행:
 *   npx tsx scripts/fetch-racer-state-sanctions.ts --year 2026 --dry-run
 *   npx tsx scripts/fetch-racer-state-sanctions.ts --year 2026
 */

import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = 'https://www.kcycle.or.kr/racer/state/sanction'
const DELAY_MS = 1500
const SOURCE = 'racer_state'

/** pKind 코드 → 제재유형 (페이지 select 옵션 기준) */
const P_KIND: Record<string, string> = {
  '001': '서면경고',
  '002': '출전정지',
  '003': '경주관여정지',
  '004': '경주관여금지',
  '005': '등록취소',
  '006': '기타',
  '007': '주선제외',
}
const SANCTION_TYPES = Object.values(P_KIND)

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
  enforced_at: string | null
  source: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

/** "2026.06.12" → "2026-06-12" */
function parseEnforcedAt(s: string): string | null {
  const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/** 처리결과 셀: "서면경고 1회" / "출전정지 1회 2일" */
function parseSanction(raw: string) {
  const text = raw.trim()
  let sanction_type: string | null = null
  for (const t of SANCTION_TYPES) {
    if (text.includes(t)) {
      sanction_type = t
      break
    }
  }
  const m = text.match(/(\d+)\s*(일|회|개월)/)
  return {
    sanction_type,
    sanction_value: text || null,
    sanction_days: m ? parseInt(m[1]) : null,
    sanction_unit: m ? m[2] : null,
  }
}

function parseRows(html: string): SanctionRecord[] {
  const $ = cheerio.load(html)
  const records: SanctionRecord[] = []

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('th, td')
    // [No, 제재선수, 처리결과, 제재사유, 시행일] — 5셀
    if (cells.length < 5) return

    const no = parseInt($(cells[0]).text().trim())
    if (isNaN(no)) return

    const racerRaw = $(cells[1]).text().trim().replace(/\s+/g, ' ')
    // "김 훈 / 30기 20250008" — 이름에 공백이 들어가는 선수가 있다
    const racerMatch = racerRaw.match(/^(.+?)\s*\/\s*(\d+기)(?:\s+(\d+))?/)
    const racer_name = (racerMatch ? racerMatch[1] : racerRaw).trim()
    const generation = racerMatch ? racerMatch[2].trim() : null
    const racer_id = racerMatch?.[3]?.trim() || null

    const { sanction_type, sanction_value, sanction_days, sanction_unit } = parseSanction(
      $(cells[2]).text()
    )

    const content = $(cells[3]).text().trim()
    const raceInfoMatch = content.match(/ㅁ해당경주[:：]\s*(.+?)(?=ㅁ|$)/s)
    const regulationMatch = content.match(/ㅁ시행규정[:：]\s*(.+?)(?=ㅁ|$)/s)
    const reasonMatch = content.match(/ㅁ제재사유[:：]\s*(.+?)(?=ㅁ|$)/s)

    const race_info = raceInfoMatch ? raceInfoMatch[1].trim().replace(/\s+/g, ' ') : null
    const regulation = regulationMatch ? regulationMatch[1].trim().replace(/\s+/g, ' ') : null
    const reason = reasonMatch ? reasonMatch[1].trim() : null

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
      enforced_at: parseEnforcedAt($(cells[4]).text().trim()),
      source: SOURCE,
    })
  })

  return records
}

function parseLastPage(html: string): number {
  let maxPage = 1
  for (const m of html.matchAll(/fnSearch\((\d+)\)/g)) {
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
      Accept: 'text/html,application/xhtml+xml',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: BASE_URL,
    },
    // pKind='' = 제재종류 전체. 유형별로 나누면 No 가 재부여되어 충돌한다.
    body: `stndYear=${year}&pKind=&pagination.currentPage=${pageIndex}`,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${BASE_URL} (year=${year}, page=${pageIndex})`)
  return res.text()
}

// ── 교차검증 ──────────────────────────────────────────────────
function validate(year: number, records: SanctionRecord[]): boolean {
  console.log(`\n🔍 [교차검증] ${year}년`)

  const noList = records.map((r) => r.no)
  const noSet = new Set(noList)
  const duplicates = noList.filter((n, i) => noList.indexOf(n) !== i)
  console.log(`  중복 no: ${duplicates.length === 0 ? '없음 ✅' : `${[...new Set(duplicates)].join(', ')} ❌`}`)

  const sorted = [...noSet].sort((a, b) => a - b)
  const missing: number[] = []
  for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) {
    if (!noSet.has(i)) missing.push(i)
  }
  console.log(`  no 연속성: ${missing.length === 0 ? '이상 없음 ✅' : `누락 ${missing.join(', ')} ⚠️`}`)

  const mismatches = records.filter((r) => r.race_year !== null && r.race_year !== year)
  console.log(`  연도 일치: ${mismatches.length === 0 ? '✅' : `불일치 ${mismatches.length}건 ⚠️`}`)
  mismatches.slice(0, 3).forEach((r) =>
    console.log(`    → no.${r.no} ${r.racer_name}: "${r.race_info}" (파싱=${r.race_year})`)
  )

  const noName = records.filter((r) => !r.racer_name)
  console.log(`  이름 누락: ${noName.length === 0 ? '없음 ✅' : `${noName.length}건 ❌`}`)

  const noType = records.filter((r) => !r.sanction_type)
  console.log(`  제재유형 미파싱: ${noType.length}건 ${noType.length === 0 ? '✅' : '⚠️'}`)
  noType.slice(0, 3).forEach((r) => console.log(`    → no.${r.no} "${r.sanction_value}"`))

  const noDate = records.filter((r) => !r.enforced_at)
  console.log(`  시행일 미파싱: ${noDate.length}건 ${noDate.length === 0 ? '✅' : '⚠️'}`)

  // 제재유형 분포 — 서면경고가 0건이면 필터가 잘못 걸린 것이다
  const byType = new Map<string, number>()
  for (const r of records) byType.set(r.sanction_type || '(미파싱)', (byType.get(r.sanction_type || '(미파싱)') || 0) + 1)
  console.log(`  제재유형 분포:`)
  for (const [t, c] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`    ${t}: ${c}건`)

  const written = byType.get('서면경고') || 0
  if (written === 0) {
    console.log(`  ⚠️ 서면경고 0건 — pKind 필터가 잘못 걸렸는지 확인 필요`)
  }

  const passed = duplicates.length === 0 && noName.length === 0
  console.log(`  결과: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  return passed
}

// ── DB 저장 ────────────────────────────────────────────────────
async function saveAndVerify(year: number, records: SanctionRecord[]): Promise<void> {
  console.log(`\n💾 Supabase 저장 중... (${records.length}건, source=${SOURCE})`)

  const BATCH = 50
  let saved = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase
      .from('judge_sanctions')
      .upsert(batch, { onConflict: 'source,no,race_year,venue' })
    if (error) {
      console.error(`  ❌ 배치 저장 실패 (${i}~${i + BATCH}):`, error.message)
    } else {
      saved += batch.length
    }
  }
  console.log(`  저장 완료: ${saved}건`)

  const { count, error } = await supabase
    .from('judge_sanctions')
    .select('*', { count: 'exact', head: true })
    .eq('race_year', year)
    .eq('source', SOURCE)

  if (error) {
    console.log(`  DB 재조회 실패: ${error.message}`)
  } else {
    const ok = count === records.length
    console.log(`  DB 재조회(source=${SOURCE}): ${count}건 ${ok ? '✅' : `❌ (예상 ${records.length}건)`}`)
  }
}

// ── 연도별 수집 ────────────────────────────────────────────────
async function collectYear(year: number, dryRun: boolean): Promise<void> {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`📥 ${year}년 수집 시작 (제재종류 전체)`)

  let html: string
  try {
    html = await fetchPage(year, 1)
  } catch (e) {
    console.error(`  ❌ fetch 실패:`, e)
    return
  }

  const firstPage = parseRows(html)
  if (firstPage.length === 0) {
    console.log(`  ⚠️ ${year}년 데이터 없음`)
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
      console.log(`  ${page}페이지: ${rows.length}건 (no ${rows[rows.length - 1]?.no}~${rows[0]?.no})`)
    } catch (e) {
      console.error(`  ❌ ${page}페이지 실패:`, e)
      break
    }
  }

  console.log(`\n  📊 총 수집: ${allRecords.length}건`)

  const samples = allRecords.filter((r) => r.sanction_type === '서면경고').slice(0, 3)
  if (samples.length > 0) {
    console.log(`\n  서면경고 샘플:`)
    samples.forEach((r) =>
      console.log(`    no.${r.no} | ${r.racer_name}(${r.generation}) | ${r.race_info} | ${r.sanction_value} | ${r.enforced_at}`)
    )
  }

  const passed = validate(year, allRecords)

  if (dryRun) {
    console.log(`\n  [DRY RUN] DB 저장 건너뜀`)
    return
  }
  if (!passed) {
    console.log(`\n  ❌ 검증 실패 — DB 저장 중단`)
    return
  }

  await saveAndVerify(year, allRecords)
}

async function main() {
  const args = process.argv.slice(2)
  const yearIdx = args.indexOf('--year')
  const targetYear = yearIdx !== -1 ? parseInt(args[yearIdx + 1]) : null
  const dryRun = args.includes('--dry-run')

  const years = targetYear
    ? [targetYear]
    : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

  console.log(`🚀 제재선수 현황 수집 (${BASE_URL})`)
  console.log(`대상: ${years.join(', ')}년`)
  console.log(`모드: ${dryRun ? 'DRY RUN' : '실제 저장'}`)

  for (const year of years) {
    await collectYear(year, dryRun)
    await sleep(2000)
  }

  console.log(`\n🏁 완료`)
}

main().catch(console.error)
