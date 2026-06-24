import { supabase } from "./supabase";

const UPLOAD_TIMEOUT_MS = 60_000;
const RESIZE_TIMEOUT_MS = 12_000;

export async function uploadAuditPhoto(
  submissionId: string,
  stream: string,
  file: File
): Promise<string> {
  // Try to resize; if resize fails or times out, fall back to the original file.
  let blob: Blob | File = file;
  try {
    blob = await withTimeout(resizeJpeg(file, 1280, 0.8), RESIZE_TIMEOUT_MS);
  } catch (e) {
    console.warn("[photos] resize failed, uploading original:", e);
    blob = file;
  }

  const path = `${submissionId}/${stream}/${crypto.randomUUID()}.jpg`;
  const upload = supabase.storage.from("audit-photos").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  const { error } = await withTimeout(upload, UPLOAD_TIMEOUT_MS);
  if (error) throw error;
  return path;
}

export async function getPhotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("audit-photos")
    .createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data.signedUrl;
}

async function resizeJpeg(file: File, maxWidth: number, quality: number): Promise<Blob> {
  // Prefer createImageBitmap; fall back to <img> + canvas when it's unavailable
  // or hangs (Safari quirks on older iOS).
  let width: number, height: number;
  let drawable: CanvasImageSource;
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      width = bmp.width; height = bmp.height; drawable = bmp;
    } else {
      throw new Error("no createImageBitmap");
    }
  } catch {
    const img = await loadHtmlImage(file);
    width = img.naturalWidth; height = img.naturalHeight; drawable = img;
  }

  const ratio = Math.min(1, maxWidth / width);
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(drawable, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality
    );
  });
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); },
           (e) => { clearTimeout(timer); reject(e); });
  });
}
