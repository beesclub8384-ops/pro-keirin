export interface RaceVideoInfo {
  year: number;
  venue: "광명" | "창원" | "부산";
  round: number;
  day: number;
  raceNo: number;
  url: string;
}

const VENUE_CODE: Record<string, string | null> = {
  "광명": "001",
  "창원": null,
  "부산": null,
};

const PATTERN = /(\d{4})년\s*(광명|창원|부산)\s*(\d+)회\s*(\d+)일차\s*(\d+)경주/;

export function extractRaceVideo(text: string): RaceVideoInfo | null {
  if (!text) return null;
  const m = text.match(PATTERN);
  if (!m) return null;

  const year = parseInt(m[1], 10);
  const venue = m[2] as "광명" | "창원" | "부산";
  const round = parseInt(m[3], 10);
  const day = parseInt(m[4], 10);
  const raceNo = parseInt(m[5], 10);

  const code = VENUE_CODE[venue];
  if (!code) return null;

  const raceNoPadded = String(raceNo).padStart(2, "0");
  const url = `https://www.kcycle.or.kr/broadcast/popup/race/${year}/${round}/${day}/${code}/${raceNoPadded}/F`;

  return { year, venue, round, day, raceNo, url };
}
