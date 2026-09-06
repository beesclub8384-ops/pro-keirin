"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  photos: string[];
  startIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** 더블클릭/더블탭으로 오가는 배율 */
const TOGGLE_SCALE = 2;
/** 휠 한 칸당 배율 */
const WHEEL_STEP = 1.2;
/** 이만큼 움직였으면 클릭이 아니라 드래그로 본다 (px) */
const DRAG_THRESHOLD = 3;
/** 좌우 스와이프로 사진을 넘기는 최소 이동량 (px) */
const SWIPE_THRESHOLD = 40;
/** 더블탭으로 인정하는 두 탭 사이 간격 (ms) */
const DOUBLE_TAP_MS = 300;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function touchDistance(touches: React.TouchList): number {
  const a = touches[0];
  const b = touches[1];
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * 사진 확대 보기 오버레이.
 *
 * 여러 화면이 공유한다 — 인터뷰 팀 소개(/interview/team), 륜슐랭 상세
 * (/interview/gyeongshullin/[id]), 관리자 기사 편집(/interview/admin/[articleId]).
 * 확대·팬은 관리자 화면 요구로 추가했지만 나머지 화면에도 그대로 이득이라
 * 새 컴포넌트를 만드는 대신 여기에 얹었다 (같은 UI가 두 벌로 갈라지는 것을 막는다).
 *
 * 조작:
 *   - 휠            확대/축소 (커서 아래 지점을 고정한 채 배율만 바뀐다)
 *   - 드래그        확대 상태에서 이미지 이동(팬). 1x 에서는 팬하지 않는다
 *   - 더블클릭/탭   1x ↔ 2x 토글
 *   - 두 손가락     핀치 줌
 *   - 한 손가락     확대 상태면 팬, 1x 면 좌우 스와이프로 사진 넘기기(기존 동작)
 *   - 닫기          X 버튼 / 배경 클릭 / Esc
 *
 * 배율·위치는 사진을 넘기거나 닫으면 초기화된다
 * (닫기는 부모가 언마운트하므로 자동, 사진 전환은 아래 goTo).
 */
export default function PhotoLightbox({ photos, startIndex, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /** 드래그/핀치 중인지 — 트랜지션과 커서 모양에 쓴다 */
  const [interacting, setInteracting] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  /** 1x 에서의 좌우 스와이프(사진 넘기기) 시작점 */
  const touchStartX = useRef<number | null>(null);
  /** 팬 시작 시점의 포인터 좌표 + 그때의 offset */
  const panStart = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  /** 핀치 시작 시점의 두 손가락 거리 + 그때의 배율 */
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  /** 드래그로 끝난 클릭이 "배경 클릭 = 닫기"로 오인되지 않게 하는 플래그 */
  const draggedRef = useRef(false);
  /** 더블탭 판정용 직전 탭 시각 */
  const lastTapRef = useRef(0);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  /**
   * 사진 전환. 모든 경로(좌우 버튼·화살표 키·스와이프)가 여기를 지난다.
   * ⚠️ 전환할 때 확대 상태를 반드시 초기화한다 — 앞 사진의 배율이 남으면
   *   다음 사진이 엉뚱하게 확대된 채로 뜬다.
   */
  const goTo = useCallback(
    (delta: number) => {
      setIdx((i) => (i + delta + photos.length) % photos.length);
      resetView();
    },
    [photos.length, resetView],
  );
  const prev = useCallback(() => goTo(-1), [goTo]);
  const next = useCallback(() => goTo(1), [goTo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  /** 확대해도 이미지가 화면 밖으로 완전히 빠져나가지 않도록 이동량을 가둔다 */
  const clampOffset = useCallback(
    (next: { x: number; y: number }, s: number) => {
      const el = stageRef.current;
      if (!el || s <= 1) return { x: 0, y: 0 };
      const maxX = (el.clientWidth * (s - 1)) / 2;
      const maxY = (el.clientHeight * (s - 1)) / 2;
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [],
  );

  function toggleZoom() {
    if (scale > 1) resetView();
    else setScale(TOGGLE_SCALE);
  }

  /**
   * 휠 확대 — 커서 아래 지점이 그대로 있도록 offset 을 함께 보정한다.
   * (스테이지 중앙을 원점으로 보고, 배율이 r 배 되면 그 점의 좌표도 r 배가 되므로
   *  offset 을 같은 비율로 되돌려 준다)
   */
  function handleWheel(e: React.WheelEvent) {
    const el = stageRef.current;
    if (!el) return;
    const nextScale = clampScale(
      scale * (e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP),
    );
    if (nextScale === scale) return;

    const rect = el.getBoundingClientRect();
    const cx = e.clientX - (rect.left + rect.width / 2);
    const cy = e.clientY - (rect.top + rect.height / 2);
    const ratio = nextScale / scale;
    const nextOffset = {
      x: cx - (cx - offset.x) * ratio,
      y: cy - (cy - offset.y) * ratio,
    };

    setScale(nextScale);
    setOffset(clampOffset(nextOffset, nextScale));
  }

  // ---- 마우스(펜) 팬 — 터치는 아래 touch 핸들러가 따로 처리한다 ----
  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    if (scale <= 1) return;
    draggedRef.current = false;
    panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setInteracting(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    const start = panStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      draggedRef.current = true;
    }
    setOffset(clampOffset({ x: start.ox + dx, y: start.oy + dy }, scale));
  }
  function handlePointerUp() {
    if (!panStart.current) return;
    panStart.current = null;
    setInteracting(false);
  }

  // ---- 터치 ----
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchStart.current = { dist: touchDistance(e.touches), scale };
      panStart.current = null;
      touchStartX.current = null;
      setInteracting(true);
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    if (scale > 1) {
      // 확대 상태의 한 손가락은 팬이다 (사진 넘기기보다 우선)
      draggedRef.current = false;
      panStart.current = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y };
      setInteracting(true);
    } else {
      touchStartX.current = t.clientX;
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStart.current) {
      const dist = touchDistance(e.touches);
      if (dist === 0) return;
      const nextScale = clampScale(
        (pinchStart.current.scale * dist) / pinchStart.current.dist,
      );
      setScale(nextScale);
      setOffset((o) => clampOffset(o, nextScale));
      draggedRef.current = true;
      return;
    }
    const start = panStart.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      draggedRef.current = true;
    }
    setOffset(clampOffset({ x: start.ox + dx, y: start.oy + dy }, scale));
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (pinchStart.current && e.touches.length < 2) {
      pinchStart.current = null;
      setInteracting(false);
    }
    if (panStart.current) {
      panStart.current = null;
      setInteracting(false);
      return;
    }

    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;

    const endX = e.changedTouches[0]?.clientX ?? startX;
    const dx = endX - startX;

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      if (dx > 0) prev();
      else next();
      return;
    }

    // 움직임이 거의 없었으면 탭 — 짧은 간격으로 두 번이면 더블탭 확대
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      toggleZoom();
    } else {
      lastTapRef.current = now;
    }
  }

  if (photos.length === 0) return null;

  const zoomed = scale > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={() => {
        // 드래그로 끝난 클릭은 닫기가 아니다
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onClose();
      }}
    >
      <div
        ref={stageRef}
        className="relative h-[80vh] w-full max-w-4xl overflow-hidden"
        style={{
          touchAction: "none",
          cursor: zoomed ? (interacting ? "grabbing" : "grab") : "zoom-in",
        }}
        // 이미지 위 클릭은 닫지 않는다 (바깥 검은 영역만 닫기)
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onDoubleClick={toggleZoom}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="relative h-full w-full will-change-transform"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: interacting ? "none" : "transform 120ms ease-out",
          }}
        >
          <Image
            key={photos[idx]}
            src={photos[idx]}
            alt={`사진 ${idx + 1}`}
            fill
            sizes="100vw"
            className="select-none object-contain"
            draggable={false}
            unoptimized
            priority
          />
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="닫기"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="이전 사진"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="다음 사진"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
        {photos.length > 1 && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
            {idx + 1} / {photos.length}
          </span>
        )}
        {zoomed && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
            {scale.toFixed(1)}x
          </span>
        )}
      </div>
    </div>
  );
}
