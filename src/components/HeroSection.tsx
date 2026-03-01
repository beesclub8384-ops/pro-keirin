import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden h-[160px] sm:h-[200px] md:h-[240px]">
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
