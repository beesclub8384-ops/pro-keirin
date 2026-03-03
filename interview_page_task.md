# PRO-KEIRIN 인터뷰 페이지 구현 작업 지시서
## Claude Code용

---

## 개요
pro-keirin 사이트에 "선수 인터뷰" 페이지를 추가하는 작업.
선수가 구글폼으로 인터뷰에 답변하면 AI가 기사를 자동 생성하고,
CEO(태양)가 승인한 기사만 사이트 달력에 표시되는 구조.

---

## 작업 목록

### 1. 네비게이션 변경
- "선수 데이터" 메뉴를 **"선수 인터뷰"**로 이름 변경
- 링크를 `/interview` 페이지로 연결

### 2. 달력 페이지 (`/interview`)
- 월력(월간 달력) 표시
- ◀ ▶ 버튼으로 월 이동
- 기사가 있는 날짜에 표시 (점 또는 하이라이트)
- 날짜 클릭 → 해당 날짜의 기사 페이지로 이동

### 3. 기사 페이지 (`/interview/[date]`)
- 해당 날짜의 인터뷰 기사 표시
- 같은 날 여러 기사가 있을 수 있음 (여러 선수)
- 마크다운 형식의 기사 렌더링

### 4. 데이터 연결
- 구글 스프레드시트 웹 앱 API에서 "승인" 상태 기사만 가져옴
- API URL: `https://script.google.com/macros/s/AKfycbwbhJchNH0iB1GV2NnhOor0mSdkmt86nAcp1PClJcTg3SkSwUndPgY2NfQWnDzNGX9gUQ/exec`

### API 응답 형식 (JSON)
```json
[
  {
    "date": "2026-03-01",
    "playerName": "김진우",
    "grade": "우수",
    "region": "김포",
    "article": "# 헤드라인...\n본문...",
    "docLink": "https://docs.google.com/..."
  }
]
```

---

## 기술 스택
- Next.js + TypeScript + Tailwind CSS + shadcn/ui
- Vercel 배포

---

## 승인 워크플로우
```
선수 폼 제출 → AI 기사 생성 → 스프레드시트 "검토중"
    → 태양이 Docs에서 확인/수정
    → 스프레드시트에서 "검토중" → "승인" 변경
    → 사이트 달력에 자동 표시
```

---

## 주의사항
- 반드시 파일을 직접 수정하고, 수정 전후 diff를 보여줘. 수정 완료 후 해당 파일을 cat으로 보여줘.
