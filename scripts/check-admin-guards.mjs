#!/usr/bin/env node
/**
 * 관리자 API 라우트에 인증 가드가 빠졌는지 검사한다.
 *
 * 이 앱에는 middleware.ts 가 없다. 그래서 admin 라우트는 각자 최상단에서
 * verifyAdmin() / verifyAdminAuth() 를 부르거나 withAdmin() 으로 감싸야 한다.
 * 한 줄 빼먹으면 그 라우트는 조용히 공개된다 — 에러도, 빌드 실패도 없다.
 * 그 무음 실패를 CI 단계에서 잡는 것이 이 스크립트의 목적이다.
 *
 * 검사 대상: src/app/api/ 밑에서 경로에 'admin' 세그먼트가 있는 route.ts
 * 통과 조건: withAdmin | verifyAdmin | verifyAdminAuth 중 하나라도 등장
 * 예외 선언: 파일 상단 400자 안에 `// admin-guard: public` 주석
 *
 * 실행: node scripts/check-admin-guards.mjs   (npm run check:guards)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API_ROOT = join(process.cwd(), "src", "app", "api");
const GUARDS = ["withAdmin", "verifyAdmin", "verifyAdminAuth"];
const EXEMPT_MARKER = "admin-guard: public";

/** route.ts 전부 찾기 */
function findRoutes(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...findRoutes(full));
    } else if (name === "route.ts" || name === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

// 경로에 admin 세그먼트가 있는지.
// "api/admin/..." 과 "api/<무엇이든>/admin/..." 을 모두 잡는다.
function isAdminRoute(file) {
  const rel = relative(API_ROOT, file);
  return rel.split(sep).some((seg) => seg.toLowerCase() === "admin");
}

const routes = findRoutes(API_ROOT).filter(isAdminRoute);
const unguarded = [];
const exempt = [];

for (const file of routes) {
  const src = readFileSync(file, "utf-8");
  if (src.slice(0, 400).includes(EXEMPT_MARKER)) {
    exempt.push(file);
    continue;
  }
  if (!GUARDS.some((g) => src.includes(g))) {
    unguarded.push(file);
  }
}

const rel = (f) => relative(process.cwd(), f).split(sep).join("/");

console.log(`[check-admin-guards] admin 라우트 ${routes.length}개 검사`);
if (exempt.length > 0) {
  console.log(`  의도적 공개 선언 ${exempt.length}개:`);
  for (const f of exempt) console.log(`    - ${rel(f)}`);
}

if (unguarded.length > 0) {
  console.error("");
  console.error("❌ 인증 가드가 없는 관리자 라우트가 있습니다:");
  for (const f of unguarded) console.error(`    - ${rel(f)}`);
  console.error("");
  console.error("  해결 방법 중 하나를 고르세요:");
  console.error("    1) withAdmin() 으로 감싸기 (권장)");
  console.error("         import { withAdmin } from '@/lib/auth/with-admin';");
  console.error("         export const GET = withAdmin(async (req) => { ... });");
  console.error("    2) 핸들러 최상단에서 verifyAdmin() 직접 호출");
  console.error("    3) 정말 공개가 맞다면 파일 상단에 `// admin-guard: public` 선언");
  process.exit(1);
}

console.log("✅ 모든 관리자 라우트에 인증 가드가 있습니다");
