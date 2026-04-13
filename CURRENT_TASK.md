# CURRENT_TASK: 판정기록 페이지에 선수별 위반 횟수 차트 추가

## 작업 목표
판정기록(violations/judge_sanctions) 페이지에 선수별 위반 횟수를 시각화하는 바 차트를 추가하여 반복 위반 선수를 한눈에 파악할 수 있게 한다.

---

## 사전 파악 필요 사항 (코드 작성 전 반드시 확인)

계획서 작성 시점에 아래 파일들의 실제 내용을 확인하지 못했으므로, **구현 시작 전 반드시 먼저 read/grep**해야 한다.

```
# 확인 대상 파일 목록
src/app/sanctions/page.tsx          (또는 violations 관련 페이지 경로)
src/app/judge-records/page.tsx      (판정기록 페이지 실제 경로 확인)
src/lib/supabase.ts                 (클라이언트 인스턴스 확인)
src/components/ui/                  (사용 가능한 shadcn 컴포넌트 목록)
```

> ⚠️ 판정기록 페이지의 실제 경로가 불확실하다. 아래 명령으로 먼저 탐색할 것:
> `find src/app -name "*.tsx" | xargs grep -l "violation\|sanction\|판정" 2>/dev/null`

---

## 구현 단계

### Step 0. 현황 파악 (읽기만 — 코드 작성 없음)

**0-1. 판정기록 페이지 경로 탐색**
```bash
find src/app -name "*.tsx" | xargs grep -l "violation\|sanction\|judge\|판정"
```

**0-2. violations / judge_sanctions 테이블 스키마 파악**
- Supabase 대시보드 또는 기존 쿼리 코드에서 컬럼명 확인
- 핵심 확인 항목:
  - 선수 식별 컬럼: `racer_id` vs `racer_name` vs `name`
  - 위반 유형 컬럼명: `article`, `clause`, `violation_type` 등
  - 날짜 컬럼: `race_date`, `created_at` 등
  - 기존 API 라우트가 있는지: `src/app/api/violations/` 또는 `src/app/api/sanctions/`

**0-3. 기존 페이지 코드 구조 파악**
- 서버 컴포넌트인지 클라이언트 컴포넌트인지 확인
- 현재 데이터 페치 방식 확인 (직접 Supabase 쿼리 vs API 호출)
- 기존 필터/페이지네이션 상태 확인

**0-4. recharts 사용 현황 확인**
```bash
grep -r "recharts" src/ --include="*.tsx" -l
```
> package.json에 recharts ^3.7.0이 이미 설치되어 있음 → 추가 설치 불필요

---

### Step 1. API 엔드포인트 구현

**파일:** `src/app/api/violations/chart-data/route.ts` (신규 생성)

선수별 위반 횟수 집계 데이터를 반환하는 API.

```typescript
// 반환 형태 (예시)
{
  data: [
    { racer_name: "홍길동", racer_id: "12345", count: 7, article72Count: 3 },
    { racer_name: "김철수", racer_id: "67890", count: 5, article72Count: 1 },
    // ... Top N 선수
  ],
  total: 42,
  period: { from: "2024-01-01", to: "2024-12-31" }
}
```

구현 시 주의사항:
- **Supabase 1000행 제한** → 전체 위반 데이터 조회 시 페이지네이션 루프 필수
- 집계(GROUP BY)는 Supabase RPC 또는 애플리케이션 레벨에서 처리
  - Supabase PostgREST는 GROUP BY를 직접 지원하지 않으므로 **전체 fetch 후 JS에서 집계** 또는 **Supabase DB Function(RPC) 생성** 중 선택
  - 권장: 데이터량이 적으면 JS 집계, 많으면 RPC
- 쿼리 파라미터로 필터링 지원: `?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=20&grade=특선`

---

### Step 2. 차트 컴포넌트 구현

**파일:** `src/components/violations/ViolationRankChart.tsx` (신규 생성)

```
'use client' 선언 필수 (recharts는 클라이언트 전용)
```

컴포넌트 설계:
- **차트 유형**: 수평 바 차트 (`BarChart` + `layout="vertical"`) — 선수 이름이 길어서 수직이 가독성 좋음
- **x축**: 위반 횟수
- **y축**: 선수 이름 (상위 N명만 표시, 기본값 15명)
- **색상**: 위반 횟수에 따른 그라데이션 또는 단색
- **툴팁**: 선수명, 총 위반 횟수, Article 72 해당 횟수 표시
- **반응형**: `<ResponsiveContainer width="100%" height={400}>`

Props 인터페이스:
```typescript
interface ViolationRankChartProps {
  data: ViolationChartItem[]
  isLoading?: boolean
  topN?: number          // 표시할 선수 수 (기본 15)
  period?: string        // 표시용 기간 문자열
}
```

---

### Step 3. 판정기록 페이지에 차트 섹션 통합

**파일:** `[판정기록 페이지 실제 경로]` (Step 0에서 확인 후 수정)

추가할 UI 요소:
1. **차트 섹션 카드** — 기존 테이블 위(상단)에 배치
2. **기간 필터** — 전체 / 최근 1년 / 최근 6개월 / 현재 연도 선택 탭 또는 셀렉트
3. **표시 인원 조절** — Top 10 / Top 15 / Top 20 셀렉트
4. **로딩 스켈레톤** — 데이터 fetch 중 표시

페이지가 **서버 컴포넌트**인 경우:
- 차트 섹션을 별도 클라이언트 컴포넌트로 분리
- 페이지에서 `<ViolationChartSection />` 형태로 import

