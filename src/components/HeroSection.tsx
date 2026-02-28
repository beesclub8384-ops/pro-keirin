import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden h-[400px] sm:h-[480px] md:h-[560px]">
      {/* Background Image */}
      <Image
        src="/images/hero-bg.png"
        alt=""
        fill
        priority
        className="object-cover"
      />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/60" />
    </section>
  );
}
