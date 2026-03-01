export interface InterviewArticle {
  date: string;
  playerName: string;
  grade: string;
  region: string;
  article: string;
  docLink: string;
}

const API_URL =
  "https://script.google.com/macros/s/AKfycbwbhJchNH0iB1GV2NnhOor0mSdkmt86nAcp1PClJcTg3SkSwUndPgY2NfQWnDzNGX9gUQ/exec";

/** ISO 타임스탬프("2026-02-28T15:00:00.000Z")를 KST 날짜("2026-03-01")로 변환 */
function toKSTDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function fetchInterviews(): Promise<InterviewArticle[]> {
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((a: InterviewArticle) => ({ ...a, date: toKSTDate(a.date) }));
}

export async function fetchInterviewsByDate(
  date: string,
): Promise<InterviewArticle[]> {
  const all = await fetchInterviews();
  return all.filter((a) => a.date === date);
}
