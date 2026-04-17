import Link from "next/link";
import Image from "next/image";
import InterviewHeaderMenu from "@/components/InterviewHeaderMenu";
import CapacitorBackButton from "@/components/CapacitorBackButton";

export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <CapacitorBackButton />
      {/* Background - fixed position div for iOS compatibility */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/interview-bg.png')" }}
      />
      <div className="fixed inset-0 -z-10 bg-black/30" />

      <header className="border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-20 sm:h-24 max-w-7xl items-center justify-between px-4">
          <Link href="/interview" className="flex items-center gap-2 sm:gap-3">
            <Image
              src="/images/logo.png"
              alt="7randoms"
              width={288}
              height={96}
              priority
              className="h-[50px] w-auto sm:h-[66px]"
            />
            <span className="text-xs font-medium text-muted-foreground/60 select-none">
              ×
            </span>
            <Image
              src="/images/pkru-logo.png"
              alt="프로경륜선수노동조합"
              width={351}
              height={248}
              priority
              className="h-[50px] w-auto sm:h-[66px]"
            />
          </Link>
          <InterviewHeaderMenu />
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
