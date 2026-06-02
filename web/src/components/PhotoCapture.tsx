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
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 5 - photos.length;
    const taken = Array.from(files).slice(0, remaining);
    for (const f of taken) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(f);
      setPhotos((prev) => [...prev, { id, file: f, previewUrl, status: "uploading" }]);

      // upload + CV in parallel
      const upload = uploadAuditPhoto(submissionId, stream, f);
      const cv = detectBinish(f);
      const [uploadResult, cvResult] = await Promise.allSettled([upload, cv]);

      setPhotos((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          if (uploadResult.status === "fulfilled") {
            return {
              ...p,
              status: "uploaded",
              storagePath: uploadResult.value,
              cv: cvResult.status === "fulfilled" ? cvResult.value : undefined,
            };
          }
          return {
            ...p,
            status: "error",
            errorMessage:
              uploadResult.status === "rejected" ? (uploadResult.reason as Error).message : "upload failed",
          };
        })
      );
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeOne(id: string) {
    setPhotos((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
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
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded-b-lg flex items-center justify-between">
              <span>
                {p.status === "uploading" && "↑"}
                {p.status === "uploaded" && (p.cv?.ok ? "✓" : "⚠")}
                {p.status === "error" && "✗"}
              </span>
              <span className="truncate">
                {p.status === "uploading"
                  ? "uploading…"
                  : p.cv?.label ?? (p.status === "error" ? p.errorMessage : "")}
              </span>
            </div>
          </div>
        ))}
        {photos.length < 5 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50"
          >
            <span className="text-xl">+</span>
            <span className="text-xs">Photo</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <p className="text-xs text-slate-500">Up to 5 photos. We'll flag any photo that doesn't look like a bin (a soft warning only — you can still submit).</p>
    </div>
  );
}
