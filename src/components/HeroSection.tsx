import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden h-[180px] sm:h-[220px] md:h-[264px]">
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
