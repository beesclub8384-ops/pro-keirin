// 경주 영상(VOD) URL 생성
// 3개 경기장 직링크 패턴 (2026-05 확인, Range 요청 시 외부 직접 접근 가능):
//   광명 https://cast.kcycle.or.kr/vod/pds/{Y}/{M}/{D}/m{RR}{DD}{NN}.mp4
//        (경로의 M·D = 경주일 월·일, 0패딩 없음)
//   창원 https://vod.lepopark.or.kr/{Y}/{MM-DD}/s{RR}{DD}_{NN}.mp4
//   부산 https://vod.spo1.or.kr/bcr/{Y}/{YYYY-MM-DD}/m{RR}{DD}{NN}.mp4
// 공통: RR=회차 2자리, DD=일차 2자리, NN=경주번호 2자리
//   date = 경주일(YYYY-MM-DD) → 경로의 연/월/일, day = 일차(회차 내 순번)

const VENUES = new Set(["광명", "창원", "부산"]);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 경주 영상 URL. 생성 불가(미지원 경기장/회차 비정형/날짜 누락) 시 null.
 */
export function getVideoUrl(
  venue: string | null | undefined,
  _year: number | null | undefined,
  round: string | number | null | undefined,
  day: number | null | undefined,
  raceNo: number | null | undefined,
  date: string | null | undefined,
): string | null {
  if (!venue || !VENUES.has(venue)) return null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (day == null || raceNo == null) return null;

  // round 는 text 컬럼(예외 "18A" 등) → 정수만 영상 파일명에 사용 가능
  const rr = parseInt(String(round ?? ""), 10);
  if (!Number.isFinite(rr)) return null;

  const [y, m, d] = date.split("-"); // YYYY, MM, DD (0패딩)
  const RR = pad2(rr);
  const DD = pad2(day);
  const NN = pad2(raceNo);

  switch (venue) {
    case "광명": {
      // 경로 월/일은 0패딩 없음
      const mNoPad = String(parseInt(m, 10));
      const dNoPad = String(parseInt(d, 10));
      return `https://cast.kcycle.or.kr/vod/pds/${y}/${mNoPad}/${dNoPad}/m${RR}${DD}${NN}.mp4`;
    }
    case "창원":
      return `https://vod.lepopark.or.kr/${y}/${m}-${d}/s${RR}${DD}_${NN}.mp4`;
    case "부산":
      return `https://vod.spo1.or.kr/bcr/${y}/${y}-${m}-${d}/m${RR}${DD}${NN}.mp4`;
    default:
      return null;
  }
}
