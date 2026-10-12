# CURRENT_TASK: 낙차 대장 화면 (1단계 — 조회 전용)

## 작업 목표

날짜별·구장별로 낙차/사고/실격 선수를 **조회 전용**으로 보여주는 관리자 화면을 추가한다.
선수는 `racer_id`로 확정 식별하고, 각 날짜·구장의 경주 수·선수 행 수를 함께 노출해
"사고 0건"이 실제 무사고인지 수집 실패인지 구분할 수 있게 한다.
2단계(통장 캡처 AI 판독 → 사람 확인 → 저장)를 막지 않는 데이터 구조를 1단계에서 미리 잡는다.

### 승인된 결정 (2026-10-12)

1. 경로는 **`/admin/falls`** (인증 일관성 — `verifyAdmin` 쿠키 방식 재사용)
2. **Header 메뉴에는 추가하지 않는다.** `/vault` 화면에 링크만 추가
3. 건강검진 제안 4번 포함 — **출주표는 있는데 결과가 없는 날짜·구장을 경고 줄로 표시**
4. 1단계 범위는 계획서대로 유지. **수집 스크립트와 워크플로는 수정하지 않는다**

### 1단계 범위 밖 (명시적 제외)

- 통장 캡처 업로드, AI 판독, 지급 건 저장/수정 (= 2단계)
- 로그인 방식 변경 (쿠키에 비밀번호 원문 저장 문제는 그대로 둔다)
- RLS 정책 변경
- `scripts/` 수집 스크립트, `.github/workflows/` 수정
- 누락 구간(2026-08-28 부산·창원, 09-11 광명, 10-11 광명) 재수집

---

## 사전 확정된 사실 (조사 완료 — 재확인 불필요)

| 항목 | 확인 결과 |
|---|---|
| 낙차·사고 | `race_results.withdrawal` (타선수로낙차/상호접촉낙차/스스로낙차/타선수를낙차 + …사고 4종 + 경주기권/사고기권) |
| 실격 | `race_results.disqualified` = `'1'` 또는 `'2'` (건수형) |
| 골인 후 특이 | `race_results.finish` (사고입/골인후낙차/낙활입/낙재입/낙휴입/골인후사고) |
| 완주 실패 | `race_results.rank IS NULL` (4,614행, 전부 withdrawal 또는 disqualified 동반) |
| **빈값 표기 2종** | 광명 계열 `'-'`·`'::'` / 창원·부산 계열 `NULL` → **둘 다 빈값 처리 필수** |
| 선수 식별 | `race_results`에 `racer_id` **없음** (`name` 텍스트만). 동명이인 11명 존재 |
| racer_id 경로 | `decision_card_entries.racer_id` ← `(date, venue, race_no, back_no)` 조인. racer_id NULL 비율 0.00% |
| 조인 키 유일성 | `races` UNIQUE(year,round,day,race_no,venue) / `race_results` UNIQUE(race_id,back_no) / `decision_card_entries` UNIQUE(dc_race_id,back_no) |
| `races.round` 타입 | **text** (smallint 아님) — 숫자 비교·정렬 주의 |
| 인증 재사용 대상 | `verifyAdmin()` — `src/lib/auth/verify-admin.ts`, 쿠키 `interview_admin_token`, env `INTERVIEW_ADMIN_PASSWORD` |
| 로그인 엔드포인트 | `POST /api/interview/admin/auth` (비밀번호) / `GET` 같은 경로 (인증 상태) |
| 페이지네이션 헬퍼 | `fetchAllRows(query, { orderedBy })` — `src/lib/supabase.ts:81`. 정렬은 호출자가 `.order()` 로 직접 건다 |
| 참고 패턴 | `src/app/api/admin/vote-results/route.ts` (verifyAdmin + createAdminClient) |
| UI 컴포넌트 | `src/components/ui/` — badge, button, card, input, select, table, tabs 등 |

---

## 구현 단계

### Step 1. 분류 로직 단일 모듈 — `src/lib/falls.ts` (신규)

- `isBlank(v)` — `v == null || v === '-' || v === '::' || v.trim() === ''`
- `classifyFall(row)` → `{ fallType, isDisqualified, finishNote }`
  - `fallType`: `'낙차' | '사고' | null` (`withdrawal` 문자열에 `낙차` / `사고`·`기권` 포함 여부)
  - `isDisqualified`: `disqualified` 비어있지 않음 → **낙차와 별도 필드** (요청 사항)
  - `finishNote`: `finish` 비어있지 않으면 그 값 (완주 후 낙차 — 성격이 다르므로 분리)
