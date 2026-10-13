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

### 1-b단계 (2026-10-12 승인 후 추가 완료)

예정표에 있는데 출주표·결과가 **둘 다 없는** 날짜를 경고로 추가했다.
기존 "대조" 경고는 출주표가 있을 때만 작동해, 출주표부터 실패한 날은
아무 경고도 뜨지 않았다 (2026-10-11 광명).

| 결정 | 내용 |
|---|---|
| 4일차 3건 | 숨기지 않고 **회색 라벨 + "확신 낮음"** 으로 표시 (실측 4건 중 3건 미개최. 아예 빼면 진짜 놓친 4일차가 영구히 안 보인다) |
| 미래일 | 오늘과 미래는 평가 제외. 예정표에 연말까지 36일이 있어 안 거르면 경고가 쏟아진다 |
| 광명 한정 | `race_schedule` 에 venue 컬럼이 없고 광명 일정만 있다 → 화면에 고정 문구로 명시 |
| 2026 한정 | 예정표 적재가 2026년뿐 → 범위 밖이면 `예정일 대조 불가` 를 띄운다 (조용히 0건 금지) |
| `four_day_rounds` | 2016~2025만 있고 2026 없음. 개최된 2026-03-02(round 9 day 4)도 미등록 → **4일차 필터로 쓸 수 없다** |

변경 파일 3개: `src/lib/falls-query.ts`, `src/app/admin/falls/page.tsx`,
`scripts/verify-falls-ledger.ts`. 수집 스크립트·워크플로·DB·인증 변경 없음.

검증: 신규 18개 + 기존 22개 = **40개 단정 전부 통과**.
tsc / lint / check:guards / build 통과.

탐지 결과 (2026-08-17 ~ 10-11 조회 시 경고 9건):
- `예정일 전체 누락` 1건 — **2026-10-11 광명 (40회 3일차)**
- `예정표 4일차(미개최 가능)` 2건 — 2026-08-17, 2026-10-05 (회색·확신 낮음)
- 기존 대조 경고 6건 유지 — 08-23 부산·창원, 08-28 부산·창원, 09-11 광명, 09-19 창원

### 다음 단계로 넘긴 것 (이번에 손대지 않음)

**광명 2026년 결과 누락 16일** — 출주표는 있는데 `races`/`race_results` 가 없다.
기존 "결과 누락" 경고가 잡는 유형이지만 기본 조회창(30일) 밖이라 화면에서는 안 보인다.
재수집은 별도 계획으로 진행한다.

```
2026-06-05, 06-06, 06-07   (23회 1~3일차)
2026-06-12, 06-13, 06-14   (24회 1~3일차)
2026-06-19, 06-20, 06-21   (25회 1~3일차)
2026-07-04 (27회 2일차), 07-10 (28회 1일차)
2026-07-24, 07-25 (30회 1~2일차)
2026-07-31, 08-01 (31회 1~2일차)
2026-09-11 (37회 1일차)
```
6월은 3개 회차(9일) 연속으로 비어 있다.

### 2단계 인수 지점

- 지급 건이 참조할 키: `fallEventKey()` = `date|venue|raceNo|backNo|racerId` — **형식 고정**
- API 응답 각 행의 `key` 필드가 그 값이다
- 화면 `지급` 열이 비어 있다(`—`). 여기에 지급 상태를 넣는다
- `race_results` 에 컬럼 추가 금지 (수집 upsert 가 덮어쓴다) → 별도 테이블

---

# 수집 워크플로 수정 — 3단계 계획 (2026-10-13)

조사 근거: `gh run view --log-failed` 로 Decision Card 실패 3건과 Weekly Odds 실패를
직접 읽고 원인을 확인했다. 상세는 대화 기록 참조.

## 단계를 나누는 이유

**계획 1과 3은 종료코드를 서로 반대 방향으로 바꾼다** (1은 실패→성공, 3은 성공→실패).
한 커밋에 넣으면 다음 경주일에 결과가 달라졌을 때 어느 쪽 때문인지 가릴 수 없고,
되돌리기도 한 덩어리가 된다.

각 단계 사이에 **경주일(금·토·일) 관찰 기간을 반드시 끼운다.**
수집은 경주일에만 의미 있게 동작하므로 비경주일 수동 실행만으로는 안전을 확인할 수 없다.

## 1차 — Weekly Odds 의 Enrich 스텝 삭제 ✅ 승인·완료 (2026-10-13)

`.github/workflows/weekly-odds.yml` 에서 `Enrich race results` 스텝 제거.
`scripts/enrich-race-results.ts` 는 **삭제하지 않음** (로컬 수동 작업용 유지).

- 난이도 최저 / 위험 최저 / 다른 워크플로와 완전 독립
- 효과: `race_odds` 7개월 공백 복구
- ⚠ **`races`/`race_results` 주간 보정은 이걸로 복구되지 않는다.**
  `seed-races.ts` 가 커밋된 `yearly-race-detail/*.json` 을 읽는데,
  2026.json 이 54KB·13경주·2026-05-15 하루뿐이다 (mtime 2026-06-17).
  광명 2026년 결과 누락 16일은 **별도 재수집 계획**으로만 해결된다.
