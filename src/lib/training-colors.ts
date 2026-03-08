export const TRAINING_COLORS: Record<string, string> = {
  // 주요 경륜장
  "광명": "bg-blue-100 text-blue-700 border-blue-200",
  "부산": "bg-orange-100 text-orange-700 border-orange-200",
  "창원": "bg-green-100 text-green-700 border-green-200",
  "창원A": "bg-green-100 text-green-700 border-green-200",
  "창원B": "bg-emerald-100 text-emerald-700 border-emerald-200",
  // 광역시/주요도시
  "대전": "bg-purple-100 text-purple-700 border-purple-200",
  "광주": "bg-red-100 text-red-700 border-red-200",
  "광주A": "bg-red-100 text-red-700 border-red-200",
  "광주B": "bg-rose-100 text-rose-700 border-rose-200",
  "대구": "bg-amber-100 text-amber-700 border-amber-200",
  "인천": "bg-cyan-100 text-cyan-700 border-cyan-200",
  "울산": "bg-teal-100 text-teal-700 border-teal-200",
  "서울개인": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "전주": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  // 경기도
  "광명A": "bg-blue-50 text-blue-600 border-blue-200",
  "과천": "bg-sky-100 text-sky-700 border-sky-200",
  "구리": "bg-violet-100 text-violet-700 border-violet-200",
  "성남": "bg-pink-100 text-pink-700 border-pink-200",
  "분당": "bg-pink-50 text-pink-600 border-pink-200",
  "부천": "bg-lime-100 text-lime-700 border-lime-200",
  "일산": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "의정부": "bg-stone-100 text-stone-700 border-stone-200",
  "남양주": "bg-zinc-100 text-zinc-700 border-zinc-200",
  "경기광주": "bg-slate-100 text-slate-700 border-slate-200",
  "경기양주": "bg-neutral-100 text-neutral-700 border-neutral-200",
  "오산": "bg-orange-50 text-orange-600 border-orange-200",
  "평택": "bg-amber-50 text-amber-600 border-amber-200",
  "기흥": "bg-yellow-50 text-yellow-600 border-yellow-200",
  "안성": "bg-lime-50 text-lime-600 border-lime-200",
  "여주": "bg-green-50 text-green-600 border-green-200",
  "양평": "bg-emerald-50 text-emerald-600 border-emerald-200",
  "가평": "bg-teal-50 text-teal-600 border-teal-200",
  "파주": "bg-cyan-50 text-cyan-600 border-cyan-200",
  "전곡": "bg-sky-50 text-sky-600 border-sky-200",
  "동두천": "bg-blue-50 text-blue-500 border-blue-200",
  "팔당": "bg-indigo-50 text-indigo-600 border-indigo-200",
  "양양": "bg-violet-50 text-violet-600 border-violet-200",
  // 충청도
  "청주": "bg-rose-50 text-rose-600 border-rose-200",
  "오창": "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200",
  "충주": "bg-purple-50 text-purple-600 border-purple-200",
  "당진": "bg-red-50 text-red-600 border-red-200",
  "예산": "bg-orange-100 text-orange-600 border-orange-200",
  "음성": "bg-amber-100 text-amber-600 border-amber-200",
  "미원": "bg-yellow-100 text-yellow-600 border-yellow-200",
  // 경상도
  "김천": "bg-lime-100 text-lime-600 border-lime-200",
  "구미": "bg-green-100 text-green-600 border-green-200",
  "안동": "bg-emerald-100 text-emerald-600 border-emerald-200",
  "의성": "bg-teal-100 text-teal-600 border-teal-200",
  "양산": "bg-cyan-100 text-cyan-600 border-cyan-200",
  "예천": "bg-sky-100 text-sky-600 border-sky-200",
  "문경": "bg-blue-100 text-blue-600 border-blue-200",
  "영주": "bg-indigo-100 text-indigo-600 border-indigo-200",
  "진주": "bg-violet-100 text-violet-600 border-violet-200",
  // 전라도
  "나주": "bg-pink-100 text-pink-600 border-pink-200",
  "군산": "bg-rose-100 text-rose-600 border-rose-200",
  "익산": "bg-fuchsia-100 text-fuchsia-600 border-fuchsia-200",
  "여수": "bg-purple-100 text-purple-600 border-purple-200",
  "남원": "bg-red-100 text-red-600 border-red-200",
  // 강원도
  "춘천": "bg-emerald-100 text-emerald-700 border-emerald-200",
  // 기타
  "워커힐": "bg-slate-100 text-slate-600 border-slate-200",
};

export function getTrainingColor(training: string): string {
  const location = training?.split("/")[0]?.trim() || "";
  return TRAINING_COLORS[location] || "bg-gray-100 text-gray-600 border-gray-200";
}
