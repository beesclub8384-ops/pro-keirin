# 7randoms 데이터 수집 설계 문서

> 마지막 업데이트: 2026-03-21
> 대상: 출주표(확정출주표) + 경주결과 수집 시스템

---

## 1. 전체 구조 (큰 그림)

```
kcycle.or.kr → GitHub Actions (자동) → Supabase DB → 7randoms 화면
   (원본)          (배송 트럭)            (창고)         (진열대)
```

데이터 소스는 2곳:
- **kcycle.or.kr** : 출주표 + 경주결과 (HTML 스크래핑)
- **data.go.kr** : 배당률 (REST API, 3~5일 지연)

---

## 2. 출주표 수집

### 2-1. 관련 파일

| 역할 | 파일 |
|------|------|
| 핵심 로직 (스크래핑 + 파싱 + 저장) | `src/lib/decision-card-latest.ts` |
| CLI 수동 실행 | `scripts/fetch-decision-card-latest.ts` |
| 배치 전체 수집 | `scripts/fetch-decision-card.ts` |
| GitHub Actions | `.github/workflows/decision-card.yml` |

### 2-2. 자동 수집 스케줄 (GitHub Actions)

| 요일 | 시간 (KST) | 목적 |
|------|-----------|------|
| 목요일 | 19:00~23:00 (30분 간격) | 금요일 출주표 수집 |
| 금요일 | 21:00~23:00 (30분 간격) | 토요일 출주표 수집 |
| 토요일 | 21:00~23:00 (30분 간격) | 일요일 출주표 수집 |

### 2-3. 수집 흐름

```
1. determineNextTarget()
   └─ race_schedule 테이블에서 오늘~14일 이내 경주일 조회
   └─ decision_card_pages에서 이미 수집된 것 제외
   └─ 아직 안 수집된 첫 번째 회차/일차 반환

2. verifyRoundDay() ← 핵심 검증 단계
   └─ URL: kcycle.or.kr/race/card/decision/popup/txt/{year}/{round}/{day}
   └─ HTML에서 "XX회 X일차 확정본" 패턴 파싱
   └─ 요청한 회차 ≠ 실제 회차 → 저장 안 함 (스킵)
   └─ 일치 → 다음 단계로

3. fetchDecisionCardHtml()
   └─ URL: kcycle.or.kr/race/card/decision/{year}/{round}/{day} (SPA)
   └─ 선수 데이터(racer_id 등) 포함된 완전한 HTML 수집

4. parsePage()
   └─ 경주별 선수 명단, 승부수, 최근 성적 등 파싱

5. seedPageToSupabase()
   └─ decision_card_pages, decision_card_races, decision_card_entries 테이블에 저장
```

### 2-4. ⚠️ 중요: kcycle의 특이한 동작

> kcycle은 존재하지 않는 회차를 요청하면 **404 에러가 아니라 가장 최근 출주표를 반환**한다.

이 때문에 `verifyRoundDay()`로 반드시 검증해야 함.
검증 없이 저장하면 → 미래 회차에 현재 출주표 데이터가 잘못 저장됨.

### 2-5. 수집에 사용하는 URL 2개

| URL 패턴 | 용도 | 특징 |
|----------|------|------|
| `/race/card/decision/popup/txt/{year}/{round}/{day}` | 회차 검증 | HTML에 "XX회 X일차 확정본" 텍스트 포함 |
| `/race/card/decision/{year}/{round}/{day}` | 실제 데이터 수집 | SPA, racer_id 등 완전한 선수 데이터 포함 |

### 2-6. Supabase 테이블

| 테이블 | 내용 |
|--------|------|
| `decision_card_pages` | 회차/일차/날짜 (year, round, day, date) |
| `decision_card_races` | 경주별 정보 (race_no, 등급, 출발시간 등) |
| `decision_card_entries` | 선수별 데이터 (back_no, racer_id, 승부수, 최근성적 등) |

### 2-7. 수동 재수집 명령어

```bash
# 특정 회차/일차 수동 수집
npx tsx scripts/fetch-decision-card-latest.ts --round 12 --day 3 --year 2026

# 특정 날짜로 수동 수집
npx tsx scripts/fetch-decision-card-latest.ts --date 2026-03-22
```

---

## 3. 경주결과 수집

### 3-1. 관련 파일

| 역할 | 파일 |
|------|------|
| 핵심 수집 스크립트 | `scripts/fetch-race-detail.ts` |
| GitHub Actions | `.github/workflows/realtime-race-results.yml` |
| 조회 API | `src/app/api/data/race-results/route.ts` |
| 화면 | `src/app/data/race-results/page.tsx` |

