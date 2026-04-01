/**
 * 7randoms 모니터 에이전트
 * 최근 N개 커밋의 누적 패턴을 분석하고 monitor-result.md를 생성한다.
 *
 * 사용법: node scripts/monitor-agent.mjs [커밋수=10]
 * 출력: monitor-result.md
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

const commitCount = parseInt(process.argv[2] || "10", 10);

const SYSTEM_PROMPT = `당신은 7randoms(pro-keirin) 프로젝트의 기술 부채 및 패턴 분석 전문가입니다.

프로젝트 스택: Next.js 16 + React 19 + TypeScript + Supabase + Vercel

분석 관점:
1. 반복되는 버그 패턴 (같은 종류의 fix가 반복되는가)
2. 기술 부채 축적 (TODO, 임시 코드, 하드코딩)
3. 코드 품질 추세 (개선되고 있는가, 악화되고 있는가)
4. 아키텍처 일관성 (패턴이 통일되어 있는가)
5. 테스트 커버리지 부족 영역
6. 보안 및 성능 위험 누적

결과는 한국어로 작성하되, 실행 가능한 개선 제안을 우선순위와 함께 제공.`;

function getGitHistory(n) {
  try {
    const log = execSync(`git log --oneline -${n}`, { encoding: "utf-8" }).trim();
    const stat = execSync(`git diff --stat HEAD~${n}..HEAD`, { encoding: "utf-8" });
    const diffSummary = execSync(`git log --stat -${n}`, { encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 });
    // 파일별 변경 빈도
    const fileChanges = execSync(
      `git log --name-only --pretty=format: -${n} | sort | uniq -c | sort -rn | head -20`,
      { encoding: "utf-8" }
    );
    return {
      log,
      stat,
      diffSummary: diffSummary.substring(0, 15000),
      fileChanges,
    };
  } catch {
    return { log: "", stat: "", diffSummary: "", fileChanges: "" };
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
  console.log(`📈 모니터 에이전트 시작 (최근 ${commitCount}개 커밋 분석)`);

  const { log, stat, diffSummary, fileChanges } = getGitHistory(commitCount);

  if (!log) {
    console.log("커밋 이력이 없습니다.");
    return;
  }

  console.log(`\n커밋 이력:\n${log}\n`);

  const claudeMd = existsSync("CLAUDE.md") ? readFileSync("CLAUDE.md", "utf-8") : "";

  // 이전 모니터 결과가 있으면 참고
  const prevMonitor = existsSync("monitor-result.md") ? readFileSync("monitor-result.md", "utf-8") : "";

  const prompt = `아래 최근 ${commitCount}개 커밋의 누적 패턴을 분석해주세요.

## 커밋 로그 (최근 ${commitCount}개)
${log}

## 전체 변경 통계
${stat}

## 커밋별 변경 상세 (최대 15KB)
${diffSummary}

## 자주 변경된 파일 TOP 20
${fileChanges}

## 이전 모니터 결과
${prevMonitor || "(첫 분석)"}

## 프로젝트 지침 (CLAUDE.md)
${claudeMd}

---

아래 형식으로 분석 결과를 작성해주세요:

# 누적 패턴 분석 결과

## 분석 기간
최근 ${commitCount}개 커밋 분석

## 커밋 패턴 요약
| 유형 | 건수 | 비율 |
|------|------|------|
| feat | ? | ?% |
| fix | ? | ?% |
| refactor | ? | ?% |
| docs | ? | ?% |
| etc | ? | ?% |

## 반복되는 패턴
### 긍정적 패턴
- 패턴 1: 설명
- 패턴 2: 설명

### 부정적 패턴 (개선 필요)
- 패턴 1: 설명 → 개선 제안
- 패턴 2: 설명 → 개선 제안

## 핫스팟 파일 (자주 변경되는 파일)
[자주 변경되는 파일 = 잠재적 리팩토링 대상]

## 기술 부채 현황
- 누적된 부채 1
- 누적된 부채 2

## 우선순위별 개선 제안
### P0 (즉시)
- 제안 1

### P1 (이번 주)
- 제안 1

### P2 (이번 달)
- 제안 1

## 이전 분석 대비 변화
[이전 모니터 결과와 비교하여 개선/악화 여부]`;

  const result = await callClaude(prompt);

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  writeFileSync("monitor-result.md", `<!-- 분석 시각: ${timestamp} -->\n${result}`, "utf-8");
  console.log("✅ monitor-result.md 생성 완료");
}

main().catch((e) => {
  console.error("❌ 에러:", e.message);
  process.exit(1);
});
