// 경륜 경기규칙 조항 설명 상수
// DB에 존재하는 조항 기준 (article, paragraph, clause)

export interface ArticleInfo {
  article: string;
  paragraph: string;
  clause: string;
  label: string; // 조항 표기 (예: "72조 2호")
  description: string; // 조항 설명
}

export const VIOLATION_ARTICLES: ArticleInfo[] = [
  // 64조 (출발)
  { article: "64", paragraph: "1", clause: "2", label: "64조 1항 2호", description: "출발 위반" },

  // 72조 (주행의무)
  { article: "72", paragraph: "-", clause: "2", label: "72조 2호", description: "전력질주의무 위반" },
  { article: "72", paragraph: "-", clause: "3", label: "72조 3호", description: "유도의무 위반" },
  { article: "72", paragraph: "-", clause: "4", label: "72조 4호", description: "내측주행의무 위반" },

  // 73조 (주행금지)
  { article: "73", paragraph: "1", clause: "-", label: "73조 1항", description: "사행주행금지 위반" },
  { article: "73", paragraph: "2", clause: "-", label: "73조 2항", description: "급감속금지 위반" },
  { article: "73", paragraph: "3", clause: "-", label: "73조 3항", description: "과도한 견제금지 위반" },
  { article: "73", paragraph: "4", clause: "-", label: "73조 4항", description: "위험행위금지 위반" },

  // 74조 (주행방해금지)
  { article: "74", paragraph: "1", clause: "-", label: "74조 1항", description: "진로방해금지 위반" },
  { article: "74", paragraph: "2", clause: "-", label: "74조 2항", description: "주행방해금지 위반" },
  { article: "74", paragraph: "3", clause: "-", label: "74조 3항", description: "압박주행금지 위반" },

  // 75조 (낙차·부상)
  { article: "75", paragraph: "-", clause: "-", label: "75조", description: "낙차·부상 유발" },

  // 76조 (기타)
  { article: "76", paragraph: "-", clause: "-", label: "76조", description: "기타 위반" },

  // 87조
  { article: "87", paragraph: "-", clause: "-", label: "87조", description: "선수 품위 위반" },

  // 103조
  { article: "103", paragraph: "1", clause: "4", label: "103조 1항 4호", description: "부정행위" },
];

/** 조항 키 생성 (URL 등에 사용) */
export function articleKey(article: string, paragraph: string, clause: string): string {
  let key = article;
  if (paragraph && paragraph !== "-") key += `-${paragraph}`;
  if (clause && clause !== "-") key += `-${clause}`;
  return key;
}

/** URL 키에서 article/paragraph/clause 파싱 */
export function parseArticleKey(key: string): { article: string; paragraph: string; clause: string } {
  const parts = key.split("-");
  return {
    article: parts[0] || "",
    paragraph: parts[1] || "-",
    clause: parts[2] || "-",
  };
}

/** article/paragraph/clause로 조항 정보 찾기 */
export function findArticle(article: string, paragraph: string, clause: string): ArticleInfo | undefined {
  return VIOLATION_ARTICLES.find(
    (a) => a.article === article && a.paragraph === paragraph && a.clause === clause
  );
}

/** article key로 조항 정보 찾기 */
export function findArticleByKey(key: string): ArticleInfo | undefined {
  const { article, paragraph, clause } = parseArticleKey(key);
  return findArticle(article, paragraph, clause);
}

/** 조항 라벨 생성 (DB 값 기준) */
export function formatArticleLabel(article: string, paragraph: string, clause: string): string {
  const found = findArticle(article, paragraph, clause);
  if (found) return found.label;
  let label = `${article}조`;
  if (paragraph && paragraph !== "-") label += ` ${paragraph}항`;
  if (clause && clause !== "-") label += ` ${clause}호`;
  return label;
}
