import { NextResponse } from "next/server";
import {
  selectQuestionsForPlayer,
  type RequestType,
} from "@/lib/interview-question-selector";

export async function POST(req: Request) {
  let body: { playerName?: string; requestType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const playerName = (body.playerName ?? "").trim();
  if (!playerName) {
    return NextResponse.json(
      { error: "playerName이 필요합니다" },
      { status: 400 },
    );
  }
  const allowed: RequestType[] = ["regular", "rookie", "event", "special"];
  const requestType = (body.requestType as RequestType) ?? "regular";
  if (!allowed.includes(requestType)) {
    return NextResponse.json(
      { error: `requestType은 ${allowed.join(", ")} 중 하나여야 합니다` },
      { status: 400 },
    );
  }

  try {
    const result = await selectQuestionsForPlayer(playerName, requestType);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
