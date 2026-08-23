import { supabaseBrowser } from "@/lib/supabase-browser";
import type { InterviewArticle } from "@/lib/interview";

// published 인터뷰는 캐시된 /api/interview/published API를 경유해 조회한다.
// (직접 DB 조회 대신 API를 쓰면 Vercel CDN 캐시 s-maxage=60 + SWR 캐시 이중 효과 →
//  방문자마다 Supabase를 직접 때리지 않고 엣지 캐시를 재사용)

/** API가 내려주는 기사 객체를 InterviewArticle로 정규화 (null 필드 방어) */
function normalizeArticle(x: Record<string, unknown>): InterviewArticle {
  const photos = x.photos;
  return {
    date: (x.date as string | null) ?? "",
    playerName: (x.playerName as string | null) ?? "",
    photoUrl: (x.photoUrl as string | null) ?? null,
    grade: (x.grade as string | null) ?? "",
    region: (x.region as string | null) ?? "",
    headline: (x.headline as string | null) ?? "",
    article: (x.article as string | null) ?? "",
    docLink: (x.docLink as string | null) ?? "",
    photos: Array.isArray(photos)
      ? (photos.filter((p) => typeof p === "string") as string[])
      : [],
  };
}

/** 캐시된 published API에서 전체 published 기사를 가져온다 */
async function fetchPublishedFromApi(): Promise<InterviewArticle[]> {
  const res = await fetch("/api/interview/published");
  // 실패는 던져서 SWR이 error를 감지하게 한다 (무음 실패 방지)
  if (!res.ok) throw new Error(`published API ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("published API: 예상치 못한 응답 형식");
  }
  return data.map((x) => normalizeArticle(x as Record<string, unknown>));
}

/** published 인터뷰 기사 전체 조회 (SWR fetcher용) */
export async function fetchPublishedArticles(): Promise<InterviewArticle[]> {
  return fetchPublishedFromApi();
}

/**
 * 특정 KST 날짜의 published 인터뷰만 조회.
 * 캐시된 전체 목록(같은 API)을 받아 date로 필터한다 — 목록/상세가 동일 엔드포인트를
 * 공유하므로 CDN 캐시 적중률이 높다. (published API의 date 필드는 이미 KST 기준)
 */
export async function fetchArticlesByDate(
  date: string,
): Promise<InterviewArticle[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const all = await fetchPublishedFromApi();
  return all.filter((a) => a.date === date);
}

/**
 * (venue, year, round, day) → 경주일("YYYY-MM-DD") 조회.
 * lib/race-date.lookupRaceDate의 브라우저(anon) 버전 — 두 곳을 같이 고칠 것.
 *
 * ⚠️ venue 필터는 필수다. 3개장이 같은 (year, round, day)를 쓰므로
 *    필터가 없으면 maybeSingle()이 여러 행을 받아 에러를 내고 조용히 null이 된다
 *    (2026-08-23 실측: 2026/30/1 → 광명 07-24, 창원 08-07, 부산 08-21 세 행).
 *
 * ⚠️ 부산만 출처가 다르다. decision_card_pages의 부산 날짜는 실제와 어긋난다
 *    (races와 조인되는 622행 중 367행 불일치 — 부산 2026/30/1이 08-07로 들어가 있으나
 *    실제는 08-21). 부산은 spo1에서 직접 수집한 races 테이블을 쓴다.
 */
export async function lookupRaceDate(
  year: number,
  round: number,
  day: number,
  venue: "광명" | "창원" | "부산" = "광명",
): Promise<string | null> {
  if (venue === "부산") {
    // races.round는 text 컬럼이라 문자열로 비교한다
    const { data, error } = await supabaseBrowser
      .from("races")
      .select("date")
      .eq("venue", venue)
      .eq("year", year)
      .eq("round", String(round))
      .eq("day", day)
      .limit(1);
    if (error || !data?.length) return null;
    return (data[0].date as string) ?? null;
  }

  const { data, error } = await supabaseBrowser
    .from("decision_card_pages")
    .select("date")
    .eq("venue", venue)
    .eq("year", year)
    .eq("round", round)
    .eq("day", day)
    .maybeSingle();
  if (error || !data) return null;
  return (data.date as string) ?? null;
}
