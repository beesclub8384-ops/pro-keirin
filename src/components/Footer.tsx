import Link from "next/link";
import { BarChart3, Mail, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t bg-keirin-dark text-gray-300">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Site Info */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">7randoms</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-gray-400">
              AI 기반 경륜 데이터 분석 플랫폼. 배당률 패턴, 선수 성적 통계, 경주 예측 인사이트를 제공합니다.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 text-sm font-bold text-white">바로가기</h3>
            <ul className="space-y-2">
              {[
                { label: "경주 분석", href: "/analysis/odds" },
                { label: "선수 데이터", href: "/players" },
                { label: "경륜 가이드", href: "/guide" },
                { label: "커뮤니티", href: "/community" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Data Sources */}
          <div>
            <h3 className="mb-4 text-sm font-bold text-white">경륜장</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <MapPin className="h-3 w-3 shrink-0" />
                광명 스피돔
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-3 w-3 shrink-0" />
                부산 스포원파크
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-3 w-3 shrink-0" />
                창원 경륜장
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-bold text-white">안내</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <Mail className="h-3 w-3 shrink-0" />
                contact@7randoms.com
              </li>
            </ul>
            <p className="mt-4 text-xs text-gray-500 leading-relaxed">
              본 사이트는 개인이 운영하는 경륜 데이터 분석 플랫폼이며, 공식 경륜 기관과 무관합니다. 데이터는 공개 정보를 기반으로 합니다.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <p>&copy; 2026 7randoms. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-gray-300">개인정보처리방침</Link>
            <Link href="/terms" className="hover:text-gray-300">이용약관</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