### 3-2. 자동 수집 스케줄 (GitHub Actions)

| 시간 (KST) | 내용 |
|-----------|------|
| 12:50 | 첫 수집 시작 |
| 13:00~18:00 | 매 10분마다 수집 |
| 19:00 | 마감 수집 |
| 20:00 | 최종 sweep |

실행 요일: **금/토/일** (경주일)

### 3-3. 수집 흐름

```
1. decision_card_pages에서 오늘 날짜의 round/day 조회
   └─ 이 테이블에 오늘 데이터 없으면 → 수집 자체가 시작 안 됨

2. kcycle 요약 페이지에서 경주 수 파악
   └─ URL: /race/result/general/popup/txt/{year}/{round}/{day}

3. 경주별 상세 HTML 스크래핑
   └─ URL: /race/result/general/{year}/{round}/{day}/001/{raceNo}
   └─ 파싱: 환경(날씨/풍향/풍속/기온), 선수별 결과(착순/착차/주행시간/승부수), 위반

4. Supabase upsert
   └─ races 테이블 (경주 기본정보 + 환경)
   └─ race_results 테이블 (선수별 결과)
```

### 3-4. ⚠️ 중요: clearProgress() 버그 (2026-03-21 수정)

**증상:** 매 10분마다 실행되는데 DB에 데이터가 안 쌓임

**원인:**
```
--date today 모드 실행 완료 후 progress 파일이 삭제 안 됨
→ 다음 실행 시 "이미 완료했다"고 착각
→ kcycle 스크래핑을 건너뜀
→ DB에 새 데이터 없음
```

**수정:** `scripts/fetch-race-detail.ts`에 `clearProgress(year)` 추가
위치: `seedToSupabase()` 호출 직후

### 3-5. 부분 결과 처리 (판정 시비 등)

경주 결과가 순서대로 안 나올 수 있음:
- 예: 2경주가 판정 시비로 1,2,3등만 먼저 나오고, 4경주가 먼저 완전히 나오는 경우

**현재 동작:**
- DB 스킵 로직 없음 → 매 10분마다 전체 16경주 다시 kcycle에서 가져와서 upsert
- 부분 데이터도 일단 저장 → 10분 뒤 완전한 데이터로 덮어쓰기

**알려진 이슈 (우선순위 낮음):**
- 경주 시작 전 환경 데이터만 있을 때 빈 경주 카드가 일시적으로 보일 수 있음

### 3-6. Supabase 테이블

| 테이블 | 내용 |
|--------|------|
| `races` | 경주 기본정보 + 환경 (year, round, day, race_no, 날씨, 온도 등) |
| `race_results` | 선수별 결과 (race_id, back_no, name, rank, gap, tactic 등) |
| `race_odds` | 배당률 (단승, 연승, 쌍승, 복승 등) - data.go.kr에서 별도 수집 |

### 3-7. 수동 재수집 명령어

```bash
# 오늘 경주결과 수동 수집
npx tsx scripts/fetch-race-detail.ts --date today

# 특정 날짜 수동 수집
npx tsx scripts/fetch-race-detail.ts --date 2026-03-21
```

---

## 4. 화면 표시 흐름 (경주결과 조회 페이지)

```
사용자가 연도/회차/일차 선택
↓
브라우저 → GET /api/data/race-results?year=2026&round=12&day=2
↓
API → Supabase 3개 테이블 조회
  - races (경주 기본정보)
  - race_results (선수별 결과)
  - race_odds (배당률)
  - racer_profiles (훈련지 정보)
↓
db-transformers.ts → snake_case → camelCase 변환
↓
화면에 경주 카드 표시
```

---

## 5. 알려진 이슈 및 TODO

| 항목 | 상태 | 우선순위 |
|------|------|---------|
| 인터뷰 페이지 달력 빨간 점 없음 | 미해결 | 높음 |
| 인터뷰 기사 본문 안 나옴 | 미해결 | 높음 |
| 경주 시작 전 빈 경주 카드 일시 표시 | 미해결 | 낮음 |
| 배당률 자동 수집 (GitHub Actions에 미설정) | 미해결 | 중간 |

---

## 6. 핵심 원칙

1. **데이터 존재가 로직 기준** - 스케줄 계산이 아닌 실제 데이터 유무로 판단
2. **kcycle 응답 검증 필수** - 없는 회차 요청 시 최근 데이터를 반환하는 특성
3. **광명 경기장만** - 창원/부산 데이터는 별도 처리 필요
4. **upsert 방식** - 중복 저장 시 덮어쓰기로 안전하게 처리
