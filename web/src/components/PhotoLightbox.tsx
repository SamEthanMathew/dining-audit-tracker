import { useCallback, useEffect, useRef, useState } from "react";

export type LightboxItem = {
  url: string;
  caption?: string;
  /** Opens the raw file in a new tab (signed URL). */
  href?: string;
};

/**
 * Full-screen photo viewer. Keyboard arrows on desktop, swipe on touch,
 * and it never traps the user: backdrop tap and Escape both close.
 */
export default function PhotoLightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = items.length;
  const item = items[index];

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setZoomed(false);
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 text-xs sm:text-sm">
          <div className="truncate font-medium">{item.caption ?? "Photo"}</div>
          {count > 1 && <div className="text-white/60">{index + 1} of {count}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.href && (
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="min-h-11 inline-flex items-center rounded-lg px-3 text-xs font-medium bg-white/10 hover:bg-white/20 active:bg-white/25"
            >
              Open
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo viewer"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 flex items-center justify-center overflow-auto px-2"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start || zoomed) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        }}
      >
        <img
          src={item.url}
          alt={item.caption ?? ""}
          onClick={() => setZoomed((z) => !z)}
          className={
            zoomed
              ? "max-w-none w-auto h-auto cursor-zoom-out"
              : "max-h-full max-w-full object-contain cursor-zoom-in"
          }
        />
      </div>

      <div
        className="flex items-center justify-between gap-3 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="min-h-12 flex-1 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 active:bg-white/25"
            >
              ‹ Previous
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="min-h-12 flex-1 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 active:bg-white/25"
            >
              Next ›
            </button>
          </>
        ) : (
          <p className="text-center w-full text-xs text-white/50">Tap the photo to zoom</p>
        )}
      </div>
    </div>
  );
}
