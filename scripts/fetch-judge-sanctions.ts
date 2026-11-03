/**
 * 심판제재선수 수집 스크립트 (kcycle — 광명)
 * 출처: https://www.kcycle.or.kr/race/judge/sanctionsracer
 *
 * 실행:
 *   npx tsx scripts/fetch-judge-sanctions.ts              # 2016~올해 전체
 *   npx tsx scripts/fetch-judge-sanctions.ts --year 2026  # 특정 연도
 *   npx tsx scripts/fetch-judge-sanctions.ts --dry-run    # 저장 없이 파싱만 테스트
 *
 * ⚠️ 2026-11-03 실측 — 이 페이지의 함정 3가지:
 *   1) 연도 목록이 특정 행 때문에 서버 오류 페이지("예상치 못한 오류")를 낸다.
 *      2022·2023 은 7페이지부터 오류 → 예전 수집기는 이를 "0건 = 끝"으로 보고 조용히 멈춰
 *      2022 287건 중 90건, 2023 194건 중 90건만 저장됐다.
 *      → 연도 목록에 오류가 나면 회차(tms) 필터로 회차마다 다시 받는다.
 *   2) 회차 필터를 걸면 No. 가 회차마다 1부터 다시 매겨진다 → No. 는 고유키가 될 수 없다.
 *      고유키는 내용 기준 dedup_key (supabase/migrations/20261103_judge_sanctions_dedup_key.sql).
 *   3) 일부 회차(2022 35회, 2023 1·3·9·11·15·16회)는 회차 필터·이름 검색으로도 오류가 난다.
 *      이 회차의 제재는 페이지에서 받을 방법이 없다 → 건수를 경고로 남긴다.
 *
 * 건수 검증: 연도 목록 첫 행의 No. = 그 연도 총건수 (연도별 합 = "연도 전체" 최대 No.).
 * 수집 건수 < 총건수 인데 오류 회차로 설명되지 않으면 실패 처리한다.
 *
 * 창원(lepopark)·부산(spo1) 심판제재는 각각 fetch-changwon-sanctions.ts / fetch-busan-sanctions.ts.
 * 공정제재(/racer/state/sanction)는 fetch-racer-sanctions.ts → racer_sanctions.
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
const DELAY_MS = 800
const FIRST_YEAR = 2016
const ERROR_MARK = '예상치 못한 오류'

/** 이 스크립트의 출처 구분값 (kcycle 심판제재 = 광명) */
const SOURCE = 'judge_racer'

interface PageRow {
  pageNo: number // 페이지에 보이는 No. (연도 목록이면 연도 No., 회차 목록이면 회차 내 No.)
  racer_name: string
  generation: string | null
  racer_id: string | null
  race_info: string | null
  regulation: string | null
  reason: string | null
  sanctionRaw: string
}

interface SanctionRecord {
  no: number | null
  dedup_key: string
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
  source: string
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const squash = (s: string | null) => (s ?? '').replace(/\s+/g, '')

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

function parseRows(html: string): PageRow[] {
  const $ = cheerio.load(html)
  const rows: PageRow[] = []
  $('table tbody tr').each((_, row) => {
    // kcycle uses mixed <th> and <td> cells in tbody rows
    const cells = $(row).find('th, td')
    if (cells.length < 4) return
    const pageNo = parseInt($(cells[0]).text().trim())
    if (isNaN(pageNo)) return

    const racerRaw = $(cells[1]).text().trim()
    const racerMatch = racerRaw.match(/^(.+?)\s*\/\s*(\d+기)(?:\s+(\d+))?/)
    const content = $(cells[2]).text().trim()
    const pick = (label: string) => {
      const m = content.match(new RegExp(`ㅁ${label}[:：]\\s*(.+?)(?=ㅁ|$)`, 's'))
      return m ? m[1].trim() : null
    }
    rows.push({
      pageNo,
      racer_name: racerMatch ? racerMatch[1].trim() : racerRaw,
      generation: racerMatch ? racerMatch[2].trim() : null,
      racer_id: racerMatch?.[3]?.trim() || null,
      race_info: pick('해당경주'),
      regulation: pick('시행규정'),
      reason: pick('제재사유'),
      sanctionRaw: $(cells[3]).text().trim(),
    })
  })
  return rows
}

function parseLastPage(html: string): number {
  let maxPage = 1
  for (const m of html.matchAll(/fnSearch\((\d+)\)/g)) maxPage = Math.max(maxPage, parseInt(m[1]))
  return maxPage
}

function parseTmsOptions(html: string): number[] {
  const $ = cheerio.load(html)
  return $('select#tms option')
    .map((_, o) => $(o).attr('value'))
    .get()
    .filter((v) => /^\d+$/.test(v))
    .map(Number)
}

/** 오류 페이지면 null */
async function fetchPage(params: Record<string, string | number>): Promise<string | null> {
  const body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
  let lastErr: unknown
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': BASE_URL,
        },
        body,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      return html.includes(ERROR_MARK) ? null : html
    } catch (e) {
      lastErr = e
      await sleep(2000 * (t + 1))
    }
  }
  throw new Error(`fetch 실패 (${JSON.stringify(params)}): ${String(lastErr)}`)
}

