import { useEffect, useMemo, useRef, useState } from "react";
import { detectBinish } from "../lib/cv";
import { uploadAuditPhoto } from "../lib/photos";
import PhotoLightbox from "./PhotoLightbox";

export const MAX_PHOTOS_PER_STREAM = 5;

type PhotoState = {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "uploaded" | "error";
  storagePath?: string;
  errorMessage?: string;
  warning?: string;
  cv?: { ok: boolean; label: string };
  cvRunning?: boolean;
};

export default function PhotoCapture({
  submissionId,
  stream,
  label,
  onChange,
}: {
  submissionId: string;
  stream: string;
  /** Human-readable stream name, used in the viewer caption. */
  label?: string;
  onChange: (paths: string[], pending: number, failed: number) => void;
}) {
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Keep a live handle on object URLs so unmount cleanup doesn't read stale state.
  const urlsRef = useRef<string[]>([]);
  const countRef = useRef(0);
  useEffect(() => () => { urlsRef.current.forEach(URL.revokeObjectURL); }, []);

  useEffect(() => {
    const paths = photos
      .filter((p) => p.status === "uploaded" && p.storagePath)
      .map((p) => p.storagePath!);
    const pending = photos.filter((p) => p.status === "uploading").length;
    const failed = photos.filter((p) => p.status === "error").length;
    onChange(paths, pending, failed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  async function processOne(file: File, id: string) {
    try {
      const { storagePath, warning } = await uploadAuditPhoto(submissionId, stream, file);
      // Flip to "uploaded" as soon as storage confirms — CV must never gate this.
      setPhotos((prev) => prev.map((p) =>
        p.id === id ? { ...p, status: "uploaded", storagePath, warning, cvRunning: true } : p
      ));
      detectBinish(file).then(
        (cv) => setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, cv, cvRunning: false } : p))),
        () =>   setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, cvRunning: false } : p)))
      );
    } catch (e: any) {
      setPhotos((prev) => prev.map((p) =>
        p.id === id ? { ...p, status: "error", errorMessage: e?.message ?? "Upload failed." } : p
      ));
    }
  }

  function addFiles(files: FileList | null) {
    // Snapshot first: FileList is live, so resetting input.value empties it.
    const incoming = files ? Array.from(files).filter((f) => f.size > 0) : [];
    // Reset the inputs so picking the same file twice still fires onChange.
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
    if (incoming.length === 0) return;

    // countRef is bumped synchronously, so two fast taps can't both read a
    // pre-update length and push past the per-stream cap.
    const room = MAX_PHOTOS_PER_STREAM - countRef.current;
    if (room <= 0) return;
    const taken = incoming.slice(0, room).map((f) => {
      const previewUrl = URL.createObjectURL(f);
      urlsRef.current.push(previewUrl);
      return { id: crypto.randomUUID(), file: f, previewUrl, status: "uploading" as const };
    });
    countRef.current += taken.length;
    setPhotos((prev) => [...prev, ...taken]);
    taken.forEach((p) => { void processOne(p.file, p.id); });
  }

  function removeOne(id: string) {
    const p = photos.find((x) => x.id === id);
    if (!p) return;
    URL.revokeObjectURL(p.previewUrl);
    urlsRef.current = urlsRef.current.filter((u) => u !== p.previewUrl);
    countRef.current = Math.max(0, countRef.current - 1);
    setPhotos((prev) => prev.filter((x) => x.id !== id));
    setViewerIndex(null);
  }

  function retryOne(p: PhotoState) {
    setPhotos((prev) => prev.map((x) =>
      x.id === p.id ? { ...x, status: "uploading", errorMessage: undefined } : x
    ));
    void processOne(p.file, p.id);
  }

  const lightboxItems = useMemo(
    () => photos.map((p, i) => ({
      url: p.previewUrl,
      caption: `${label ?? stream} · photo ${i + 1}`,
    })),
    [photos, label, stream]
  );

  const failed = photos.filter((p) => p.status === "error");
  const pending = photos.filter((p) => p.status === "uploading").length;
  const uploaded = photos.filter((p) => p.status === "uploaded").length;
  const full = photos.length >= MAX_PHOTOS_PER_STREAM;

  return (
    <div>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {photos.map((p, i) => (
            <li key={p.id}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setViewerIndex(i)}
                  className="block w-full aspect-square rounded-xl overflow-hidden border border-slate-300 bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cmu"
                  aria-label={`View photo ${i + 1}`}
                >
                  <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                </button>

                <button
                  type="button"
                  onClick={() => removeOne(p.id)}
                  className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-slate-900/85 text-white text-base leading-none flex items-center justify-center shadow hover:bg-red-600 active:bg-red-700"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  ×
                </button>

                <div
                  className={
                    "absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[11px] font-medium text-white rounded-b-xl flex items-center gap-1 " +
                    (p.status === "error" ? "bg-red-700/90" : p.status === "uploading" ? "bg-slate-900/80" : "bg-emerald-700/85")
                  }
                >
                  {p.status === "uploading" && (
                    <>
                      <Spinner />
                      <span className="truncate">Uploading…</span>
                    </>
                  )}
                  {p.status === "uploaded" && (
                    <>
                      <span aria-hidden>✓</span>
                      <span className="truncate">Saved</span>
                    </>
                  )}
                  {p.status === "error" && (
                    <>
                      <span aria-hidden>!</span>
                      <span className="truncate">Failed</span>
                    </>
                  )}
                </div>
              </div>

              {p.status === "error" && (
                <button
                  type="button"
                  onClick={() => retryOne(p)}
                  className="mt-1 w-full min-h-9 rounded-lg border border-red-300 bg-red-50 text-xs font-semibold text-red-700 active:bg-red-100"
                >
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 shadow-sm active:bg-slate-100 hover:bg-slate-50"
          >
            <span aria-hidden className="text-base">📷</span> Take photo
          </button>
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className="min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 shadow-sm active:bg-slate-100 hover:bg-slate-50"
          >
            <span aria-hidden className="text-base">🖼</span> Upload
          </button>
        </div>
      )}

      {/* Camera capture — mobile opens the camera directly; desktop shows a file picker. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      {/* Gallery / files — multi-select allowed. */}
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      <div className="mt-2 space-y-1">
        {failed.length > 0 && (
          <p className="text-xs text-red-700">
            {failed.length} photo{failed.length === 1 ? "" : "s"} didn't upload: {failed[0].errorMessage}
            {failed.length > 1 ? " Tap Retry on each." : " Tap Retry."}
          </p>
        )}
        {photos.some((p) => p.warning) && (
          <p className="text-xs text-amber-700">{photos.find((p) => p.warning)!.warning}</p>
        )}
        {photos.some((p) => p.status === "uploaded" && p.cv && !p.cv.ok) && (
          <p className="text-xs text-slate-500">
            Heads up: one photo didn't look like a bin. It's saved either way — just double-check you got the right shot.
          </p>
        )}
        <p className="text-xs text-slate-500">
          {full
            ? `Maximum ${MAX_PHOTOS_PER_STREAM} photos for this bin.`
            : `Optional · up to ${MAX_PHOTOS_PER_STREAM} photos`}
          {uploaded > 0 && ` · ${uploaded} saved`}
          {pending > 0 && ` · ${pending} uploading`}
        </p>
      </div>

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoLightbox
          items={lightboxItems}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin shrink-0"
    />
  );
}
