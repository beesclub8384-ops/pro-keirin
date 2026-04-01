/**
 * 7randoms 계획 에이전트
 * 작업 요청을 받아 구현 계획서(CURRENT_TASK.md)를 생성한다.
 *
 * 사용법: node scripts/plan-agent.mjs "작업 설명"
 * 출력: CURRENT_TASK.md
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

// .env.local 로드
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY가 .env.local에 필요합니다.");
  process.exit(1);
}

const taskDescription = process.argv.slice(2).join(" ");
if (!taskDescription) {
  console.error("사용법: node scripts/plan-agent.mjs \"작업 설명\"");
  process.exit(1);
}

// 프로젝트 컨텍스트 수집
function getContext() {
  const claudeMd = existsSync("CLAUDE.md") ? readFileSync("CLAUDE.md", "utf-8") : "";
  const packageJson = existsSync("package.json") ? readFileSync("package.json", "utf-8") : "";
  return { claudeMd, packageJson };
}

const SYSTEM_PROMPT = `당신은 7randoms(pro-keirin) 프로젝트의 시니어 소프트웨어 아키텍트입니다.

프로젝트 스택:
- Next.js 16 + React 19 + TypeScript
- Supabase (PostgreSQL), Vercel 배포
- shadcn/ui + Tailwind CSS

핵심 규칙:
1. Supabase는 1,000행 페이지네이션 제한 → 전체 조회 시 루프 필수
2. kcycle 스크래핑 시 회차/일차 검증 필수 (없는 회차 → 최근 데이터 반환 함정)
3. 동적 라우트 params: 서버=await params, 클라이언트=use(params), useParams() 사용 금지
4. Vercel Cron은 반드시 GET 메서드
5. scripts/ 파일 삭제 금지

계획서 작성 시:
- 구체적인 파일 경로와 변경 내용 명시
- 예상 위험 요소와 실수 가능 지점 반드시 포함
- 무음 실패(Silent Failure) 가능성 점검
- 완료 기준을 검증 가능한 형태로 작성`;

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 호출 실패 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function main() {
  console.log("📋 계획 에이전트 시작");
  console.log(`작업: ${taskDescription}\n`);

  const { claudeMd, packageJson } = getContext();

  const prompt = `아래 작업에 대한 구현 계획서를 작성해주세요.

## 작업 요청
${taskDescription}

## 프로젝트 지침 (CLAUDE.md)
${claudeMd}

## package.json
${packageJson}

---

아래 형식으로 계획서를 작성해주세요:

# CURRENT_TASK: [작업 제목]

## 작업 목표
[한 문장으로 명확하게]

## 구현 단계
1. [단계 1 - 구체적 파일 경로 포함]
2. [단계 2]
...

## 변경될 파일 목록
- [ ] 파일1.ts — 변경 내용
- [ ] 파일2.tsx — 변경 내용

## 완료 기준
- [ ] 기준 1 (검증 가능한 형태)
- [ ] 기준 2

## 예상 위험 요소
- 위험 1: 설명 → 대응 방안
- 위험 2: 설명 → 대응 방안

## 실수할 수 있는 부분
- 주의 1
- 주의 2

## 상태
- [ ] 계획 승인 대기
- [ ] 구현 중
- [ ] 타입 확인 (tsc)
- [ ] 린트 확인
- [ ] 빌드 확인
- [ ] 리뷰 완료
- [ ] 평가 완료`;

  const result = await callClaude(prompt);

  writeFileSync("CURRENT_TASK.md", result, "utf-8");
  console.log("✅ CURRENT_TASK.md 생성 완료");
  console.log("\n--- 미리보기 (첫 20줄) ---");
  console.log(result.split("\n").slice(0, 20).join("\n"));
}

main().catch((e) => {
  console.error("❌ 에러:", e.message);
  process.exit(1);
});
