/**
 * 인터뷰 기사 본문 선택 규칙 — 표시/편집 양쪽에서 이 함수 하나만 쓴다.
 *
 * article_edited 가 있으면 그걸 쓰고, 없으면 article_raw 로 떨어진다.
 * "없다"의 판정에 공백만 있는 경우도 포함하는 것이 핵심이다:
 *
 *   article_edited = null   → raw   (아직 수정 안 함)
 *   article_edited = ""     → raw   (에디터를 비우고 저장 — ?? 로는 못 걸러진다)
 *   article_edited = "\n "  → raw   (공백만 남은 저장)
 *   article_edited = "본문"  → edited
 *
 * ?? 는 null/undefined 만 걸러서 빈 문자열을 그대로 통과시킨다.
 * 그 경우 기사가 원본으로 폴백되지 않고 아예 빈 화면으로 나가므로 trim() 검사가 필요하다.
 */
export function pickArticleBody(
  edited: string | null | undefined,
  raw: string | null | undefined,
): string {
  if (edited && edited.trim()) return edited;
  return raw ?? "";
}
