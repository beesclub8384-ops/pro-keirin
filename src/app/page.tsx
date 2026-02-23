import HeroSection from "@/components/HeroSection";
import UpcomingRaces from "@/components/UpcomingRaces";
import LatestNews from "@/components/LatestNews";
import PopularPlayers from "@/components/PopularPlayers";
import CommunityPreview from "@/components/CommunityPreview";
import SnsSection from "@/components/SnsSection";

export default function Home() {
  return (
    <>
      {/* 섹션 1: 히어로 배너 - 메인 이미지 슬라이드 */}
      <HeroSection />

      {/* 섹션 2: 다가오는 경주 일정 */}
      <UpcomingRaces />

      {/* 섹션 3: 최신 소식 */}
      <LatestNews />

      {/* 섹션 4: 인기 선수 하이라이트 */}
      <PopularPlayers />

      {/* 섹션 5: 커뮤니티 최신 글 */}
      <CommunityPreview />

      {/* 섹션 6: SNS 연동 */}
      <SnsSection />
    </>
  );
}
