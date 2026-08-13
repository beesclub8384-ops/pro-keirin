import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // heic-convert 는 libheif 를 wasm/asm 자산으로 싣고 있어 번들러가 깨뜨리기 쉽다.
  // 서버 런타임에서 node_modules 그대로 require 하도록 외부 패키지로 둔다.
  serverExternalPackages: ["heic-convert"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "bhgjbckejaqplqcxrohh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
