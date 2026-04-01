/**
 * 7randoms 품질 평가 에이전트
 * 코드 변경의 품질을 점수로 평가하고 eval-result.md를 생성한다.
 *
 * 사용법: node scripts/eval-agent.mjs [커밋수=1]
 * 출력: eval-result.md
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
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

const commitCount = parseInt(process.argv[2] || "1", 10);

const SYSTEM_PROMPT = `당신은 7randoms(pro-keirin) 프로젝트의 품질 평가 전문가입니다.

프로젝트 스택: Next.js 16 + React 19 + TypeScript + Supabase + Vercel

평가 기준 (각 항목 10점 만점):
1. 정확성: 요구사항을 정확히 구현했는가
2. 안전성: 무음 실패, 보안 취약점, 데이터 손실 위험이 없는가
3. 유지보수성: 코드가 읽기 쉽고, 향후 수정이 용이한가
4. 프로젝트 규칙 준수: CLAUDE.md 지침을 따랐는가
5. 테스트 가능성: 결과를 검증할 수 있는 방법이 있는가

총점 = 5개 항목 평균 (10점 만점)
- 9~10: 우수
- 7~8: 양호
- 5~6: 개선 필요
- 4 이하: 재작업 필요

반드시 JSON 형태의 점수와 함께 한국어 설명을 제공할 것.`;

function getGitInfo(n) {
  try {
    const log = execSync(`git log --oneline -${n}`, { encoding: "utf-8" }).trim();
    const diff = execSync(`git diff HEAD~${n}..HEAD`, { encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 });
    const stat = execSync(`git diff --stat HEAD~${n}..HEAD`, { encoding: "utf-8" });
    return { log, diff: diff.substring(0, 30000), stat };
  } catch {
    return { log: "", diff: "", stat: "" };
  }
}

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
  console.log(`📊 품질 평가 에이전트 시작 (최근 ${commitCount}개 커밋)`);

  const { log, diff, stat } = getGitInfo(commitCount);

  if (!diff) {
    console.log("변경 사항이 없습니다.");
    return;
  }

  const claudeMd = existsSync("CLAUDE.md") ? readFileSync("CLAUDE.md", "utf-8") : "";
  const reviewMd = existsSync("review-result.md") ? readFileSync("review-result.md", "utf-8") : "";
  const taskMd = existsSync("CURRENT_TASK.md") ? readFileSync("CURRENT_TASK.md", "utf-8") : "";

  const prompt = `아래 코드 변경의 품질을 평가해주세요.

## 커밋 로그
${log}

## 변경 통계
${stat}

## Diff (최대 30KB)
\`\`\`diff
${diff}
\`\`\`

## 작업 계획서 (CURRENT_TASK.md)
${taskMd || "(없음)"}

## 코드 리뷰 결과 (review-result.md)
${reviewMd || "(없음)"}

## 프로젝트 지침 (CLAUDE.md)
${claudeMd}

---

아래 형식으로 평가 결과를 작성해주세요:

# 품질 평가 결과

## 점수

| 항목 | 점수 (10점) | 근거 |
|------|-----------|------|
| 정확성 | ? | 설명 |
| 안전성 | ? | 설명 |
| 유지보수성 | ? | 설명 |
| 규칙 준수 | ? | 설명 |
| 테스트 가능성 | ? | 설명 |
| **총점** | **?** | |

## 잘한 점
- 항목 1
- 항목 2

## 개선이 필요한 점
- 항목 1 → 제안
- 항목 2 → 제안

## 다음 작업 시 주의사항
- 주의 1
- 주의 2

## 판정
[우수 / 양호 / 개선 필요 / 재작업 필요]`;

  const result = await callClaude(prompt);

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  writeFileSync("eval-result.md", `<!-- 평가 시각: ${timestamp} -->\n${result}`, "utf-8");
  console.log("✅ eval-result.md 생성 완료");

  // 점수 추출 시도
  const totalMatch = result.match(/\*\*총점\*\*\s*\|\s*\*\*(\d+(?:\.\d+)?)\*\*/);
  if (totalMatch) {
    const score = parseFloat(totalMatch[1]);
    console.log(`\n📊 총점: ${score}/10 ${score >= 9 ? "🟢 우수" : score >= 7 ? "🟡 양호" : score >= 5 ? "🟠 개선 필요" : "🔴 재작업 필요"}`);
  }
}

main().catch((e) => {
  console.error("❌ 에러:", e.message);
  process.exit(1);
});
