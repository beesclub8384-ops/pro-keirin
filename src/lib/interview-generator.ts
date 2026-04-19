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
    .select("id, player_name, grade, region, status")
    .eq("id", requestId)
    .maybeSingle();

  if (reqErr) throw new Error(`request 조회 실패: ${reqErr.message}`);
  if (!request) throw new Error(`request ${requestId} 없음`);
  if (request.status !== "completed") {
    throw new Error(`status가 completed가 아닙니다: ${request.status}`);
  }

  const { data: responses, error: respErr } = await sb
    .from("interview_responses")
    .select("question_text, answer_text, answer_choice, photo_urls")
    .eq("request_id", requestId)
    .order("id", { ascending: true });

  if (respErr) throw new Error(`responses 조회 실패: ${respErr.message}`);
  if (!responses || responses.length === 0) {
    throw new Error("답변이 없습니다");
  }

  const playerName = request.player_name as string;
  const { markdown: articleRaw, uniquePhotos } = buildArticleMarkdown(
    playerName,
    responses as ResponseRow[],
  );

  const headline = `${playerName} 인터뷰`;

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
    })
    .select("id")
    .single();

  if (insErr) throw new Error(`article insert 실패: ${insErr.message}`);

  return { articleId: inserted.id as number, headline };
}
