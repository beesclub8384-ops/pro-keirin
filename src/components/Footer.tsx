import Link from "next/link";
import { Instagram, Youtube, Phone, Mail, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t bg-keirin-dark text-gray-300">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Organization Info */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-keirin-red text-white font-bold text-xs">
                PK
              </div>
              <div>
                <p className="text-sm font-bold text-white">프로경륜선수노동조합</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-gray-400">
              선수가 중심이 되는 경륜 문화를 만들어가는 프로경륜선수노동조합입니다.
            </p>
            <div className="mt-4 flex gap-3">
              <Link
                href="https://instagram.com"
                target="_blank"
                className="rounded-full bg-gray-800 p-2 hover:bg-keirin-red transition-colors"
              >
                <Instagram className="h-4 w-4" />
              </Link>
              <Link
                href="https://youtube.com"
                target="_blank"
                className="rounded-full bg-gray-800 p-2 hover:bg-keirin-red transition-colors"
              >
                <Youtube className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 text-sm font-bold text-white">바로가기</h3>
            <ul className="space-y-2">
              {[
                { label: "조합 소개", href: "/about" },
                { label: "경륜 가이드", href: "/guide" },
                { label: "선수 정보", href: "/players" },
                { label: "경주 일정", href: "/races" },
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

          {/* Race Venues */}
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
            <h3 className="mb-4 text-sm font-bold text-white">연락처</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <Phone className="h-3 w-3 shrink-0" />
                02-0000-0000
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-3 w-3 shrink-0" />
                info@prokeirin.kr
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <p>&copy; 2026 프로경륜선수노동조합. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-gray-300">개인정보처리방침</Link>
            <Link href="/terms" className="hover:text-gray-300">이용약관</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
