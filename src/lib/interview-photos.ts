/**
 * 기사에 표시할 사진 배열을 고르는 단 하나의 규칙.
 *
 * ⚠️ 왜 공용 모듈인가 (2026-09-06):
 *   이 판단이 팬 목록(src/lib/interview.ts), 팬 API(api/interview/published),
 *   관리자 미리보기(interview/admin/[articleId]) 세 곳에 각각 복사돼 있었고,
 *   셋 다 article.photos 와 responses.photo_urls 를 **합집합**으로 묶었다.
 *   그래서 관리자가 photos 에서 사진을 빼도 응답 사진이 뒤에 다시 붙어
 *   "지웠는데 그대로 나오는" 무음 실패가 됐다. 규칙을 한 곳으로 모은다.
 *
 * 규칙:
 *   article.photos 가 배열이면 **그것이 전부다**. 빈 배열([])도
 *   "관리자가 전부 지웠다"는 확정 상태로 존중한다 (폴백하지 않는다).
 *   null·미설정처럼 배열이 아닐 때만 응답 사진으로 폴백한다.
 *
 * 본문의 [PHOTO_n] 은 반환 배열의 n-1 인덱스를 가리키므로 **순서가 곧 의미**다.
 * 폴백 경로에서만 중복을 제거한다 (article.photos 는 관리자가 정한 순서 그대로 둔다).
 */
export function resolveArticlePhotos(
  articlePhotos: unknown,
  responsePhotos: string[],
): string[] {
  if (Array.isArray(articlePhotos)) {
    return articlePhotos.filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );
  }
  return Array.from(new Set(responsePhotos.filter(Boolean)));
}
