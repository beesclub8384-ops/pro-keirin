import { supabaseBrowser } from "@/lib/supabase-browser";
import type { InterviewArticle } from "@/lib/interview";

// 브라우저(anon)에서 직접 published 인터뷰 기사를 조회한다.
// 서버용 lib/interview.ts(fetchInterviews + enrichArticles)와 "동일한 쿼리/가공"을
// service role 대신 supabaseBrowser(anon)로 구현한 클라이언트 버전.
// (대상 테이블 interview_articles / interview_responses / racer_profiles 는
//  anon SELECT 허용 확인됨 — racer_profiles는 Public read 정책)

/** ISO 타임스탬프("2026-02-28T15:00:00.000Z")를 KST 날짜("2026-03-01")로 변환 */
function toKSTDate(dateStr: string | null): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

type ArticleRow = {
  request_id: number;
  player_name: string | null;
  grade: string | null;
  region: string | null;
  headline: string | null;
  article_raw: string | null;
  article_edited: string | null;
  photos: unknown;
  published_at: string | null;
};

/** articles에 racer 사진 + interview_responses 사진을 결합 (lib/interview.enrichArticles와 동일 로직, 브라우저 클라이언트) */
async function enrichArticles(
  articles: ArticleRow[],
): Promise<InterviewArticle[]> {
  if (articles.length === 0) return [];
  const sb = supabaseBrowser;

  const playerNames = Array.from(
    new Set(articles.map((a) => a.player_name ?? "").filter(Boolean)),
  );
  const photoUrlByName = new Map<string, string>();
  if (playerNames.length > 0) {
    const { data: racers } = await sb
      .from("racer_profiles")
      .select("name, photo_url")
      .in("name", playerNames)
      .not("photo_url", "is", null);
    for (const r of racers ?? []) {
      const n = r.name as string;
      const u = r.photo_url as string | null;
      if (n && u && !photoUrlByName.has(n)) {
        photoUrlByName.set(n, u);
      }
    }
  }

  const requestIds = Array.from(new Set(articles.map((a) => a.request_id)));
  const photosByReq = new Map<number, string[]>();
  if (requestIds.length > 0) {
    const { data: responses } = await sb
      .from("interview_responses")
      .select("request_id, photo_urls")
      .in("request_id", requestIds);

    for (const r of responses ?? []) {
      const reqId = r.request_id as number;
      const urls = asStringArray(r.photo_urls);
      if (urls.length === 0) continue;
      const cur = photosByReq.get(reqId) ?? [];
      photosByReq.set(reqId, [...cur, ...urls]);
    }
  }

  return articles.map((a) => {
    const articlePhotos = asStringArray(a.photos);
    const responsePhotos = photosByReq.get(a.request_id) ?? [];
    const uniquePhotos = Array.from(
      new Set([...articlePhotos, ...responsePhotos]),
    );
    return {
      date: toKSTDate(a.published_at),
      playerName: a.player_name ?? "",
      photoUrl: photoUrlByName.get(a.player_name ?? "") ?? null,
      grade: a.grade ?? "",
      region: a.region ?? "",
      headline: a.headline ?? "",
      article: a.article_edited ?? a.article_raw ?? "",
      docLink: "",
      photos: uniquePhotos,
    };
  });
}

/** 브라우저에서 published 인터뷰 기사를 직접 조회 (SWR fetcher용) */
export async function fetchPublishedArticles(): Promise<InterviewArticle[]> {
  const { data: articles, error } = await supabaseBrowser
    .from("interview_articles")
    .select(
      "request_id, player_name, grade, region, headline, article_raw, article_edited, photos, published_at",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error || !articles) return [];
  return enrichArticles(articles as ArticleRow[]);
}

/**
 * 특정 KST 날짜의 published 인터뷰만 브라우저(anon)에서 조회.
 * lib/interview.fetchInterviewsByDate와 동일한 KST 자정~다음날 자정 범위 필터.
 */
export async function fetchArticlesByDate(
  date: string,
): Promise<InterviewArticle[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const startKstUtc = `${date}T00:00:00+09:00`;
  const next = new Date(startKstUtc);
  next.setUTCDate(next.getUTCDate() + 1);
  const endKstUtc = next.toISOString();

  const { data: articles, error } = await supabaseBrowser
    .from("interview_articles")
    .select(
      "request_id, player_name, grade, region, headline, article_raw, article_edited, photos, published_at",
    )
    .eq("status", "published")
    .gte("published_at", startKstUtc)
    .lt("published_at", endKstUtc)
    .order("published_at", { ascending: false });

  if (error || !articles) return [];
  return enrichArticles(articles as ArticleRow[]);
}

/**
 * decision_card_pages에서 (year, round, day) → 경주일("YYYY-MM-DD") 조회.
 * lib/race-date.lookupRaceDate의 브라우저(anon) 버전.
 */
export async function lookupRaceDate(
  year: number,
  round: number,
  day: number,
): Promise<string | null> {
  const { data, error } = await supabaseBrowser
    .from("decision_card_pages")
    .select("date")
    .eq("year", year)
    .eq("round", round)
    .eq("day", day)
    .maybeSingle();
  if (error || !data) return null;
  return (data.date as string) ?? null;
}
