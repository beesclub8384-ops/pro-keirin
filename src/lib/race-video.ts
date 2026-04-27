export interface RaceVideoInfo {
  year: number;
  venue: "광명" | "창원" | "부산";
  round: number;
  day: number;
  raceNo: number;
  url: string;
}

// 창원 VOD 파일명의 요일 접두사 — 금=f, 토/일=s. 토/일이 같은 's'이므로
// 파일명 안의 일차(DD) 숫자로만 구분된다.
const CHANGWON_DAY_LETTER: Record<number, string> = {
  1: "f",
  2: "s",
  3: "s",
};

// 광명: "2026년 광명 17회 3일차 6경주" — 날짜 불필요
// 창원: "2026년 4월 26일 창원 17회 3일차 6경주" — VOD URL이 날짜 기반이라 필수
const PATTERN =
  /(\d{4})년\s*(?:(\d{1,2})월\s*(\d{1,2})일\s*)?(광명|창원|부산)\s*(\d+)회\s*(\d+)일차\s*(\d+)경주/;

export function extractRaceVideo(text: string): RaceVideoInfo | null {
  if (!text) return null;
  const m = text.match(PATTERN);
  if (!m) return null;

  const year = parseInt(m[1], 10);
  const month = m[2] ? parseInt(m[2], 10) : null;
  const dayOfMonth = m[3] ? parseInt(m[3], 10) : null;
  const venue = m[4] as "광명" | "창원" | "부산";
  const round = parseInt(m[5], 10);
  const day = parseInt(m[6], 10);
  const raceNo = parseInt(m[7], 10);

  const raceNoPadded = String(raceNo).padStart(2, "0");

  if (venue === "광명") {
    const url = `https://www.kcycle.or.kr/broadcast/popup/race/${year}/${round}/${day}/001/${raceNoPadded}/F`;
    return { year, venue, round, day, raceNo, url };
  }

  if (venue === "창원") {
    if (month === null || dayOfMonth === null) return null;
    const dayLetter = CHANGWON_DAY_LETTER[day];
    if (!dayLetter) return null;
    const mm = String(month).padStart(2, "0");
    const dd = String(dayOfMonth).padStart(2, "0");
    const roundPadded = String(round).padStart(2, "0");
    const dayPadded = String(day).padStart(2, "0");
    const url = `https://vod.lepopark.or.kr/${year}/${mm}-${dd}/${dayLetter}${roundPadded}${dayPadded}_${raceNoPadded}.mp4`;
    return { year, venue, round, day, raceNo, url };
  }

  // 부산: 미지원
  return null;
}
