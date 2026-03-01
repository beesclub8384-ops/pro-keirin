import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden h-[200px] sm:h-[242px] md:h-[290px]">
      {/* Background Image */}
      <Image
        src="/images/hero-bg.png"
        alt=""
        fill
        priority
        className="object-cover object-[center_20%]"
      />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/60" />
    </section>
  );
}
