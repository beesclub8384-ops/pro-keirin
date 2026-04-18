const SYSTEM_PROMPT = `당신은 경륜 선수들이 추천하는 맛집 가이드 "륜슐랭"의 전문 에디터다.

목적:
"선수들이 먹어본 맛집"이라는 컨셉의 리뷰를 작성한다. 미슐랭 가이드처럼 권위 있게 읽히되,
"진짜 선수가 진짜 다녀본 집"이라는 진정성이 느껴지도록 한다.

출력 형식:
- 헤드라인, 부제목, 소제목 없이 본문 리뷰만.
- 8~12줄 정도의 한 덩어리 텍스트.
- 문단 구분은 빈 줄 1회로.

내용 구성 가이드:
1. 가게의 분위기나 첫인상을 간결히 소개.
2. 대표 메뉴 또는 시그니처 요리 언급.
3. 선수 메모가 주어진 경우, 그 내용을 반드시 반영(현장감 있는 디테일).
4. 이 가게가 추천할 만한 이유를 운동선수/경륜인의 관점에서.

톤 규칙:
- 담담하고 절제된 문체. 과장 금지.
- "최고의 맛", "꼭 가보세요", "강력 추천" 같은 광고 문구 금지.
- "~한다"체 사용. "~다니까요", "~이에요" 같은 구어체 금지.
- 선수 이름을 남발하지 말고, 필요할 때 1~2회만 언급.
- 가게 정보가 부족하면 모르는 내용을 지어내지 말고, 있는 정보만으로 담백하게 작성.
- 음식에 대한 추측성 묘사(맛, 향 등)는 선수 메모에 근거가 있을 때만.`;

export interface GenerateReviewInput {
  restaurantName: string;
  address: string;
  menu?: string;
  rawNote?: string;
  recommenderName: string;
  recommenderGrade?: string;
  recommenderRegion?: string;
}

function buildUserPrompt(input: GenerateReviewInput): string {
  const lines: string[] = [];
  lines.push("다음 정보를 바탕으로 륜슐랭 리뷰를 작성해주세요.");
  lines.push("");
  lines.push(`[가게 이름] ${input.restaurantName}`);
  lines.push(`[주소] ${input.address}`);
  if (input.menu) lines.push(`[대표 메뉴] ${input.menu}`);

  lines.push("");
  lines.push("[추천 선수]");
  const recommenderParts = [input.recommenderName];
  if (input.recommenderGrade) recommenderParts.push(input.recommenderGrade);
  if (input.recommenderRegion) recommenderParts.push(input.recommenderRegion);
  lines.push(recommenderParts.join(" · "));

  if (input.rawNote && input.rawNote.trim().length > 0) {
    lines.push("");
    lines.push("[선수가 카톡으로 보낸 원문 메모]");
    lines.push(input.rawNote.trim());
    lines.push("");
    lines.push(
      "위 원문 메모의 정보(가게 특징, 사장님 이야기, 개인적 경험 등)를 리뷰에 자연스럽게 녹여주세요.",
    );
  } else {
    lines.push("");
    lines.push(
      "(선수의 원문 메모는 제공되지 않았습니다. 알려진 정보만으로 담백하게 작성해주세요.)",
    );
  }

  lines.push("");
  lines.push(
    "위 정보로 8~12줄 분량의 리뷰를 작성해주세요. 본문 외 다른 요소(헤드라인, 소제목 등)는 포함하지 마세요.",
  );
  return lines.join("\n");
}

export async function generateGyeongshullinReview(
  input: GenerateReviewInput,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다");
  }

  const userPrompt = buildUserPrompt(input);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
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
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude가 빈 응답을 반환했습니다");
  }

  return text;
}
