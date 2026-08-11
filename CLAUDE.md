# PRO-KEIRIN (7randoms) 프로젝트 지침

## 프로젝트 기본 정보

- 사이트명: 7randoms (pro-keirin.vercel.app)
- 목적: 경륜 데이터 분석 플랫폼 (베터/팬 대상)
- 프레임워크: Next.js + TypeScript + Tailwind CSS + shadcn/ui
- DB: Supabase (PostgreSQL) — ref: bhgjbckejaqplqcxrohh
- 배포: Vercel (master 브랜치 자동 배포)
- GitHub: beesclub8384-ops/pro-keirin
- 브랜치: master (main 아님)
- 작업 위치: 집(C:\Users\beesc\pro-keirin) / 사무실(C:\Users\win10\pro-keirin)
- 위치 전환 시: 반드시 git pull origin master 먼저 실행

---
## 🔄 표준 작업 워크플로우

1. node scripts/plan-agent.mjs — 계획서 작성 → CURRENT_TASK.md 생성
2. 클로드 코드로 작업 수행
3. npx tsc --noEmit — 타입 확인
4. npm run lint — 린트 확인
5. npm run build — 빌드 확인
6. node scripts/review-agent.mjs — 코드 리뷰 → review-result.md 생성
7. node scripts/eval-agent.mjs — 품질 평가 → eval-result.md 생성
8. node scripts/monitor-agent.mjs — 누적 패턴 분석

새 대화 창에서 시작할 때: CURRENT_TASK.md가 있으면 반드시 먼저 읽고 현재 상태 파악

---
## 🚫 절대 하지 말아야 할 것 (가드레일)

1. scripts/ 파일 절대 삭제 금지 (복구 불가)
2. git push --force 절대 금지
3. git clean -fd 실행 전 반드시 사용자 확인
4. Supabase 테이블 직접 삭제/truncate 전 반드시 사용자 확인
5. 환경변수 값을 코드에 하드코딩 금지
6. SUPABASE_SERVICE_ROLE_KEY를 클라이언트 사이드에서 사용 금지

---
## 📋 작업 시작 전 계획서 작성

계획서에 포함할 내용:
- 작업 목표
- 구현 단계
- 변경될 파일 목록
- 완료 기준
- 예상 위험 요소
- 실수할 수 있는 부분

규칙:
- 관련 파일 전체 읽기 전 코드 작성 금지
- 확실하지 않으면 추측 말고 질문
- 빠른 완료보다 정확한 완료 우선
- 사용자 OK 전 코드 작성 금지

---
⚠️ 코딩 전 반드시 확인할 체크리스트

코드를 작성하기 전에 아래를 순서대로 확인한다.

1. 파일 먼저 읽기: 수정할 파일을 grep/read로 먼저 파악한 후 코드 작성
2. Supabase 1000행 제한 확인: PostgREST 기본 limit=1000. 전체 조회 시 페이지네이션 필수
3. kcycle 검증 필수: 없는 회차 요청 시 404 대신 최근 데이터 반환 → 회차/일차 일치 검증 후 저장
4. 환경변수 이름 확인: NEXT_PUBLIC_ 접두사 필요 여부
5. 데이터는 Supabase에 있음: 코드에서 찾지 말 것

---
⚠️ 반드시 지켜야 할 개발 규칙

1. 작업 완료 후 반드시 커밋 + 푸시

모든 파일 수정이 끝나면 자동으로 아래를 실행한다:
git pull origin master && git add -A && git commit -m "feat/fix/refactor: 작업 내용 요약" && git push origin master

- push 전 반드시 pull 먼저 (충돌 방지)
- 커밋 메시지는 한국어로 구체적으로 작성

2. 파일 수정 방식

반드시 파일을 직접 수정하고, 수정 전후 diff를 보여줘. 수정 완료 후 해당 파일을 cat으로 보여줘.

3. Supabase 전체 데이터 조회 시 페이지네이션 필수 (+ 고유키 정렬 필수)

// ❌ 잘못된 방법 1 — 1000행에서 잘림
await supabase.from('race_results').select('*')

// ❌ 잘못된 방법 2 — 정렬 없는 페이지네이션. 행이 중복·누락된다 (에러 안 남)
await supabase.from('race_results').select('*').range(from, from + 999)

// ✅ 올바른 방법 — 고유키 기준 정렬 필수
let from = 0
const all = []
while (true) {
  const { data } = await supabase
    .from('race_results')
    .select('*')
    .order('id', { ascending: true })   // ← 고유키. 없으면 행이 중복·누락된다
    .range(from, from + 999)
  if (!data?.length) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}

// ⚠️ 정렬 기준이 고유하지 않으면 소용없다
.order('year')                    // ✗ 같은 year 안에서 순서 미보장 → 여전히 중복·누락
.order('year').order('racer_id')  // ✓ 조합이 고유하면 OK