function toRecord(r: PageRow, no: number | null, dedupKey: string): SanctionRecord {
  const info = r.race_info
  return {
    no,
    dedup_key: dedupKey,
    racer_name: r.racer_name,
    generation: r.generation,
    racer_id: r.racer_id,
    race_info: info,
    race_year: info ? parseRaceYear(info) : null,
    venue: info ? parseVenue(info) : null,
    round: info ? parseRound(info) : null,
    day: info ? parseDay(info) : null,
    race_no: info ? parseRaceNo(info) : null,
    regulation: r.regulation,
    reason: r.reason,
    ...parseSanction(r.sanctionRaw),
    source: SOURCE,
  }
}

/**
 * 페이지 순서(연도 No. 내림차순)로 정렬된 행에 dedup_key 를 붙인다.
 * 규칙은 마이그레이션 20261103 과 같아야 한다: racer_id|해당경주|제재기간#k (k = 같은 내용 중 No. 오름차순 순번)
 */
function withDedupKeys(rowsDesc: { row: PageRow; no: number | null }[]): SanctionRecord[] {
  const asc = [...rowsDesc].reverse()
  const seen = new Map<string, number>()
  const out: SanctionRecord[] = []
  for (const { row, no } of asc) {
    const base = `${row.racer_id ?? ''}|${squash(row.race_info)}|${squash(parseSanction(row.sanctionRaw).sanction_value)}`
    const k = (seen.get(base) ?? 0) + 1
    seen.set(base, k)
    out.push(toRecord(row, no, `${base}#${k}`))
  }
  return out.reverse()
}

interface YearResult {
  year: number
  total: number // 연도 첫 행 No. = 페이지 총건수
  records: SanctionRecord[]
  erroredRounds: number[]
}

