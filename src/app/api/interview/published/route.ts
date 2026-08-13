import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { pickArticleBody } from "@/lib/article-body";

// 팬용 목록/상세가 공유하는 응답 — 60초 캐시로 Supabase 부하를 막는다.
// 이 60초는 백스톱일 뿐이고, 관리자가 기사를 저장/발행/삭제하면
// admin/articles/[articleId] 라우트가 revalidatePath 로 즉시 무효화한다.
export const revalidate = 60;

function toKSTDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export async function GET() {
  const sb = createAdminClient();

  const { data: articles, error } = await sb
    .from("interview_articles")
    .select(
      "request_id, player_name, grade, region, headline, article_raw, article_edited, photos, published_at",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const playerNames = Array.from(
    new Set(
      (articles ?? [])
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
    new Set((articles ?? []).map((a) => a.request_id as number)),
  );

  let photosByReq = new Map<number, string[]>();
  if (requestIds.length > 0) {
    const { data: responses } = await sb
      .from("interview_responses")
      .select("request_id, photo_urls")
      .in("request_id", requestIds);

    photosByReq = new Map();
    for (const r of responses ?? []) {
      const reqId = r.request_id as number;
      const urls = asStringArray(r.photo_urls);
      if (urls.length === 0) continue;
      const cur = photosByReq.get(reqId) ?? [];
      photosByReq.set(reqId, [...cur, ...urls]);
    }
  }

  const result = (articles ?? []).map((a) => {
    const articlePhotos = asStringArray(a.photos);
    const responsePhotos = photosByReq.get(a.request_id as number) ?? [];
    const photos = Array.from(new Set([...articlePhotos, ...responsePhotos]));
    return {
      date: toKSTDate(a.published_at as string | null),
      playerName: a.player_name,
      photoUrl: photoUrlByName.get((a.player_name as string) ?? "") ?? null,
      grade: a.grade,
      region: a.region,
      headline: (a.headline as string | null) ?? "",
      article: pickArticleBody(
        a.article_edited as string | null,
        a.article_raw as string | null,
      ),
      photos,
      docLink: null,
    };
  });

  // Cache-Control 을 직접 지정하지 않는다 — 위의 revalidate 가 걸린 라우트에서는
  // Next 가 응답 헤더를 public, max-age=0, must-revalidate 로 덮어써서 무시된다.
  // (기존의 s-maxage=60, stale-while-revalidate=300 은 실제로 적용된 적이 없는 죽은 설정이었다)
  return NextResponse.json(result);
}
