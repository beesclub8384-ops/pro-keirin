import { createAdminClient } from "@/lib/supabase";

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

  const playerNames = Array.from(
    new Set(
      articles
        .map((a) => (a.player_name as string) ?? "")
        .filter(Boolean),
    ),
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

  const requestIds = Array.from(
    new Set(articles.map((a) => a.request_id as number)),
  );

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
    const responsePhotos = photosByReq.get(a.request_id as number) ?? [];
    const uniquePhotos = Array.from(
      new Set([...articlePhotos, ...responsePhotos]),
    );
    return {
      date: toKSTDate(a.published_at as string | null),
      playerName: (a.player_name as string) ?? "",
      photoUrl: photoUrlByName.get((a.player_name as string) ?? "") ?? null,
      grade: (a.grade as string) ?? "",
      region: (a.region as string) ?? "",
      headline: (a.headline as string | null) ?? "",
      article:
        (a.article_edited as string | null) ??
        (a.article_raw as string | null) ??
        "",
      docLink: "",
      photos: uniquePhotos,
    };
  });
}

export async function fetchInterviewsByDate(
  date: string,
): Promise<InterviewArticle[]> {
  const all = await fetchInterviews();
  return all.filter((a) => a.date === date);
}
