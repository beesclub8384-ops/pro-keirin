import { createAdminClient } from "@/lib/supabase";

interface ResponseRow {
  question_text: string;
  answer_text: string | null;
  answer_choice: string | null;
  photo_urls: string[] | null;
}

function buildArticleMarkdown(
  playerName: string,
  responses: ResponseRow[],
  freePhotos: string[] = [],
): { markdown: string; uniquePhotos: string[] } {
  const uniquePhotos: string[] = [];
  const seen = new Set<string>();

  const lines: string[] = [];
  lines.push(`# ${playerName} 인터뷰`);
  lines.push("");

  for (const r of responses) {
    const q = (r.question_text ?? "").trim();
    const choice = (r.answer_choice ?? "").trim();
    const text = (r.answer_text ?? "").trim();
    const answerParts: string[] = [];
    if (choice) answerParts.push(choice);
    if (text) answerParts.push(text);
    const a = answerParts.join(" / ");

    if (!q && !a) continue;

    if (q) {
      lines.push(`Q. ${q}`);
    }
    if (a) {
      lines.push(`A. ${a}`);
    }

    const urls = r.photo_urls ?? [];
    for (const u of urls) {
      if (!u) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      uniquePhotos.push(u);
      lines.push("");
      lines.push(`[PHOTO_${uniquePhotos.length}]`);
    }

    lines.push("");
  }

  // 질문과 무관한 자유 첨부 사진 — 본문 하단에 사진만 이어붙인다.
  // "### 첨부 사진" 같은 제목은 넣지 않는다 (기사 흐름을 끊고 화면에서 군더더기로 보인다)
  const freeToAdd = freePhotos.filter((u) => u && !seen.has(u));
  if (freeToAdd.length > 0) {
    for (const u of freeToAdd) {
      seen.add(u);
      uniquePhotos.push(u);
      lines.push("");
      lines.push(`[PHOTO_${uniquePhotos.length}]`);
    }
    lines.push("");
  }

  return {
    markdown: lines.join("\n").trimEnd(),
    uniquePhotos,
  };
}

export interface GenerateResult {
  articleId: number;
  headline: string;
}

export async function generateInterviewArticle(
  requestId: number,
): Promise<GenerateResult> {
  const sb = createAdminClient();

  const { data: request, error: reqErr } = await sb
    .from("interview_requests")
    .select("id, player_name, grade, region, status, free_photos")
    .eq("id", requestId)
    .maybeSingle();

  if (reqErr) throw new Error(`request 조회 실패: ${reqErr.message}`);
  if (!request) throw new Error(`request ${requestId} 없음`);
  if (request.status !== "completed") {
    throw new Error(`status가 completed가 아닙니다: ${request.status}`);
  }

  const { data: responses, error: respErr } = await sb
    .from("interview_responses")
    .select("question_text, answer_text, answer_choice, photo_urls, created_at")
    .eq("request_id", requestId)
    .order("id", { ascending: true });

  if (respErr) throw new Error(`responses 조회 실패: ${respErr.message}`);
  if (!responses || responses.length === 0) {
    throw new Error("답변이 없습니다");
  }

  const playerName = request.player_name as string;
  const freePhotos: string[] = Array.isArray(request.free_photos)
    ? (request.free_photos as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      )
    : [];
  const { markdown: articleRaw, uniquePhotos } = buildArticleMarkdown(
    playerName,
    responses as ResponseRow[],
    freePhotos,
  );

  const headline = `${playerName} 인터뷰`;

  // 기사 날짜는 "발행한 시각"이 아니라 "선수가 첫 답변을 남긴 시각"으로 고정한다.
  // 화면 표시 날짜와 달력 빨간 점이 모두 published_at 을 보므로 생성 시점에 확정해두고,
  // 이후 발행/재발행에서는 이 값을 유지한다 (admin/articles/[articleId] PATCH 참고).
  const firstAnswerAt = (responses as Array<{ created_at?: string | null }>)
    .map((r) => r.created_at ?? null)
    .filter((v): v is string => Boolean(v))
    .reduce<string | null>(
      (min, cur) => (min === null || Date.parse(cur) < Date.parse(min) ? cur : min),
      null,
    );

  const { data: inserted, error: insErr } = await sb
    .from("interview_articles")
    .insert({
      request_id: requestId,
      player_name: request.player_name,
      grade: request.grade,
      region: request.region,
      article_raw: articleRaw,
      headline,
      photos: uniquePhotos.length > 0 ? uniquePhotos : null,
      status: "review",
      published_at: firstAnswerAt,
    })
    .select("id")
    .single();

  if (insErr) throw new Error(`article insert 실패: ${insErr.message}`);

  return { articleId: inserted.id as number, headline };
}
