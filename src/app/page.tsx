import HeroSection from "@/components/HeroSection";
import UpcomingRaces from "@/components/UpcomingRaces";
import LatestNews from "@/components/LatestNews";
import PopularPlayers from "@/components/PopularPlayers";
import CommunityPreview from "@/components/CommunityPreview";

export default function Home() {
  return (
    <>
      {/* 섹션 1: 데이터 대시보드 히어로 */}
      <HeroSection />

      {/* 섹션 2: 다가오는 경주 */}
      <UpcomingRaces />

      {/* 섹션 3: 최신 분석 리포트 */}
      <LatestNews />

      {/* 섹션 4: 선수 성적 트렌드 */}
      <PopularPlayers />

      {/* 섹션 5: 커뮤니티 */}
      <CommunityPreview />
    </>
  );
}
