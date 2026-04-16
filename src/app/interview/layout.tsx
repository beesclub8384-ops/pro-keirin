import Link from "next/link";

export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link
            href="/interview"
            className="text-lg font-bold tracking-tight text-foreground"
          >
            7RANDOMS
          </Link>
          <span className="ml-2 text-sm text-muted-foreground">인터뷰</span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
