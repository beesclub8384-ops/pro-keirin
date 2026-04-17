import Link from "next/link";
import Image from "next/image";

export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Background - fixed position div for iOS compatibility */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/interview-bg.png')" }}
      />
      <div className="fixed inset-0 -z-10 bg-black/30" />

      <header className="border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-20 sm:h-24 max-w-7xl items-center px-4">
          <Link href="/interview" className="flex items-center">
            <Image
              src="/images/logo.png"
              alt="7randoms"
              width={288}
              height={96}
              priority
              className="h-[58px] w-auto sm:h-[77px]"
            />
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
        {children}
      </div>

      <footer className="py-6 text-center bg-black/40 backdrop-blur-sm">
        <p
          className="text-xs text-white/70"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
        >
          7RANDOMS는 프로경륜선수노동조합의 지원을 받아 운영되고 있습니다.
        </p>
      </footer>
    </div>
  );
}