페이지가 **클라이언트 컴포넌트**인 경우:
- `useState` + `useEffect`로 차트 데이터 별도 fetch
- 기존 데이터 fetch와 독립적으로 동작

---

### Step 4. 타입 정의

**파일:** `src/types/violations.ts` (신규 생성 또는 기존 타입 파일에 추가)

```typescript
export interface ViolationChartItem {
  racer_name: string
  racer_id?: string
  count: number
  article72Count?: number
}

export interface ViolationChartData {
  data: ViolationChartItem[]
  total: number
  period: { from: string | null; to: string | null }
}
```

---

### Step 5. 검증

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- 로컬 `npm run dev`에서 실제 차트 렌더링 확인

---

## 변경될 파일 목록

- [ ] `src/app/api/violations/chart-data/route.ts` — **신규**: 선수별 위반 횟수 집계 API (GET)
- [ ] `src/components/violations/ViolationRankChart.tsx` — **신규**: recharts 수평 바 차트 컴포넌트 (`'use client'`)
- [ ] `src/components/violations/ViolationChartSection.tsx` — **신규**: 필터 UI + 차트 래퍼 클라이언트 컴포넌트
- [ ] `src/types/violations.ts` — **신규 또는 수정**: ViolationChartItem, ViolationChartData 타입 추가
- [ ] `[판정기록 페이지].tsx` — **수정**: ViolationChartSection 컴포넌트 추가 (Step 0에서 경로 확정)

> ⚠️ 실제 파일 목록은 Step 0 탐색 결과에 따라 달라질 수 있다.

---

## 완료 기준

- [ ] `/api/violations/chart-data` GET 요청 시 `{ data: [...], total: N }` 형태 JSON 반환 확인
- [ ] 판정기록 페이지 접속 시 차트가 기존 테이블 위에 렌더링됨
- [ ] 차트에 선수 이름 + 위반 횟수가 내림차순으로 표시됨 (상위 15명 기본)
- [ ] 기간 필터 변경 시 차트 데이터가 재조회되어 갱신됨
- [ ] 데이터 로딩 중 스켈레톤 또는 로딩 표시가 나타남
- [ ] 모바일(375px) 및 데스크톱(1280px)에서 레이아웃 깨짐 없음
- [ ] `npx tsc --noEmit` 오류 0건
- [ ] `npm run build` 성공
- [ ] Vercel 배포 후 실제 사이트에서 차트 동작 확인

---

## 예상 위험 요소

### 위험 1: violations vs judge_sanctions 테이블 혼재
- **설명**: 프로젝트에 `violations`와 `judge_sanctions` 두 테이블이 존재. 판정기록 페이지가 어느 테이블을 사용하는지, 또는 두 테이블을 조인해서 사용하는지 불명확.
- **대응**: Step 0에서 기존 페이지 코드의 쿼리를 확인하여 동일한 데이터 소스 사용. 임의로 테이블 선택 금지.

### 위험 2: Supabase 1000행 제한으로 집계 누락
- **설명**: 위반 데이터가 1000건 초과 시 단순 `select('*')` 사용 시 상위 1000건만 집계 → 특정 선수 위반 횟수 누락 → **에러 없이 틀린 순위** 표시 (Silent Failure)
- **대응**: API 라우트에서 반드시 페이지네이션 루프 사용. 집계 전 전체 데이터 수집 완료 확인.

### 위험 3: 선수 식별자 불일치
- **설명**: `racer_name` 기준 집계 시 동명이인 문제 발생 가능. `racer_id` 기준 집계 시 racer_profiles JOIN 필요.
- **대응**: Step 0에서 테이블 컬럼 확인 후 `racer_id` + `racer_name` 병용. `racer_id`가 없으면 `racer_name`으로만 집계하되 주의사항 주석 추가.

### 위험 4: recharts SSR 오류
- **설명**: recharts는 브라우저 전용. 서버 컴포넌트에서 직접 import 시 빌드 오류 발생.
- **대응**: 차트 컴포넌트 최상단에 `'use client'` 선언 필수. 서버 컴포넌트인 페이지에서는 dynamic import 고려 (`next/dynamic` + `ssr: false`).

### 위험 5: 판정기록 페이지 경로 불확실
- **설명**: 계획 작성 시점에 실제 페이지 파일 경로를 확인하지 못함. 잘못된 파일 수정 시 사이드 이펙트 발생.
- **대응**: Step 0의 `find` + `grep` 탐색을 반드시 먼저 실행. 경로 확정 전 코드 작성 절대 금지.

### 위험 6: Article 72 필터링 로직 오류
- **설명**: CLAUDE.md에 따르면 Article 72 조회는 `WHERE article='72' AND (clause='2' OR paragraph='2')` 조건 필요. 단순 `article='72'`만으로 조회 시 과다 집계.
- **대응**: Article 72 카운트 표시 시 위 조건 정확히 적용. 일반 위반 횟수와 Article 72 횟수는 별도 카운팅.

---

## 실수할 수 있는 부분

- **`'use client'` 누락**: ViolationRankChart.tsx에서 빠뜨리면 빌드 시 recharts window 참조 오류 발생
- **페이지 params 처리**: 판정기록 페이지가 동적 라우트(`[id]`)라면 서버=`await params`, 클라이언트=`use(params)` 규칙 준수. `useParams()` 사용 금지
- **Supabase 쿼리에서 `.limit()` 미설정 시 기본 1000행 제한 적용됨** → 페이지네이션 루프 없이 `select('*')` 단독