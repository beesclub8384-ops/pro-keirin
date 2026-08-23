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

const VENUE_RE = /(광명|창원|부산)/g;
// "2026년" — 점 구분 날짜(2026.07.31)는 DOTDATE_RE 가 따로 잡는다
const YEAR_RE = /(\d{4})년/g;
// "16회" 또는 "17회차" — 차 접미사는 선택
const ROUND_RE = /(\d+)회(?:차)?/g;
const DAY_RE = /(\d+)일차/g;
// "07경주" 또는 "06R/6R" — 경주번호 표기 두 가지 모두 지원
const RACE_RE = /(\d+)(?:경주|R)/g;
// "07월 31일" — 연도 없이 월·일만
const MONTHDAY_RE = /(\d{1,2})월\s*(\d{1,2})일/g;
// "(2026.07.31)" / "2026-07-31" — 연·월·일이 한 덩어리로 붙는 표기.
// 이 형식엔 "년/월/일"이 없어 YEAR_RE·MONTHDAY_RE 로는 못 잡는다.
const DOTDATE_RE = /\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})/g;

// 경주번호 토큰 기준 좌우 윈도우 — 한 단락 안에서 토큰 순서가 바뀌어도 잡히도록.
// 40자: "광명 12경주 (우수결승, 2026년 04월 19일 16회 3일차)" 같이 부속어가
// 끼어 늘어나는 케이스까지 포괄.
const WINDOW = 40;

interface Token {
  index: number;
  groups: (string | undefined)[];
}

/**
 * 정규식에 걸리는 모든 위치를 훑는다.
 * 모듈 상수 정규식은 g 플래그 때문에 lastIndex 가 호출 간에 남으므로
 * 매번 새 RegExp 를 만들어 쓴다 (상태 공유 시 두 번째 호출이 조용히 빗나간다).
 */
function scanTokens(re: RegExp, text: string): Token[] {
  const scanner = new RegExp(re.source, re.flags);
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = scanner.exec(text)) !== null) {
    out.push({ index: m.index, groups: m.slice(1) });
    if (m[0].length === 0) scanner.lastIndex += 1; // 무한루프 방지
  }
  return out;
}

/**
 * anchor 에서 WINDOW 안에 있는 토큰 중 "가장 가까운" 것 하나.
 * 윈도우 내 첫 토큰이 아니라 최근접을 고르는 게 핵심 — 한 문장에 경주가 둘이면
 * 두 번째 경주의 윈도우에 첫 번째 경주의 회차/일차가 같이 들어오는데,
 * 첫 매치를 쓰면 두 번째 카드가 첫 번째 경주의 일차를 물고 온다.
 */
