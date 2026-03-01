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

export async function fetchInterviews(): Promise<InterviewArticle[]> {
  const res = await fetch(API_URL, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchInterviewsByDate(
  date: string,
): Promise<InterviewArticle[]> {
  const all = await fetchInterviews();
  return all.filter((a) => a.date === date);
}
