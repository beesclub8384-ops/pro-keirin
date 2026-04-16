import { createAdminClient } from "@/lib/supabase";

interface RecentRace {
  year: number;
  round: number;
  day: number;
  race_no: number;
  rank: number | null;
  tactic: string | null;
}

interface ResponseRow {
  question_code: string;
  question_text: string;
  answer_text: string | null;
  answer_choice: string | null;
}

const SYSTEM_PROMPT = `당신은 7RANDOMS의 전문 경륜 기자다. 선수 인터뷰 Q&A와 최근 경주 데이터를 받아, 독자가 몰입할 수 있는 블로그체 기사로 재구성한다.

규칙:
1. 질문-답변(Q&A) 형식 금지. 기자가 쓴 내러티브(서사) 기사로 재구성한다.
2. 헤드라인(H1)은 선수의 가장 인상적인 발언을 따옴표 인용문 형태로. 예: # "이번 회차는 제 인생 최고의 3일이었어요"
3. 본문은 소제목(H2)으로 3~5개 구획으로 나눈다.
4. 선수의 최근 5경주 결과를 자연스럽게 문장 안에 녹여낸다. 단순 나열 금지.
5. 분량: 본문 800~1200자(공백 포함).
6. 선수 발언은 큰따옴표 인용, 자연스러운 맥락 속에 배치.
7. 기사 맨 마지막에 반드시 아래 형식으로 📊 분석 노트를 붙인다:

---

### 📊 PRO-KEIRIN 분석 노트

**최근 5경주 요약:** (착순/전법 기반 1~2문장)
**이번 인터뷰의 포인트:** (1~2문장)
**지켜볼 점:** (1문장)

8. 사진이 제공된 경우, [PHOTO_1], [PHOTO_2], ... 플레이스홀더를 사진 수만큼 본문 중간중간 자연스럽게 배치한다. 사진이 없으면 플레이스홀더를 넣지 않는다.
9. 과장된 미사여구, 확인되지 않은 추측, 도박/베팅 유도 표현 금지.`;

function extractHeadline(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  if (!m) return "";
  return m[1].replace(/^["'「"']|["'」"']$/g, "").trim();
}

function formatRecentRaces(races: RecentRace[]): string {
  if (races.length === 0) return "(최근 경주 데이터 없음)";
  return races
    .map(
      (r) =>
        `- ${r.year}년 ${r.round}회차 ${r.day}일차 ${r.race_no}경주: ${r.rank ?? "-"}착 / 전법 ${r.tactic ?? "-"}`,
    )
    .join("\n");
}

function formatResponses(responses: ResponseRow[]): string {
  return responses
    .map((r, i) => {
      const parts: string[] = [];
      parts.push(`Q${i + 1}. [${r.question_code}] ${r.question_text}`);
      if (r.answer_choice) parts.push(`선택: ${r.answer_choice}`);
      if (r.answer_text) parts.push(`답변: ${r.answer_text}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

async function fetchRecentRaces(
  sb: ReturnType<typeof createAdminClient>,
  playerName: string,
): Promise<RecentRace[]> {
  const { data: results } = await sb
    .from("race_results")
    .select("race_id, rank, tactic")
    .eq("name", playerName)
    .order("race_id", { ascending: false })
    .limit(20);

  if (!results || results.length === 0) return [];

  const raceIds = results.map((r) => r.race_id);
  const { data: races } = await sb
    .from("races")
    .select("id, year, round, day, race_no")
    .in("id", raceIds);

  if (!races) return [];

  const byId = new Map(races.map((r) => [r.id as number, r]));
  const merged: RecentRace[] = results
    .map((r) => {
      const race = byId.get(r.race_id as number);
      if (!race) return null;
      return {
        year: race.year as number,
        round: race.round as number,
        day: race.day as number,
        race_no: race.race_no as number,
        rank: (r.rank as number | null) ?? null,
        tactic: (r.tactic as string | null) ?? null,
      };
    })
    .filter((r): r is RecentRace => r !== null)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.round !== b.round) return b.round - a.round;
      if (a.day !== b.day) return b.day - a.day;
      return b.race_no - a.race_no;
    })
    .slice(0, 5);

  return merged;
}

async function callClaude(userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API 오류 (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = json.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  return text.trim();
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
    .select("question_code, question_text, answer_text, answer_choice, photo_urls")
    .eq("request_id", requestId)
    .order("id", { ascending: true });

  if (respErr) throw new Error(`responses 조회 실패: ${respErr.message}`);
  if (!responses || responses.length === 0) {
    throw new Error("답변이 없습니다");
  }

  const allPhotos: string[] = [];
  for (const r of responses) {
    const urls = r.photo_urls as string[] | null;
    if (urls) {
      for (const u of urls) {
        if (u) allPhotos.push(u);
      }
    }
  }

  const recentRaces = await fetchRecentRaces(sb, request.player_name as string);

  const photoInstruction =
    allPhotos.length > 0
      ? `\n[사진 정보]\n이 인터뷰에는 사진이 ${allPhotos.length}장 첨부되어 있습니다. 본문에 [PHOTO_1]~[PHOTO_${allPhotos.length}] 태그를 적절한 위치에 배치해주세요.\n`
      : "\n[사진 정보]\n첨부된 사진이 없습니다. [PHOTO_N] 태그를 넣지 마세요.\n";

  const userPrompt = `아래 정보를 바탕으로 7RANDOMS 인터뷰 기사를 작성해주세요.

[선수 기본 정보]
- 이름: ${request.player_name}
- 등급: ${request.grade ?? "-"}
- 지부: ${request.region ?? "-"}

[최근 5경주 결과]
${formatRecentRaces(recentRaces)}
${photoInstruction}
[인터뷰 질문-답변]
${formatResponses(responses as ResponseRow[])}

위 내용을 시스템 지침에 따라 마크다운 기사로 작성해주세요.`;

  const articleRaw = await callClaude(userPrompt);
  const headline = extractHeadline(articleRaw);

  const { data: inserted, error: insErr } = await sb
    .from("interview_articles")
    .insert({
      request_id: requestId,
      player_name: request.player_name,
      grade: request.grade,
      region: request.region,
      article_raw: articleRaw,
      headline,
      photos: allPhotos.length > 0 ? allPhotos : null,
      status: "review",
    })
    .select("id")
    .single();

  if (insErr) throw new Error(`article insert 실패: ${insErr.message}`);

  return { articleId: inserted.id as number, headline };
}
