import type { Metadata } from "next";
import { UnionBattleClient } from "./_components/UnionBattleClient";

export const metadata: Metadata = {
  title: "진영 대결 · 프로연합 vs 노동자연합 | 7randoms",
  description:
    "광명·창원·부산 3개 경기장 2023~2025 프로연합(PKRU) vs 노동자연합 등급별 맞대결 승률·결승 성적 통계.",
};

// 데이터는 클라이언트에서 /api/data/union-battle (1시간 캐시) 로 로드 —
// 빌드 시점 DB 의존 제거 (racer-search/union-stats 와 동일 패턴).
export default function UnionBattlePage() {
  return <UnionBattleClient />;
}