왜 필요한가 (2026-08-11 실측):
PostgREST 의 .range() 는 SQL OFFSET/LIMIT 으로 번역되는데, ORDER BY 가 없으면
Postgres 는 행 순서를 보장하지 않는다. 특히 synchronize_seqscans 가 켜져 있으면
Seq Scan 시작 지점이 매번 달라진다.
decision_card_entries 7,454행을 무정렬로 두 번 조회한 결과:
  1회차 → 고유 id 5,720 (중복 1,734)
  2회차 → 고유 id 6,263 (중복 1,191)   ← 두 회차의 행 집합이 서로 다름
가져온 행 수는 7,454 로 양쪽 다 "정상"이라 건수 검증으로도 안 걸린다.
.order('id') 를 넣으면 7,454행 / 고유 7,454 / 중복 0, 재실행해도 동일.
→ /racers 가용율이 선수 480명분 틀린 값을 내던 원인. 전형적인 무음 실패다.
재현 도구: scripts/diag-availability.ts (테이블·필터만 바꿔 재사용 가능)

4. kcycle 응답 검증 필수

kcycle은 없는 회차를 요청하면 404 대신 가장 최근 데이터를 반환한다.
반드시 반환된 HTML에서 회차/일차를 파싱해 요청값과 일치하는지 확인 후 저장.
불일치 시 저장하지 않고 스킵.

5. 동적 라우트 params 처리 (Next.js 16 + React 19)

서버 컴포넌트: async function + await params
클라이언트 컴포넌트: use(params) — React 19 권장
useParams(): 레거시, 새로 작성 시 사용 금지

---
🔍 데이터 진단 순서 (문제 발생 시)

데이터가 이상하거나 없을 때 아래 순서로 확인한다. 순서를 바꾸면 시간 낭비.

1. 원본 확인: kcycle.or.kr 또는 data.go.kr에서 해당 데이터가 실제 있는지 확인
2. Supabase 확인: 테이블에 데이터가 있는지, 건수가 맞는지 확인
3. API 확인: 엔드포인트가 올바른 데이터를 반환하는지 확인
4. 코드 확인: 마지막에 코드를 본다

---
🚨 무음 실패(Silent Failure) 주의

에러 없이 잘못된 결과를 내는 버그가 가장 위험하다. 아래 패턴에서 자주 발생:

- Supabase 1000행 제한으로 데이터가 잘려도 에러 없음 → 시드 후 건수 항상 검증
- kcycle 검증 없이 저장 → 엉뚱한 회차 데이터가 DB에 들어감
- Vercel 배포 후 반영 지연 → 직접 API fetch로 먼저 확인 후 디버깅
- decision_card_pages에 오늘 데이터 없으면 경주결과 수집 자체가 시작 안 됨

새 기능 추가 시 반드시 "이 기능이 조용히 실패할 수 있는 경우"를 먼저 생각할 것.

---
🔄 교차검증이 필요한 작업

- kcycle 스크래핑 후: DB 건수와 예상 건수 비교
- Supabase 시드 후: SELECT COUNT(*) 로 반드시 확인
- 배당률 데이터: data.go.kr 기준 3~5일 지연이 정상. 당일 없다고 버그 아님
- GitHub Actions 수정 시: workflow 파일 경로와 스크립트 경로 일치 여부 확인
- Vercel 배포 후: 실제 사이트에서 기능 동작 직접 확인

---
🛠️ 환경변수 목록

| 변수명 | 용도 |
|--------|------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL (클라이언트용) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role (서버/스크립트용) |
| DATA_GO_KR_API_KEY | data.go.kr 배당률 API |

---
🗂️ 주요 파일 구조

- src/data/ — 대용량 JSON (~65MB+), gitignore 대상. Google Drive 백업 필수
- scripts/ — 수집/업로드 스크립트 (npx tsx로 실행)
- src/lib/decision-card-latest.ts — 출주표 핵심 로직
- .github/workflows/ — 자동화 (경주결과 10분/출주표 30분/배당률 주1회)

---
🔁 Git 복구 패턴

잘못된 커밋을 되돌릴 때:
git reset HEAD~1       # 마지막 커밋 취소 (파일은 유지)
git checkout -- .      # 변경사항 전부 되돌리기
⚠️ git push -f 절대 금지

---
📊 경륜 도메인 지식

- 등급 순서 (항상 낮→높, 왼→오): 선발 → 우수 → 특선
- 회차(round) = 금~일 3일 블록 / 일차(day) = 블록 내 날짜
- 200m 기록 신뢰 불가 (워밍업 취급) / 기어비 표준화 → 분석 무의미
- 광명 경기장만 수집됨 (창원/부산 = 준비중)
- Article 72 조회: WHERE article='72' AND (clause='2' OR paragraph='2')
- 배당률 3~5일 지연 정상 / 부산스포원 API 미연동 → 등급 데이터 부정확 상태

주요 테이블:
races, race_results, race_odds, racer_profiles, violations, judge_sanctions,
decision_card_pages / decision_card_races / decision_card_entries,
race_sales, race_schedule