- `isFallCandidate(row)` — `rank IS NULL` 또는 위 3개 중 하나라도 값 있음
- `fallEventKey({date, venue, raceNo, backNo, racerId})` → 안정 문자열 키.
  **2단계 지급 건이 참조할 식별자**이므로 형식을 바꾸지 말 것

### Step 2. 조회·집계 — `src/lib/falls-query.ts` (신규)

1. **후보 행**: `race_results` + `races`(기간·구장 필터) → `isFallCandidate`
2. **racer_id 부착**: `decision_card_entries` + `decision_card_races` + `decision_card_pages` 를
   `(date, venue, race_no, back_no)` 로 매칭
   - 매칭 실패는 **버리지 않고** `racerId: null`, `matched: false` 로 내려보낸다
3. **분모 집계**: `(date, venue)` 별 `raceCount`, `entryCount`
4. **경고 집계 (결정 3)**: `(date, venue)` 별 `출주표 엔트리 수` vs `결과 행 수` 비교 →
   `missingResults > 0` 이면 경고. 반대 방향(`결과만 있음`)도 `missingEntries` 로 함께 낸다
5. 1,000행 초과 가능 경로는 전부 `fetchAllRows(..., { orderedBy })`. `.order()` 는 호출자가 직접

### Step 3. API — `src/app/api/admin/falls/route.ts` (신규)

- `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&venue=광명|창원|부산|all`
- 기간 상한 **92일** (초과 시 400) — 함수 타임아웃 방지
- `withAdmin()` 래퍼로 내보낸다
- `createAdminClient()` (service role, 서버 전용)
- 응답: `{ range, rows[], totals[], warnings[] }`

### Step 4. 인증 누락 방지 (요청 사항)

**4-1. `src/lib/auth/with-admin.ts` (신규)** — `withAdmin(handler)` 고차 래퍼.
인증이 export 구조의 일부가 되어 "빼먹을 자리"를 없앤다.
기존 라우트는 **건드리지 않는다** (동작 변경 금지).

**4-2. `scripts/check-admin-guards.mjs` (신규)** — `**/api/**/admin/**/route.ts` 를 훑어
`withAdmin` / `verifyAdmin` / `verifyAdminAuth` 중 아무것도 없으면 exit 1 + 파일명 출력.
의도적 예외는 파일 상단 `// admin-guard: public` 주석으로만 허용.
`package.json` 에 `check:guards` 등록.

**4-3. 화면 게이팅** — `GET /api/interview/admin/auth` 로 상태 확인, 미인증이면 비밀번호 폼.
화면 게이팅은 UX용이고 **실제 차단은 라우트에서만** 이뤄진다.

### Step 5. 화면 — `src/app/admin/falls/page.tsx` (신규)

- 기간·구장 필터 (기본: 최근 30일, 전 구장)
- **경고 줄 (결정 3)**: `⚠️ 2026-09-11 광명 — 출주표 112행 / 결과 0행 (결과 누락)`
- **날짜·구장 헤더**: `2026-10-10 · 광명 — 16경주 / 112행 / 낙차 2건`
  - 사고 0건이어도 분모를 반드시 함께 표시
  - 경주수 0 → `데이터 없음(수집 미확인)` 으로 **다르게** 표시
- 선수 행: 경주 / 차번 / 선수명 / racer_id / 착순 / **낙차·사고 배지** / **실격 배지(별도)** / 골인후 메모
- `matched: false` → `racer_id 미확정` 경고 표시 (숨기지 않는다)
- **2단계 자리**: `지급` 열을 `—` 로 고정 표시

### Step 6. `/vault` 에 링크 추가 (결정 2)

`src/app/vault/page.tsx` 헤더 영역(`대납 입력` 제목 줄)에 `/admin/falls` 링크 버튼 1개.
Header.tsx 는 **수정하지 않는다**.

### Step 7. 검증

