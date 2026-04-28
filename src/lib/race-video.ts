export type RaceVenue = "광명" | "창원" | "부산";

export interface RaceInfo {
  year: number;
  venue: RaceVenue;
  round: number;
  day: number;
  raceNo: number;
  /** 본문에서 캡처된 월 — 없으면 null (창원 URL 빌드 시 외부 보충 필요) */
  month: number | null;
  /** 본문에서 캡처된 일 — 없으면 null */
  dayOfMonth: number | null;
}

export interface RaceVideoInfo extends RaceInfo {
  url: string;
}

const VENUE_RE = /(광명|창원|부산)/;
const YEAR_RE = /(\d{4})년/;
// "16회" 또는 "17회차" — 차 접미사는 선택
const ROUND_RE = /(\d+)회(?:차)?/;
const DAY_RE = /(\d+)일차/;
// "07경주" 또는 "06R/6R" — 경주번호 표기 두 가지 모두 지원
const RACE_RE = /(\d+)(?:경주|R)/;
const DATE_RE = /(\d{1,2})월\s*(\d{1,2})일/;

// venue 토큰 좌우 윈도우 — 한 단락 안에서 토큰 순서가 바뀌어도 잡히도록.
// 40자: "광명 12경주 (우수결승, 2026년 04월 19일 16회 3일차)" 같이 부속어가
// 끼어 늘어나는 케이스까지 포괄.
const WINDOW = 40;

/**
 * 텍스트에서 경주 정보를 감지. 순서 무관, venue 좌우 WINDOW자 안에 모든 요소가 있으면 매칭.
 * - 광명/창원/부산 + N회 + N일차 + N경주 필수
 * - "M월 D일"은 선택 — 창원 URL 빌드에 필요하지만 없으면 외부에서 채움
 */
export function extractRaceInfo(text: string): RaceInfo | null {
  if (!text) return null;
  const venueMatch = VENUE_RE.exec(text);
  if (!venueMatch) return null;

  const venueIdx = venueMatch.index;
  const venueLen = venueMatch[0].length;
  const start = Math.max(0, venueIdx - WINDOW);
  const end = Math.min(text.length, venueIdx + venueLen + WINDOW);
  const window = text.slice(start, end);

  const yearM = YEAR_RE.exec(window);
  const roundM = ROUND_RE.exec(window);
  const dayM = DAY_RE.exec(window);
  const raceM = RACE_RE.exec(window);
  if (!yearM || !roundM || !dayM || !raceM) return null;

  const dateM = DATE_RE.exec(window);

  return {
    year: parseInt(yearM[1], 10),
    venue: venueMatch[1] as RaceVenue,
    round: parseInt(roundM[1], 10),
    day: parseInt(dayM[1], 10),
    raceNo: parseInt(raceM[1], 10),
    month: dateM ? parseInt(dateM[1], 10) : null,
    dayOfMonth: dateM ? parseInt(dateM[2], 10) : null,
  };
}

/**
 * 파싱된 경주 정보를 영상 URL로 빌드.
 * - 광명: kcycle popup URL — variant "F"=전체재생, "M"=유도원 퇴피후. 날짜 불필요
 * - 창원: lepopark VOD URL — 날짜 필수. info에 월/일이 없으면 fallbackDate("YYYY-MM-DD") 에서 채움.
 *   파일명 prefix는 variant로만 결정: "F"=f, "M"=s (요일/일차 무관, kcycle 응답으로 검증).
 * - 부산: 미지원 (null)
 */
export function buildRaceVideoUrl(
  info: RaceInfo,
  fallbackDate?: string | null,
  variant: "F" | "M" = "F",
): string | null {
  const raceNoPadded = String(info.raceNo).padStart(2, "0");

  if (info.venue === "광명") {
    return `https://www.kcycle.or.kr/broadcast/popup/race/${info.year}/${info.round}/${info.day}/001/${raceNoPadded}/${variant}`;
  }

  if (info.venue === "창원") {
    let month = info.month;
    let dayOfMonth = info.dayOfMonth;
    if ((month === null || dayOfMonth === null) && fallbackDate) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fallbackDate);
      if (m) {
        month = parseInt(m[2], 10);
        dayOfMonth = parseInt(m[3], 10);
      }
    }
    if (month === null || dayOfMonth === null) return null;
    const prefix = variant === "F" ? "f" : "s";
    const mm = String(month).padStart(2, "0");
    const dd = String(dayOfMonth).padStart(2, "0");
    const roundPadded = String(info.round).padStart(2, "0");
    const dayPadded = String(info.day).padStart(2, "0");
    return `https://vod.lepopark.or.kr/${info.year}/${mm}-${dd}/${prefix}${roundPadded}${dayPadded}_${raceNoPadded}.mp4`;
  }

  return null;
}
