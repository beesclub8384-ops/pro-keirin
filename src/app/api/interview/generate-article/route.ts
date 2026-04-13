import { NextResponse } from "next/server";
import { generateInterviewArticle } from "@/lib/interview-generator";

export async function POST(req: Request) {
  let body: { requestId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const requestId = Number(body.requestId);
  if (!Number.isFinite(requestId)) {
    return NextResponse.json(
      { error: "requestId가 필요합니다" },
      { status: 400 },
    );
  }

  try {
    const result = await generateInterviewArticle(requestId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
