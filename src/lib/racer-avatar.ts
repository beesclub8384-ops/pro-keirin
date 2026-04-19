export function splitKoreanName(fullName: string): {
  surname: string;
  given: string;
} {
  const trimmed = (fullName ?? "").trim();
  if (trimmed.length <= 1) return { surname: trimmed, given: "" };
  return { surname: trimmed.slice(0, 1), given: trimmed.slice(1) };
}
