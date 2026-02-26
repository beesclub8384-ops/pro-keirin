// ============================================================
// 경륜 경주결과 API 클라이언트
// data.go.kr "경륜-경주결과_GW" (서비스 ID: 15107816)
// ============================================================

const API_BASE =
  "https://apis.data.go.kr/B551014/SRVC_TODZ_CRA_RACE_RESULT/TODZ_API_CRA_RACE_RESULT";

/** API 원본 응답의 개별 경주 결과 */
export interface ApiRaceResult {
  race_ymd: string;   // 경주일자 (MMDD 형식, 예: "0105")
  meet_nm: string;    // 경륜장명 (광명, 부산, 창원)
  race_no: string;    // 경주번호
  stnd_yr: string;    // 기준년도
  rank1: string;      // 1착 (예: "①김영석")
  rank2: string;      // 2착
  rank3: string;      // 3착
  pool1_val: string;  // 단승 배당 (예: "(1)1.4")
  pool2_val: string;  // 연승 배당 (예: "(1)1.1 (3)6.0")
  pool4_val: string;  // 쌍승 배당 (예: "(1-3)19.3")
  pool5_val: string;  // 복승 배당 (예: "(1-3)14.3")
  pool8_val: string;  // 삼쌍승 배당 (예: "(1-3-2)142.5")
  week_tcnt: number;  // 주차
  day_tcnt: number;   // 일차
}

/** API 전체 응답 구조 */
interface ApiResponse {
  response: {
    header: {
      resultCode: string;
      resultMsg: string;
    };
    body: {
      items: {
        item: ApiRaceResult | ApiRaceResult[];
      };
      totalCount: number;
      pageNo: number;
      numOfRows: number;
    };
  };
}

export interface FetchPageParams {
  serviceKey: string;
  stnd_yr: string;
  pageNo: number;
  numOfRows: number;
}

export interface FetchPageResult {
  items: ApiRaceResult[];
  totalCount: number;
}

/**
 * 경륜 경주결과 API를 페이지 단위로 호출합니다.
 */
export async function fetchRaceResultsPage(
  params: FetchPageParams
): Promise<FetchPageResult> {
  const url = new URL(API_BASE);
  url.searchParams.set("serviceKey", params.serviceKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("stnd_yr", params.stnd_yr);
  url.searchParams.set("pageNo", String(params.pageNo));
  url.searchParams.set("numOfRows", String(params.numOfRows));

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const data: ApiResponse = await res.json();

  if (data.response.header.resultCode !== "00") {
    return { items: [], totalCount: 0 };
  }

  const items = data.response.body?.items?.item;
  if (!items) return { items: [], totalCount: data.response.body.totalCount };

  const arr = Array.isArray(items) ? items : [items];
  return { items: arr, totalCount: data.response.body.totalCount };
}
