# PRO-KEIRIN 인터뷰 페이지 버그 수정

## 현재 상태
- 폼 제출 → AI 기사 생성 → 스프레드시트 저장: ✅ 작동
- 달력 페이지: ✅ 표시됨
- 인터뷰 목록: ✅ 선수 이름 표시됨 (예: "노태양")

## 버그 2개

### 버그 1: 달력에 빨간 점 표시 없음
- 기사가 있는 날짜에 빨간 점(또는 하이라이트) 표시가 없음
- 해당 날짜에 인터뷰가 하나라도 있으면 달력에서 시각적으로 구분되어야 함
- 예: 3월 1일에 기사가 있으면 → 달력의 "1" 아래에 빨간 점 표시

### 버그 2: 기사 본문이 안 나옴
- 인터뷰 목록에서 선수 이름을 클릭해도 기사 내용을 볼 수 없음
- 클릭하면 해당 기사 전문이 표시되어야 함

## 데이터 소스
- API URL: `https://script.google.com/macros/s/AKfycbwbhJchNH0iB1GV2NnhOor0mSdkmt86nAcp1PClJcTg3SkSwUndPgY2NfQWnDzNGX9gUQ/exec`
- 응답 형식 (JSON):
```json
[
  {
    "date": "2026-03-01",
    "playerName": "노태양",
    "grade": "우수",
    "region": "김포",
    "article": "# 헤드라인...\n본문...\n📊 PRO-KEIRIN 분석 노트...",
    "docLink": "https://docs.google.com/..."
  }
]
```
- "승인" 상태인 기사만 API에서 반환됨

## 기사 표시 요구사항
- 마크다운 형식의 기사를 렌더링 (헤드라인, 부제, 본문, 분석 노트)
- 같은 날 여러 기사가 있을 수 있음
- 뒤로가기 버튼 (달력으로 돌아가기)

## 기술 스택
- Next.js + TypeScript + Tailwind CSS + shadcn/ui
- Vercel 배포

## 주의사항
- 반드시 파일을 직접 수정하고, 수정 전후 diff를 보여줘. 수정 완료 후 해당 파일을 cat으로 보여줘.
