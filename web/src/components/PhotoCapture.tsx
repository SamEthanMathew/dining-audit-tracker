import { useEffect, useRef, useState } from "react";
import { detectBinish } from "../lib/cv";
import { uploadAuditPhoto } from "../lib/photos";

type PhotoState = {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "uploaded" | "error";
  storagePath?: string;
  errorMessage?: string;
  cv?: { ok: boolean; label: string };
  cvRunning?: boolean;
};

export default function PhotoCapture({
  submissionId,
  stream,
  onChange,
}: {
  submissionId: string;
  stream: string;
  onChange: (paths: string[], pending: number) => void;
}) {
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const paths = photos.filter((p) => p.status === "uploaded" && p.storagePath).map((p) => p.storagePath!);
    const pending = photos.filter((p) => p.status === "uploading").length;
    onChange(paths, pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processOne(file: File, id: string) {
    // Kick off the upload first.
    try {
      const storagePath = await uploadAuditPhoto(submissionId, stream, file);
      // Flip status to "uploaded" the moment upload finishes — don't wait for CV.
      setPhotos((prev) => prev.map((p) =>
        p.id === id ? { ...p, status: "uploaded", storagePath, cvRunning: true } : p
      ));
      // Run CV in the background; never block the form.
      detectBinish(file).then(
        (cv) => setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, cv, cvRunning: false } : p)),
        () =>   setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, cvRunning: false } : p))
      );
    } catch (e: any) {
      setPhotos((prev) => prev.map((p) =>
        p.id === id ? { ...p, status: "error", errorMessage: e?.message ?? "upload failed" } : p
      ));
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 5 - photos.length;
    const taken = Array.from(files).slice(0, remaining);
    for (const f of taken) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(f);
      setPhotos((prev) => [...prev, { id, file: f, previewUrl, status: "uploading" }]);
      // Fire and forget — multiple uploads run in parallel
      processOne(f, id);
    }
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
  }

  function removeOne(id: string) {
    setPhotos((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  function retryOne(p: PhotoState) {
    const id = p.id;
    setPhotos((prev) => prev.map((x) => x.id === id ? { ...x, status: "uploading", errorMessage: undefined } : x));
    processOne(p.file, id);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {photos.map((p) => (
          <div key={p.id} className="relative">
            <img
              src={p.previewUrl}
              alt=""
              className="w-20 h-20 rounded-lg object-cover border border-slate-300"
            />
            <button
              type="button"
              onClick={() => removeOne(p.id)}
              className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs leading-none hover:bg-red-700"
              aria-label="remove"
            >
              ×
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded-b-lg flex items-center justify-between gap-1">
              <span>
                {p.status === "uploading" && "↑"}
                {p.status === "uploaded" && (p.cvRunning ? "✓" : (p.cv?.ok ?? true) ? "✓" : "⚠")}
                {p.status === "error" && "✗"}
              </span>
              <span className="truncate">
                {p.status === "uploading" && "uploading…"}
                {p.status === "uploaded" && (p.cvRunning ? "saved" : "saved")}
                {p.status === "error" && (p.errorMessage ?? "failed")}
              </span>
            </div>
            {p.status === "error" && (
              <button
                type="button"
                onClick={() => retryOne(p)}
                className="absolute -bottom-6 left-0 right-0 text-[10px] text-cmu hover:underline"
              >Retry</button>
            )}
          </div>
        ))}
      </div>
      {photos.length < 5 && (
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
          >
            📷 Take photo
          </button>
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
          >
            ⬆ Upload
          </button>
        </div>
      )}
      {/* Camera capture (mobile only — desktop ignores `capture` and shows a normal file picker) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      {/* Plain upload — gallery / files / drag-drop */}
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <p className="text-xs text-slate-500">Up to 5 photos. Use Take Photo for the camera, or Upload to pick from your gallery or files. Each photo uploads in the background.</p>
    </div>
  );
}
