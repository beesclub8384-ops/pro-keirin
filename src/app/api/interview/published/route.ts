import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

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
      article: (a.article_edited as string | null) ?? (a.article_raw as string | null) ?? "",
      photos,
      docLink: null,
    };
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
    },
  });
}
