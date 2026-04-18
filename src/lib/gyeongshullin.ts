export type GyeongshullinStatus = "draft" | "published";

export interface GyeongshullinRow {
  id: number;
  name: string;
  address: string;
  region: string | null;
  menu: string | null;
  memo: string | null;
  food_photos: string[] | null;
  menu_photos: string[] | null;
  recommender_name: string;
  recommender_grade: string | null;
  recommender_region: string | null;
  status: GyeongshullinStatus;
  created_at: string;
  updated_at: string;
}

export interface GyeongshullinRestaurant {
  id: number;
  name: string;
  address: string;
  region: string;
  menu: string;
  memo: string;
  foodPhotos: string[];
  menuPhotos: string[];
  recommenderName: string;
  recommenderGrade: string;
  recommenderRegion: string;
  status: GyeongshullinStatus;
  createdAt: string;
  updatedAt: string;
}

export function rowToRestaurant(row: GyeongshullinRow): GyeongshullinRestaurant {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    region: row.region ?? "",
    menu: row.menu ?? "",
    memo: row.memo ?? "",
    foodPhotos: row.food_photos ?? [],
    menuPhotos: row.menu_photos ?? [],
    recommenderName: row.recommender_name,
    recommenderGrade: row.recommender_grade ?? "",
    recommenderRegion: row.recommender_region ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function extractRegion(address: string): string {
  if (!address) return "";
  const trimmed = address.trim();
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  const map: Record<string, string> = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
    "세종특별자치시": "세종",
    "경기도": "경기",
    "강원특별자치도": "강원",
    "강원도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전라북도": "전북",
    "전북특별자치도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주특별자치도": "제주",
    "제주도": "제주",
  };
  if (map[firstWord]) return map[firstWord];
  return firstWord;
}

export function naverMapUrl(query: string): string {
  return `https://map.naver.com/v5/search/${encodeURIComponent(query)}`;
}
