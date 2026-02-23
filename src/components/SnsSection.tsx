import { Instagram } from "lucide-react";
import Link from "next/link";

const instagramPosts = [
  {
    id: 1,
    color: "bg-gradient-to-br from-keirin-red to-orange-500",
    label: "경주 하이라이트",
  },
  {
    id: 2,
    color: "bg-gradient-to-br from-blue-500 to-purple-600",
    label: "선수 인터뷰",
  },
  {
    id: 3,
    color: "bg-gradient-to-br from-green-500 to-teal-600",
    label: "스피돔 현장",
  },
  {
    id: 4,
    color: "bg-gradient-to-br from-amber-500 to-orange-600",
    label: "시상식",
  },
  {
    id: 5,
    color: "bg-gradient-to-br from-pink-500 to-red-600",
    label: "팬 이벤트",
  },
  {
    id: 6,
    color: "bg-gradient-to-br from-indigo-500 to-blue-700",
    label: "훈련 현장",
  },
];

export default function SnsSection() {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Instagram className="h-6 w-6 text-pink-500" />
            <div>
              <h2 className="text-2xl font-bold text-foreground">SNS</h2>
              <p className="mt-1 text-sm text-muted-foreground">@prokeirin_union</p>
            </div>
          </div>
          <Link
            href="https://instagram.com"
            target="_blank"
            className="text-sm font-medium text-keirin-red hover:underline"
          >
            팔로우하기
          </Link>
        </div>

        {/* Instagram Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {instagramPosts.map((post) => (
            <div
              key={post.id}
              className={`${post.color} group relative aspect-square cursor-pointer overflow-hidden rounded-xl`}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-0 bg-black/40 group-hover:opacity-100 transition-opacity">
                <span className="text-sm font-medium text-white">{post.label}</span>
              </div>
              {/* Placeholder: 실제 인스타그램 이미지가 들어갈 자리 */}
              <div className="flex h-full items-center justify-center">
                <Instagram className="h-8 w-8 text-white/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
