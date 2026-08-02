import sharp from "sharp";

// 빈티지 필름 필터
// 입력 이미지 Buffer → 아래 효과를 순서대로 적용한 JPEG Buffer 반환
//   1) 따뜻한 색감 (R↑, B↓ 로 노란/주황 틴트)
//   2) 대비 약간 상향 (midpoint 128 유지)
//   3) 채도 약간 하향
//   4) 필름 그레인 (가우시안 노이즈, overlay 블렌드)
//   5) 살짝 비네팅 (가장자리 warm-dark, multiply 블렌드)
//
// 필터 후 포맷은 항상 JPEG 로 통일한다 (사진 용도 + 그레인/틴트 표현에 적합).

export const FILM_FILTER_OUTPUT = {
  contentType: "image/jpeg",
  ext: "jpg",
} as const;

// 색보정 파라미터 (미세 조정 지점)
const CONTRAST = 1.1; // 대비 배율 (>1 = 대비↑)
const WARM_GAIN = [1.07, 1.0, 0.9]; // 채널별 warm 게인 [R, G, B]
const SATURATION = 0.82; // 채도 (1 = 원본)
const BRIGHTNESS = 1.02; // 밝기 (1 = 원본)
const GRAIN_SIGMA = 12; // 그레인 강도 (가우시안 표준편차)
const VIGNETTE_EDGE = "#726250"; // 비네팅 가장자리 색 (warm dark)

export async function applyFilmFilter(input: Buffer): Promise<Buffer> {
  // 1~3) 색보정: EXIF 회전 반영 → 알파 제거(3채널 고정) → 채도/밝기 → 대비+warm
  // linear(a, b): out = a*in + b. 채널별 배열 지원.
  //   a_c = CONTRAST * WARM_GAIN[c], b_c = 128*(1 - a_c) 로 midpoint 유지.
  const a = WARM_GAIN.map((w) => CONTRAST * w);
  const b = a.map((av) => 128 * (1 - av));

  const graded = await sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .modulate({ saturation: SATURATION, brightness: BRIGHTNESS })
    .linear(a, b)
    .png()
    .toBuffer({ resolveWithObject: true });

  const width = graded.info.width;
  const height = graded.info.height;
  if (!width || !height) {
    throw new Error("이미지 크기를 확인할 수 없습니다");
  }

  // 4) 필름 그레인 — 회색(128) 중심 가우시안 노이즈를 무채색으로 만들어 overlay
  const grain = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: GRAIN_SIGMA },
    },
  })
    .modulate({ saturation: 0 })
    .png()
    .toBuffer();

  // 5) 비네팅 — 중앙 흰색 → 가장자리 warm-dark 방사형 그라디언트를 multiply
  const vignette = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs>` +
      `<radialGradient id="v" cx="50%" cy="50%" r="72%">` +
      `<stop offset="58%" stop-color="#ffffff"/>` +
      `<stop offset="100%" stop-color="${VIGNETTE_EDGE}"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="100%" height="100%" fill="url(#v)"/>` +
      `</svg>`,
  );

  return sharp(graded.data)
    .composite([
      { input: grain, blend: "overlay" },
      { input: vignette, blend: "multiply" },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}