- 되돌리기: `git revert`

## 2차 — 미게시 스킵 exit 0 + 접속 타임아웃 재시도 (미승인)

둘을 함께 넣는다. 같은 Decision Card 경로이고 **서로 보완**한다 —
재시도가 네트워크 실패를 예외로 올려주면, 스킵 판정이 "미게시" 와 정확히 구분된다.

**계획 1 (미게시 스킵 exit 0)**
- `scripts/fetch-decision-card-latest.ts:63` 이 `success===false` 를 전부 exit 1 로 보낸다
- `fetchAndSeedLatest` 결과에 `skipped: boolean` 추가 → 스크립트가 `skipped ? 0 : 1`
  (message 문자열 매칭 금지 — 문구 고치면 조용히 깨진다)
- exit 0 으로 바꿀 지점: `decision-card-latest.ts:544`(수집할 출주표 없음),
  `:553`(kcycle 미게시)
- ⚠ **`:575`(광명 경주 없거나 미게시) 는 exit 1 로 남긴다.**
  `verifyRoundDay` 를 통과한 뒤라 "게시됐는데 파싱 0건"(진짜 실패)이 더 유력하다.
  전부 exit 0 으로 하면 파싱 깨짐이 초록불에 가려진다
- 효과: 실패 24건 중 16건이 이 유형 → 실패율 67%→약 33%. 진짜 장애가 소음에 안 묻힌다

**계획 4 (타임아웃 재시도)**
- `src/lib/decision-card-latest.ts:386`(`fetchDecisionCardHtml`), `:395`(`verifyRoundDay`)
  둘 다 타임아웃·재시도 없는 단발 `fetch`
- 10-10 실패 2건이 `ConnectTimeoutError ... timeout: 10000ms` — 이 10초는 코드에 없고
  undici 기본값이다. 즉 지금은 타임아웃을 제어하지 않는다
- `fetchWithRetry(url, { attempts: 3, timeoutMs: 20000, backoffMs: [2000, 5000] })`
  + `AbortSignal.timeout`. **재시도는 네트워크 오류·5xx 만**, 4xx 는 즉시 포기
  (재시도해도 같고 미게시 판정만 늦춘다)
- `verifyRoundDay` 는 재시도 후에도 실패하면 **예외를 던진다** — 지금은 네트워크 실패를
  `false`(미게시)로 뭉개서, 끊긴 것을 "아직 안 올라옴" 으로 기록한다
- 범위: Decision Card 2곳만. 창원·부산 스크립트는 건드리지 않는다
- 최악 소요 +67초. 워크플로 `timeout-minutes` 여유 있음

관찰: 경주일 1주 (실패율 하락 + 재시도 로그 확인)

## 3차 — 출주표 없는 날을 race_schedule 로 대조 (미승인, 난이도·위험 최대)

`scripts/fetch-race-detail.ts:645~647` 의 `return`(=exit 0) 이
2026-10-11 광명 16경주 유실에 초록불 4개가 남은 원인이다.

| 상황 | 판정 | 종료 |
|---|---|---|
| 예정표에 없는 날짜 | 휴장 — 정상 | exit 0 |
| 예정표에 있는데 출주표 없음 (day ≤ 3) | 수집 실패 | **exit 1** + `::error::` |
| 예정표에 있고 day = 4 | 미개최 흔함 | exit 0 + `::warning::` |
| 예정표 범위 밖 (2026년 외) | 대조 불가 | exit 0 + `::warning::` |

- 판정 규칙은 1-b 의 `src/lib/falls-query.ts` 예정일 대조와 **동일**해야 한다
  → `src/lib/schedule-check.ts` 공통 모듈로 빼서 양쪽이 쓴다 (두 곳에 갈라지면 어긋난다)
- 커밋을 "공통 모듈 추출" / "스크립트 분기 추가" 둘로 나눈다 — 뒤쪽만 되돌릴 수 있게
- ⚠ 광명 전용 (`race_schedule` 에 venue 없음, 이 스크립트도 meetCd 001 고정).
  창원·부산 스크립트에는 넣을 수 없다
- ⚠ UTC 날짜 경계: `--date today` 가 UTC 기준이라 16:35 UTC 실행이 다음 날을 타겟으로
  잡는다(실측). KST 로 바꾸는 것은 **이번 범위 밖** — 건드리면 매일 돌던 수집이 어긋난다
- ⚠ 2027년에 `race_schedule` 시딩이 없으면 조용히 무력화된다 → 그 경우 `::warning::` 필수
- **2단계 적용**: 첫 2주는 `::error::` 만 내고 exit 0 유지 → 오탐 없으면 exit 1 로 승격

관찰: 경주일 2주 + 승격 후 1주

## 이 계획으로 해결되지 않는 것

광명 2026년 결과 누락 16일(6/5~6/21 포함)과 출주표 누락 12일.
**재수집은 별도 계획**이며, 위 3단계는 "앞으로 같은 유실이 조용히 지나가지 않게"
만드는 것까지다.
