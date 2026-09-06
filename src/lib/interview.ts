import { createAdminClient } from "@/lib/supabase";
import { pickArticleBody } from "@/lib/article-body";
import { resolveArticlePhotos } from "@/lib/interview-photos";

export interface InterviewArticle {
  date: string;
  playerName: string;
  photoUrl: string | null;
  grade: string;
  region: string;
  headline: string;
  article: string;
  docLink: string;
  photos?: string[];
}

// 구버전: 구글 Apps Script 기반 인터뷰 API (참고용 보존)
// const API_URL =
//   "https://script.google.com/macros/s/AKfycbwbhJchNH0iB1GV2NnhOor0mSdkmt86nAcp1PClJcTg3SkSwUndPgY2NfQWnDzNGX9gUQ/exec";
// 구버전: self-fetch 방식도 Vercel 서버 컴포넌트에서 간헐적 실패로 폐기
// const API_PATH = "/api/interview/published";

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

/**
 * 조회된 articles에 racer 사진 + interview_responses 사진을 결합해 InterviewArticle[]로 변환.
 * fetchInterviews / fetchInterviewsByDate 둘 다 같은 enrichment를 쓰므로 헬퍼로 추출.
 */
async function enrichArticles(
  articles: ArticleRow[],
): Promise<InterviewArticle[]> {
  if (articles.length === 0) return [];
  const sb = createAdminClient();

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
    // ⚠️ 합집합이 아니다. article.photos 가 있으면 그것이 전부다 (빈 배열 포함).
    //    합집합으로 묶으면 관리자가 지운 사진이 응답 사진에서 되살아난다.
    const uniquePhotos = resolveArticlePhotos(
      a.photos,
      photosByReq.get(a.request_id) ?? [],
    );
    return {
      date: toKSTDate(a.published_at),
      playerName: a.player_name ?? "",
      photoUrl: photoUrlByName.get(a.player_name ?? "") ?? null,
      grade: a.grade ?? "",
      region: a.region ?? "",
      headline: a.headline ?? "",
      article: pickArticleBody(a.article_edited, a.article_raw),
      docLink: "",
      photos: uniquePhotos,
    };
  });
}

/** Supabase에서 published 상태의 인터뷰 기사를 직접 조회 */
export async function fetchInterviews(): Promise<InterviewArticle[]> {
  const sb = createAdminClient();

  const { data: articles, error } = await sb
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
 * 특정 KST 날짜의 published 인터뷰만 조회.
 * published_at은 timestamp이므로 KST 자정 ~ 다음 날 KST 자정 범위로 SQL 필터를 건다.
 */
export async function fetchInterviewsByDate(
  date: string,
): Promise<InterviewArticle[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const startKstUtc = `${date}T00:00:00+09:00`;
  const next = new Date(startKstUtc);
  next.setUTCDate(next.getUTCDate() + 1);
  const endKstUtc = next.toISOString();

  const sb = createAdminClient();

  const { data: articles, error } = await sb
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