function nearest(
  tokens: Token[],
  anchor: number,
  used?: Set<Token>,
): Token | null {
  let best: Token | null = null;
  let bestDist = Infinity;
  for (const t of tokens) {
    if (used?.has(t)) continue;
    const dist = Math.abs(t.index - anchor);
    if (dist <= WINDOW && dist < bestDist) {
      best = t;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 텍스트에서 경주 정보를 전부 감지. 한 단락에 경주가 여러 개면 여러 개를 돌려준다.
 *
 * 매칭 방식: "N경주"(또는 "NR")를 기준점으로 잡고, 그 주변 WINDOW 안에서
 * 장소/회차/일차/날짜의 최근접 토큰을 끌어온다. 토큰 순서는 무관하므로
 * "광명 31회 1일차 11경주" 와 "31회 1일차 광명 04경주" 가 똑같이 잡힌다.
 *
 * - 광명/창원/부산 + N회 + N일차 + N경주 + 연도 필수 (하나라도 없으면 그 경주는 버림)
 * - 연도는 "2026년" 또는 점 구분 날짜(2026.07.31)에서 가져온다
 * - 월/일은 선택 — 창원 URL 빌드에 필요하지만 없으면 외부에서 채움
 *
 * ⚠️ 장소 토큰은 경주 하나가 독점한다. "07경주에서 3경주 연속" 처럼 본문에
 * 숫자+경주 가 섞여 들어와도 남는 장소 토큰이 없어 가짜 경주로 잡히지 않는다.
 * 대신 "광명 31회 1일차 04경주와 05경주" 처럼 장소를 한 번만 쓰고 경주를
 * 두 개 적은 표기는 첫 경주만 잡힌다 (틀린 영상을 거는 것보다 안전한 쪽).
 */
export function extractAllRaceInfo(text: string): RaceInfo[] {
  if (!text) return [];

  const races = scanTokens(RACE_RE, text);
  if (races.length === 0) return [];

  const venues = scanTokens(VENUE_RE, text);
  const rounds = scanTokens(ROUND_RE, text);
  const days = scanTokens(DAY_RE, text);
  const years = scanTokens(YEAR_RE, text);
  const monthDays = scanTokens(MONTHDAY_RE, text);
  const dotDates = scanTokens(DOTDATE_RE, text);

  const usedVenues = new Set<Token>();
  const seen = new Set<string>();
  const out: RaceInfo[] = [];

  for (const race of races) {
    const venue = nearest(venues, race.index, usedVenues);
    if (!venue) continue;
    const round = nearest(rounds, race.index);
    const day = nearest(days, race.index);
    if (!round || !day) continue;

    // 점 구분 날짜가 있으면 연·월·일을 통째로 쓴다. 없으면 "2026년" + "07월 31일".
    const dotDate = nearest(dotDates, race.index);
    const yearRaw = dotDate
      ? dotDate.groups[0]
      : nearest(years, race.index)?.groups[0];
    if (!yearRaw) continue;

    const monthDay = dotDate ? null : nearest(monthDays, race.index);
    const month = dotDate
      ? Number(dotDate.groups[1])
      : monthDay
        ? Number(monthDay.groups[0])
        : null;
    const dayOfMonth = dotDate
      ? Number(dotDate.groups[2])
      : monthDay
        ? Number(monthDay.groups[1])
        : null;

    const info: RaceInfo = {
      year: Number(yearRaw),
      venue: venue.groups[0] as RaceVenue,
      round: Number(round.groups[0]),
      day: Number(day.groups[0]),
      raceNo: Number(race.groups[0]),
      month,
      dayOfMonth,
    };

    usedVenues.add(venue);

    // 같은 경주가 한 단락에서 두 번 언급되면 카드는 하나만
    const key = `${info.venue}-${info.year}-${info.round}-${info.day}-${info.raceNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(info);
  }

  return out;
}

/** 첫 번째 경주만 필요할 때. 여러 경주를 다뤄야 하면 extractAllRaceInfo 를 쓸 것. */
export function extractRaceInfo(text: string): RaceInfo | null {
  return extractAllRaceInfo(text)[0] ?? null;
}

/** 날짜(월·일)가 있어야 URL을 만들 수 있는 경기장 — 자체 VOD 서버 직링크를 쓴다 */
const DATE_REQUIRED_VENUES = new Set<RaceVenue>(["창원", "부산"]);

/** 경기장별 날짜 필요 여부. 호출자가 미리 날짜를 조회해야 하는지 판단할 때 쓴다. */
export function needsRaceDate(venue: RaceVenue): boolean {
  return DATE_REQUIRED_VENUES.has(venue);
}

/**
 * 파싱된 경주 정보를 영상 URL로 빌드.
 * - 광명: kcycle popup URL — variant "F"=전체재생, "M"=유도원 퇴피후. 날짜 불필요
 * - 창원: lepopark VOD URL — 날짜 필수. 파일명 prefix는 variant로만 결정: "F"=f, "M"=s
 *   (요일/일차 무관, kcycle 응답으로 검증)
 * - 부산: 스포원 VOD URL — 날짜 필수. prefix "F"=없음, "M"=m
 *   (2026-08-23 실측: 부산 30회 1일차 02경주(2026-08-21) → 300102.mp4 36MB / m300102.mp4 17MB)
 *
 * 창원·부산은 kcycle popup이 영상을 항상 중계하지 않아 원본 서버로 직접 건다.
 * 날짜는 info의 월/일을 우선 쓰고, 없으면 fallbackDate("YYYY-MM-DD")에서 채운다.
 * 둘 다 없으면 null — 틀린 날짜로 링크를 거는 것보다 링크를 안 거는 편이 안전하다.
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

  if (DATE_REQUIRED_VENUES.has(info.venue)) {
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

    const mm = String(month).padStart(2, "0");
    const dd = String(dayOfMonth).padStart(2, "0");
    const roundPadded = String(info.round).padStart(2, "0");
    const dayPadded = String(info.day).padStart(2, "0");

    if (info.venue === "창원") {
      const prefix = variant === "F" ? "f" : "s";
      return `https://vod.lepopark.or.kr/${info.year}/${mm}-${dd}/${prefix}${roundPadded}${dayPadded}_${raceNoPadded}.mp4`;
    }

    // 부산 — 회차/일차/경주번호가 구분자 없이 붙는다 (창원의 _ 없음)
    const prefix = variant === "F" ? "" : "m";
    return `https://vod.spo1.or.kr/bcr/${info.year}/${info.year}-${mm}-${dd}/${prefix}${roundPadded}${dayPadded}${raceNoPadded}.mp4`;
  }

  return null;
}
