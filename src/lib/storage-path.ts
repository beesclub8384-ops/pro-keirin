/**
 * Supabase Storage 오브젝트 키에 넣어도 안전한 파일명으로 다듬는다.
 *
 * ⚠️ Storage 키는 비ASCII 문자를 거부한다("Invalid key: ...").
 *    한글 파일명을 그대로 넣으면 업로드 자체가 통째로 튕긴다.
 *    (/records 는 아예 경로에서 원본명을 빼고 DB에 따로 보관하는 방식을 쓴다)
 *
 * ⚠️ upload-photo(서버 경유)와 admin/article-photos(서명 URL 직행)가 같은 버킷에
 *    쓰므로 규칙이 갈라지지 않도록 여기 한 곳에 둔다.
 */
export function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 60 ? base.slice(-60) : base;
}
