# Phase 2: 교차 검증

## entry-data ↔ race-detail-data 선수명 매칭
- 매칭: 309,358건
- 불일치: 10,817건
- detail에만 있는 경주: 0건
- 매칭률: 96.62%
- 불일치 샘플:
  - 2003-03-07 1R: detail="박점돌" not in entry
  - 2003-03-07 5R: detail="허 남" not in entry
  - 2003-03-07 7R: detail="정 관" not in entry
  - 2003-03-07 8R: detail="권언호" not in entry
  - 2003-03-07 10R: detail="최진형" not in entry
  - 2003-03-07 10R: detail="민원영" not in entry
  - 2003-03-07 11R: detail="노영식" not in entry
  - 2003-03-07 11R: detail="임 섭" not in entry
  - 2003-03-08 1R: detail="박점돌" not in entry
  - 2003-03-08 5R: detail="허 남" not in entry

## entry-data ↔ race-data 경주 매칭
- 공통: 45,761건
- entry에만: 3건
- race-data에만: 12건
- 매칭률: 99.97%

## ranking-data ↔ racer-profile-data 매칭
- 매칭: 13,183건
- 미매칭: 0건
- 승률 일치(±1%): 13181건
- 승률 불일치: 2건
- 불일치 샘플:
  - 2009 이경곤: ranking=0% vs profile=20%
  - 2009 조호성: ranking=0% vs profile=81%