1. `npx tsc --noEmit` → `npm run lint` → `npm run check:guards` → `npm run build`
2. **교차검증** (이미 SQL로 확정한 값과 화면 값 일치 확인)
   - 2025-07-11 광명 → 4건 (김규윤·김범중·이상경·황무현)
   - 2025-07-12 → 광명 2건 + 창원 1건(박민오: `withdrawal`만, `finish`/`disqualified`는 NULL)
   - 2025-05-02 / 06-07 / 06-14 → 0건 + 경주 28·행 194~196 표시
   - 부산 2025 월별 → 2/6/13/11/1/9/10/9/1/12/11/4
   - **경고 줄**: 2026-09-11 광명(112/0), 2026-08-28 부산·창원(42/0), 2026-09-19 창원(1행)
3. 미인증 `curl /api/admin/falls` → 401
4. `check:guards` 가 가드 없는 더미 라우트를 실제로 잡는지 1회 확인
5. `node scripts/review-agent.mjs` → `eval-agent.mjs` → `monitor-agent.mjs`

---

## 변경될 파일 목록

| 파일 | 구분 |
|---|---|
| `src/lib/falls.ts` | 신규 — 분류 규칙·빈값 판정·이벤트 키 |
| `src/lib/falls-query.ts` | 신규 — 조회·racer_id 조인·분모·경고 집계 |
| `src/lib/auth/with-admin.ts` | 신규 — 인증 래퍼 |
| `src/app/api/admin/falls/route.ts` | 신규 — GET |
| `src/app/admin/falls/page.tsx` | 신규 — 화면 |
| `scripts/check-admin-guards.mjs` | 신규 — 가드 검사 |
| `package.json` | 수정 — `check:guards` 1줄 |
| `src/app/vault/page.tsx` | 수정 — 링크 1개 |

DB 스키마 변경 **없음**. 기존 라우트·인증 로직·수집 스크립트·워크플로 수정 **없음**.

---

## 완료 기준

- [ ] 기간·구장 필터로 목록이 나오고 **낙차와 실격이 시각적으로 구분**된다
- [ ] 모든 행에 `racer_id`가 붙고, 미확정 행은 숨지 않고 경고로 표시된다
- [ ] 날짜·구장마다 경주 수·선수 행 수가 보이고, 0건과 데이터 없음이 구분된다
- [ ] **출주표 있음 / 결과 없음 날짜·구장이 경고 줄로 표시된다**
- [ ] 빈값 `'-'`와 `NULL`이 모두 빈값 처리된다 (2025-07-12 창원 박민오 행으로 검증)
- [ ] 미인증 API 호출이 401
- [ ] `check:guards` 가 가드 없는 admin 라우트를 실제로 잡아낸다
- [ ] tsc / lint / build 통과
- [ ] 교차검증 수치 전부 일치

---

## 예상 위험 요소

1. **`'-'` vs `NULL` 혼재** — `withdrawal <> '-'` 만 쓰면 창원·부산 행이 전부 누락. 에러 없이 틀린다.
   → `isBlank()` 단일 함수로만 판정, 2025-07-12 창원 행으로 회귀 검증
2. **1,000행 제한** — 기간을 넓히면 후보·엔트리 조회가 잘린다. → `fetchAllRows` + 고유키 `.order()`
3. **동명이인 11명** — 이름 조인 금지. `(date,venue,race_no,back_no)` 키 조인만
4. **조인 실패 행 소실** — INNER JOIN 쓰면 사고가 대장에서 사라진다. → LEFT 조인 + `matched`
5. **부산 5·9·12월 0건** — 5개 독립 필드가 일관되게 "DNF 없음"을 가리켜 수집 결함은 아니지만
   원본 대조는 안 됐다. 화면에 단정적 문구를 쓰지 않는다
6. **수집 실행 시각 미기록** — `updated_at` 없음. `max(races.date)`를 "최종 데이터 일자"로만 표기, "최신" 금지
7. **service role 노출** — 인증 래퍼가 빠지면 전 선수 사고 이력이 공개된다. → Step 4 두 겹 방지

---

## 실수할 수 있는 부분

- `/vault/falls` 에 두고 싶어지지만 **비밀번호가 둘이 된다** (`VAULT_PASSWORD` ≠ `INTERVIEW_ADMIN_PASSWORD`).
  경로는 `/admin/falls` 로 확정됐다
- `races.round` 는 **text**. 숫자 비교·정렬 주의
- `rank IS NULL` 을 "낙차"로 단정 금지 — 실격만 있는 행도 NULL이다
- `finish` 값이 있는 행은 **완주 후 낙차**(착순 존재)로 성격이 다르다. 합계에 섞지 말 것
- 2단계 대비: 지급 상태를 `race_results` 에 컬럼으로 붙이려는 유혹 → **금지**.
  수집 스크립트가 upsert로 덮어쓸 수 있다. 2단계 지급 건은 `fallEventKey` 를 참조하는 **별도 테이블**로