async function collectYear(year: number): Promise<YearResult> {
  console.log(`\n${'='.repeat(50)}\n📥 ${year}년`)
  const first = await fetchPage({ stndYear: year, 'pagination.currentPage': 1 })
  if (!first) throw new Error(`${year}년 1페이지부터 서버 오류`)
  const firstRows = parseRows(first)
  if (firstRows.length === 0) {
    console.log('  제재 없음')
    return { year, total: 0, records: [], erroredRounds: [] }
  }
  const total = firstRows[0].pageNo
  const lastPage = parseLastPage(first)

  // 1) 연도 목록 (No. = 연도 No.)
  const yearly: PageRow[] = [...firstRows]
  let yearlyBroken = false
  for (let p = 2; p <= lastPage; p++) {
    await sleep(DELAY_MS)
    const html = await fetchPage({ stndYear: year, 'pagination.currentPage': p })
    if (!html) {
      console.log(`  ⚠️ 연도 목록 ${p}페이지 서버 오류 → 회차별 수집으로 전환`)
      yearlyBroken = true
      break
    }
    yearly.push(...parseRows(html))
  }
  if (!yearlyBroken) {
    console.log(`  연도 목록 ${yearly.length}건 / 총 ${total}건`)
    return { year, total, records: withDedupKeys(yearly.map((row) => ({ row, no: row.pageNo }))), erroredRounds: [] }
  }

  // 2) 회차별 수집 (No. = 회차 내 번호)
  const tmsList = parseTmsOptions(first).sort((a, b) => b - a) // 페이지 순서와 같게 회차 내림차순
  const groups: { tms: number; rows: PageRow[] | null }[] = []
  for (const tms of tmsList) {
    const rows: PageRow[] = []
    let errored = false
    for (let p = 1; ; p++) {
      await sleep(DELAY_MS)
      const html = await fetchPage({ stndYear: year, tms, 'pagination.currentPage': p })
      if (!html) { errored = true; break }
      const r = parseRows(html)
      rows.push(...r)
      if (r.length === 0 || p >= parseLastPage(html)) break
    }
    groups.push({ tms, rows: errored ? null : rows.sort((a, b) => b.pageNo - a.pageNo) })
  }
  const erroredRounds = groups.filter((g) => g.rows === null).map((g) => g.tms)

  // 3) 연도 No. 복원: 첫 오류 회차 위쪽은 총건수부터 내려 세고, 마지막 오류 회차 아래쪽은 1부터 올려 센다.
  //    오류 회차 사이에 낀 행은 오류 회차의 건수를 몰라 확정할 수 없다 → NULL
  const flat: { row: PageRow; no: number | null }[] = []
  const errIdx = groups.flatMap((g, i) => (g.rows === null ? [i] : []))
  const firstErr = errIdx.length ? errIdx[0] : groups.length // 오류 회차가 없으면 전부 위에서 내려 센다
  const lastErr = errIdx.length ? errIdx[errIdx.length - 1] : groups.length
  let top = total
  groups.forEach((g, i) => {
    if (!g.rows) return
    for (const row of g.rows) flat.push({ row, no: i < firstErr ? top-- : null })
  })
  let bottom = 1
  for (let i = flat.length - 1, gi = groups.length - 1; gi > lastErr; gi--) {
    for (let j = (groups[gi].rows ?? []).length - 1; j >= 0; j--, i--) flat[i].no = bottom++
  }

  // 연도 목록에서 받은 행(연도 No. 확정)과 복원 번호가 맞는지 교차검증
  const byNo = new Map(yearly.map((r) => [r.pageNo, r]))
  let checked = 0, mismatched = 0
  for (const f of flat) {
    if (f.no === null) continue
    const y = byNo.get(f.no)
    if (!y) continue
    checked++
    if (y.racer_id !== f.row.racer_id || squash(y.race_info) !== squash(f.row.race_info)) mismatched++
  }
  console.log(`  연도 No. 복원 교차검증: ${checked}건 중 불일치 ${mismatched}건`)
  if (mismatched > 0) {
    console.warn('  ⚠️ 복원 번호 불일치 → 이 연도는 no 를 모두 NULL 로 저장')
    for (const f of flat) f.no = null
  }

  const collected = flat.length
  console.log(`  회차 ${tmsList.length}개 / 수집 ${collected}건 / 총 ${total}건 / 오류 회차: ${erroredRounds.join(', ') || '없음'}`)
  return { year, total, records: withDedupKeys(flat), erroredRounds }
}

async function save(records: SanctionRecord[]): Promise<number> {
  let saved = 0
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50)
    const { error } = await supabase.from('judge_sanctions').upsert(batch, { onConflict: 'source,dedup_key' })
    if (error) throw new Error(`저장 실패 (${i}~): ${error.message}`)
    saved += batch.length
  }
  return saved
}

async function main() {
  const args = process.argv.slice(2)
  const yearIdx = args.indexOf('--year')
  const dryRun = args.includes('--dry-run')
  const thisYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear()
  const years = yearIdx !== -1
    ? [parseInt(args[yearIdx + 1])]
    : Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i)

  console.log(`🚀 심판제재선수 수집 (kcycle) — ${years.join(', ')}년 / ${dryRun ? 'DRY RUN' : '저장'}`)
  let failed = false
  const summary: string[] = []
  for (const year of years) {
    const r = await collectYear(year)
    const missing = r.total - r.records.length
    const dupKeys = r.records.length - new Set(r.records.map((x) => x.dedup_key)).size
    if (dupKeys > 0) {
      console.error(`  ❌ dedup_key 중복 ${dupKeys}건 → 저장 안 함`)
      failed = true
      continue
    }
    if (missing > 0 && r.erroredRounds.length === 0) {
      console.error(`  ❌ 총 ${r.total}건 중 ${missing}건 누락인데 오류 회차가 없음 → 저장 안 함`)
      failed = true
      continue
    }
    if (missing > 0) console.warn(`  ⚠️ 서버 오류 회차(${r.erroredRounds.join(', ')})로 ${missing}건 수집 불가`)
    if (!dryRun && r.records.length) console.log(`  💾 upsert ${await save(r.records)}건`)
    summary.push(`${year}: 총 ${r.total} / 수집 ${r.records.length}${missing ? ` (불가 ${missing}, 오류 회차 ${r.erroredRounds.join('·')})` : ''}`)
    await sleep(1500)
  }

  if (!dryRun) {
    const { count } = await supabase.from('judge_sanctions').select('*', { count: 'exact', head: true }).eq('source', SOURCE)
    console.log(`\nDB source=${SOURCE}: ${count}건`)
  }
  console.log(`\n🏁 요약\n  ${summary.join('\n  ')}`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error('치명적 에러:', e instanceof Error ? e.message : e)
  process.exit(1)
})
