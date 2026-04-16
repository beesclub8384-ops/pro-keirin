import Link from "next/link";
import Image from "next/image";

export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-24 sm:h-28 max-w-7xl items-center px-4">
          <Link href="/interview" className="flex items-center">
            <Image
              src="/images/logo.png"
              alt="7randoms"
              width={288}
              height={96}
              priority
              className="h-[72px] w-auto sm:h-[96px]"
            />
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
