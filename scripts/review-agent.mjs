/**
 * 7randoms 코드 리뷰 에이전트
 * 최근 커밋의 변경 사항을 리뷰하고 review-result.md를 생성한다.
 *
 * 사용법: node scripts/review-agent.mjs [커밋수=1]
 * 출력: review-result.md
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

const SYSTEM_PROMPT = `당신은 7randoms(pro-keirin) 프로젝트의 시니어 코드 리뷰어입니다.

프로젝트 스택: Next.js 16 + React 19 + TypeScript + Supabase + Vercel

리뷰 시 반드시 확인할 항목:
1. Supabase 1,000행 페이지네이션 제한 위반 여부
2. kcycle 응답 검증 누락 여부
3. 동적 라우트 params 처리: use(params) 사용 여부 (useParams 사용 시 지적)
4. Vercel Cron 핸들러가 GET인지 확인
5. 환경변수 하드코딩 여부
6. SUPABASE_SERVICE_ROLE_KEY 클라이언트 노출 여부
7. 무음 실패(Silent Failure) 가능성
8. TypeScript 타입 안전성
9. SQL 인젝션 등 보안 취약점
10. 불필요한 코드, 중복, 개선 가능 사항

리뷰 결과는 한국어로 작성하되, 코드 예시는 영어 그대로 유지.
심각도: 🔴 Critical / 🟡 Warning / 🟢 Info`;

function getGitDiff(n) {
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
  console.log(`🔍 코드 리뷰 에이전트 시작 (최근 ${commitCount}개 커밋)`);

  const { log, diff, stat } = getGitDiff(commitCount);

  if (!diff) {
    console.log("변경 사항이 없습니다.");
    return;
  }

  console.log(`커밋:\n${log}\n`);
  console.log(`변경 파일:\n${stat}\n`);

  const claudeMd = existsSync("CLAUDE.md") ? readFileSync("CLAUDE.md", "utf-8") : "";

  const prompt = `아래 코드 변경 사항을 리뷰해주세요.

## 커밋 로그
${log}

## 변경 통계
${stat}

## Diff (최대 30KB)
\`\`\`diff
${diff}
\`\`\`

## 프로젝트 지침 (CLAUDE.md)
${claudeMd}

---

아래 형식으로 리뷰 결과를 작성해주세요:

# 코드 리뷰 결과

## 요약
[전체 변경 사항 한줄 요약]

## 발견된 이슈

### 🔴 Critical
[있으면 작성, 없으면 "없음"]

### 🟡 Warning
[있으면 작성]

### 🟢 Info / 개선 제안
[있으면 작성]

## 7randoms 규칙 준수 여부
- [ ] Supabase 페이지네이션: 준수/위반
- [ ] kcycle 검증: 해당없음/준수/위반
- [ ] params 처리: 해당없음/준수/위반
- [ ] 환경변수 안전성: 준수/위반
- [ ] 무음 실패 점검: 완료/미완료

## 총평
[한 문단 총평]`;

  const result = await callClaude(prompt);

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const filename = `review-result.md`;
  writeFileSync(filename, `<!-- 리뷰 시각: ${timestamp} -->\n${result}`, "utf-8");
  console.log(`✅ ${filename} 생성 완료`);
}

main().catch((e) => {
  console.error("❌ 에러:", e.message);
  process.exit(1);
});
