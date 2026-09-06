/**
 * 업로드 전 브라우저에서 이미지를 축소·재압축한다. (클라이언트 전용 — canvas API 사용)
 *
 * ⚠️ 존재 이유 (2026-09-06 실측):
 *   Vercel 서버리스 함수의 요청 본문 상한은 4.5MB다. 이 상한은
 *   /api/interview/upload-photo 핸들러에 **도달하기 전에** 걸리기 때문에
 *   서버의 10MB 검사도, console.error 도, 어떤 서버 로그도 남지 않는다.
 *   클라이언트에는 본문이 JSON 이 아닌 응답만 돌아와 "업로드 실패" 한 줄로 끝난다.
 *   최근 아이폰 사진은 원본이 4.5MB를 쉽게 넘으므로 브라우저에서 미리 줄여 보낸다.
 *
 * 새 패키지 없이 canvas 로만 처리한다.
 * 디코딩에 실패하면(브라우저가 못 여는 HEIC 등) 원본 File 을 그대로 돌려준다 —
 * 서버에 sharp → heic-convert 폴백이 있어 원본을 넘기는 편이 안전하다.
 *
 * ⚠️ 서명 URL 직행 업로드(관리자 사진)에는 서버 폴백이 없다.
 *   그쪽 호출자는 반환값의 type 이 "image/jpeg" 인지 확인해서,
 *   변환에 실패한 원본이 그대로 버킷에 들어가는 것을 막아야 한다.
 *   (버킷에 HEIC 가 들어가면 화면에 alt 텍스트만 남는 무음 실패가 된다)
 */

const COMPRESS_MAX_EDGE = 2560; // 웹 표시용으로 충분한 긴 변
const COMPRESS_FALLBACK_EDGE = 1920; // 품질을 낮춰도 안 줄면 해상도까지 낮춘다
const COMPRESS_TARGET_BYTES = 4 * 1024 * 1024; // 4.5MB 상한 아래로 여유를 둔 목표치

/** 비트맵을 maxEdge 이내로 축소해 JPEG Blob 으로 굽는다. 실패 시 null */
async function drawToJpegBlob(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // JPEG 에는 투명도가 없다. 흰 배경을 먼저 깔지 않으면 투명 영역이 검게 나온다.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export async function compressImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    // createImageBitmap 은 EXIF 회전을 기본 반영하지 않는 브라우저가 있어 명시한다.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // 브라우저가 못 여는 포맷 → 원본 그대로 서버로
  }

  try {
    let blob = await drawToJpegBlob(bitmap, COMPRESS_MAX_EDGE, 0.85);
    // 목표치를 넘으면 품질을 단계적으로 낮춰 재시도
    for (const quality of [0.7, 0.55]) {
      if (blob && blob.size <= COMPRESS_TARGET_BYTES) break;
      blob = await drawToJpegBlob(bitmap, COMPRESS_MAX_EDGE, quality);
    }
    // 그래도 넘으면 해상도를 낮춰 마지막으로 재시도
    if (!blob || blob.size > COMPRESS_TARGET_BYTES) {
      blob = await drawToJpegBlob(bitmap, COMPRESS_FALLBACK_EDGE, 0.7);
    }
    if (!blob) return file;
    // 재압축이 오히려 커졌다면(이미 작고 잘 압축된 원본) 원본을 쓴다
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
