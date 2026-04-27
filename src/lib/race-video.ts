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

// 창원 VOD 파일명의 요일 접두사 — 금=f, 토/일=s. 토/일이 같은 's'이므로
// 파일명 안의 일차(DD) 숫자로만 구분된다.
const CHANGWON_DAY_LETTER: Record<number, string> = {
  1: "f",
  2: "s",
  3: "s",
};

const VENUE_RE = /(광명|창원|부산)/;
const YEAR_RE = /(\d{4})년/;
const ROUND_RE = /(\d+)회/;
const DAY_RE = /(\d+)일차/;
const RACE_RE = /(\d+)경주/;
const DATE_RE = /(\d{1,2})월\s*(\d{1,2})일/;

// venue 토큰 좌우 윈도우 — 한 단락 안에서 토큰 순서가 바뀌어도 잡히도록.
const WINDOW = 30;

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
 * - 광명: kcycle popup URL — 날짜 불필요
 * - 창원: lepopark VOD URL — 날짜 필수. info에 월/일이 없으면 fallbackDate("YYYY-MM-DD") 에서 채움
 * - 부산: 미지원 (null)
 */
export function buildRaceVideoUrl(
  info: RaceInfo,
  fallbackDate?: string | null,
): string | null {
  const raceNoPadded = String(info.raceNo).padStart(2, "0");

  if (info.venue === "광명") {
    return `https://www.kcycle.or.kr/broadcast/popup/race/${info.year}/${info.round}/${info.day}/001/${raceNoPadded}/F`;
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
    const dayLetter = CHANGWON_DAY_LETTER[info.day];
    if (!dayLetter) return null;
    const mm = String(month).padStart(2, "0");
    const dd = String(dayOfMonth).padStart(2, "0");
    const roundPadded = String(info.round).padStart(2, "0");
    const dayPadded = String(info.day).padStart(2, "0");
    return `https://vod.lepopark.or.kr/${info.year}/${mm}-${dd}/${dayLetter}${roundPadded}${dayPadded}_${raceNoPadded}.mp4`;
  }

  return null;
}
