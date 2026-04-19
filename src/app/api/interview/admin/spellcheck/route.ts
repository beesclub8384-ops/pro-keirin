import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `당신은 한국어 맞춤법/띄어쓰기 검사기다.

입력된 텍스트에서 맞춤법 오류, 띄어쓰기 오류, 오타만 찾는다.
문체나 표현 개선은 하지 않는다. 오류가 아닌 것은 지적하지 않는다.

응답 형식 (JSON 배열):
[
  { "wrong": "틀린 표현", "correct": "올바른 표현", "type": "띄어쓰기" },
  { "wrong": "틀린 표현", "correct": "올바른 표현", "type": "오타" },
  { "wrong": "틀린 표현", "correct": "올바른 표현", "type": "맞춤법" }
]

- type은 "띄어쓰기", "오타", "맞춤법" 중 하나.
- 오류가 없으면 빈 배열 [] 을 반환.
- JSON만 출력. 다른 텍스트나 설명 없음.`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다" },
      { status: 500 },
    );
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ items: [] });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `다음 텍스트의 맞춤법/띄어쓰기/오타를 검사해주세요:\n\n${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API 오류 (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const rawText = json.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ items: [] });
    }

    const items = JSON.parse(jsonMatch[0]) as Array<{
      wrong: string;
      correct: string;
      type: string;
    }>;

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[spellcheck] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