- Header.tsx 에 메뉴를 추가하지 말 것 (결정 2)

---

## 2단계를 막지 않기 위한 구조 결정

1. **1단계는 전부 파생 조회** — 테이블을 만들지 않는다. 2단계가 어떤 저장 모델을 택해도 충돌 없음
2. **안정 식별자 `fallEventKey = (date, venue, race_no, back_no, racer_id)`** 를 1단계에서 확정,
   API 응답의 `key` 필드로 내려보낸다
3. 2단계 테이블은 `status: pending|confirmed|rejected` + `source: ocr|manual` + 캡처 참조 형태를 예상.
   1단계 API는 이 상태를 **표시만** 할 수 있게 `지급` 열을 비워 둔다
4. OCR 입력은 `/api/vault`(`daenap`)의 **비공개 버킷 + 서명 URL + 고아 파일 삭제** 패턴을 그대로 따른다
5. `daenap` 성격분류에 **`낙차위로금`이 이미 존재** — 새 분류를 만들지 말고 이 항목에 연결

---

## 상태

**1단계 완료** — 2026-10-12

### 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npm run lint` | 신규 파일 지적 0건 (기존 경고 82건은 손대지 않음) |
| `npm run check:guards` | 통과. admin 라우트 21개 검사, 의도적 공개 1건(로그인 엔드포인트) |
| 가드 검사 작동 확인 | 가드 없는 더미 라우트를 실제로 잡고 exit 1 (확인 후 더미 삭제) |
| `npm run build` | 통과. `/admin/falls`(static), `/api/admin/falls`(dynamic) 생성 |
| `npm run verify:falls` | **22개 단정 전부 통과** |
| 미인증 `GET /api/admin/falls` | **401** (기간 상한 검사보다 인증이 먼저 걸린다) |

### 교차검증 통과 내역

- 2025-07-11 광명 4건(김규윤·김범중·이상경·황무현), 분모 16경주/112행, racer_id 전부 확정
- 2025-07-12 광명 2건 + 창원 1건. 박민오 = 낙차/실격없음/골인후없음 (**NULL 빈값 처리 검증**)
- 김용규 = 착순 4 + 골인후낙차 + fallType null (**완주 후 낙차 분리 검증**)
- 2025-05-02 / 06-07 / 06-14 → 사고 0건 + 분모 28경주 / 196·195·194행
- 부산 2025 월별 → 2/6/13/11/1/9/10/9/1/12/11/4 일치
- 경고 6건 탐지: 2026-08-23 부산·창원(출주표 누락), 08-28 부산·창원(결과 누락),
  09-11 광명(결과 누락 112/0), 09-19 창원(부분 누락 1행)
- 2026-10-11 광명은 출주표·결과 모두 없어 그룹에 나타나지 않음 (개최 미확정 — 경고로도 안 뜬다)

### 계획과 달라진 점

1. **`scripts/verify-falls-ledger.ts` 추가** (계획 파일 목록에 없던 신규).
   완료 기준의 교차검증을 재실행 가능하게 만들었다. `npm run verify:falls`
2. **`src/app/api/interview/admin/auth/route.ts` 에 주석 4줄 추가**.
   가드 검사가 로그인 엔드포인트를 잡았는데, 로그인은 인증을 요구할 수 없으므로
   `// admin-guard: public` 예외 선언을 달았다. **동작 변경 없음**
3. `Button` 에 `asChild` 가 없어 링크는 `buttonVariants()` + `next/link` 로 처리

### 미실행

`review-agent` / `eval-agent` / `monitor-agent` — 세 스크립트 모두
`ANTHROPIC_API_KEY` 를 요구하는데 `.env.local` 에 없다(`OPENAI_API_KEY` 만 있음).
키를 추가하면 그대로 실행 가능하다.

### 2단계 인수 지점

- 지급 건이 참조할 키: `fallEventKey()` = `date|venue|raceNo|backNo|racerId` — **형식 고정**
- API 응답 각 행의 `key` 필드가 그 값이다
- 화면 `지급` 열이 비어 있다(`—`). 여기에 지급 상태를 넣는다
- `race_results` 에 컬럼 추가 금지 (수집 upsert 가 덮어쓴다) → 별도 테이블
