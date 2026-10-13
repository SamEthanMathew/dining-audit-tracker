import { supabase } from "./supabase";

const UPLOAD_TIMEOUT_MS = 90_000;
const DECODE_TIMEOUT_MS = 15_000;
const UPLOAD_ATTEMPTS = 3;

/** Formats every browser can render in an <img>. Anything else gets transcoded. */
const WEB_SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Progressive downscale ladder — first pass that lands under TARGET_BYTES wins. */
const LADDER: { maxEdge: number; quality: number }[] = [
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1280, quality: 0.72 },
  { maxEdge: 1024, quality: 0.6 },
];
const TARGET_BYTES = 1_200_000; // ~1.2MB keeps uploads quick on cell data
const HARD_MAX_BYTES = 25_000_000;

export type UploadedPhoto = {
  storagePath: string;
  /** Non-fatal note to show the user (e.g. we had to keep an unconverted HEIC). */
  warning?: string;
};

export async function uploadAuditPhoto(
  submissionId: string,
  stream: string,
  file: File
): Promise<UploadedPhoto> {
  if (file.size === 0) {
    throw new Error("That file is empty — try taking the photo again.");
  }

  const prepared = await prepareImage(file);

  if (prepared.blob.size > HARD_MAX_BYTES) {
    throw new Error("Photo is too large to upload. Try again with a smaller photo.");
  }

  const path = `${submissionId}/${stream}/${crypto.randomUUID()}.${prepared.ext}`;
  await uploadWithRetry(path, prepared.blob, prepared.contentType);
  return { storagePath: path, warning: prepared.warning };
}

export async function getPhotoUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("audit-photos")
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) {
    console.warn("[photos] signed url failed", storagePath, error);
    return null;
  }
  return data.signedUrl;
}

/** Signed URLs for many paths in one round trip; falls back to per-path on error. */
export async function getPhotoUrls(
  storagePaths: string[],
  expiresInSeconds = 3600
): Promise<Record<string, string>> {
  if (storagePaths.length === 0) return {};
  const unique = Array.from(new Set(storagePaths));
  const out: Record<string, string> = {};
  const { data, error } = await supabase.storage
    .from("audit-photos")
    .createSignedUrls(unique, expiresInSeconds);
  if (!error && data) {
    for (const row of data) {
      if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
    }
  }
  const missing = unique.filter((p) => !out[p]);
  await Promise.all(
    missing.map(async (p) => {
      const u = await getPhotoUrl(p, expiresInSeconds);
      if (u) out[p] = u;
    })
  );
  return out;
}

// ---------------------------------------------------------------------------
// Image preparation
// ---------------------------------------------------------------------------

type Prepared = { blob: Blob; contentType: string; ext: string; warning?: string };

/**
 * Decode → EXIF-correct → downscale → JPEG. Phone cameras hand us 4–12MP
 * images (often HEIC on iOS) with the rotation only recorded in EXIF, so
 * uploading the raw file gives sideways photos the admin sometimes can't even
 * open. When decoding fails we still upload the original rather than lose the
 * evidence, but we label it honestly so it isn't served as a broken JPEG.
 */
async function prepareImage(file: File): Promise<Prepared> {
  try {
    const source = await withTimeout(decodeImage(file), DECODE_TIMEOUT_MS);
    try {
      const blob = await encodeBestFit(source.drawable, source.width, source.height);
      return { blob, contentType: "image/jpeg", ext: "jpg" };
    } finally {
      if (typeof ImageBitmap !== "undefined" && source.drawable instanceof ImageBitmap) {
        source.drawable.close();
      }
    }
  } catch (e) {
    console.warn("[photos] could not re-encode, uploading original:", e);
    const type = file.type || "application/octet-stream";
    const ext = extensionFor(file, type);
    const warning = WEB_SAFE_TYPES.has(type)
      ? undefined
      : "Saved in the phone's original format — it may not preview in every browser.";
    return { blob: file, contentType: type, ext, warning };
  }
}

type DecodedImage = { drawable: CanvasImageSource; width: number; height: number };

async function decodeImage(file: File): Promise<DecodedImage> {
  // createImageBitmap is the fast path, but older engines default to ignoring
  // EXIF orientation, hence the explicit imageOrientation.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { drawable: bmp, width: bmp.width, height: bmp.height };
    } catch (e) {
      console.warn("[photos] createImageBitmap failed, falling back to <img>:", e);
    }
  }
  // <img> decoding applies EXIF orientation itself in every current browser.
  const img = await loadHtmlImage(file);
  return { drawable: img, width: img.naturalWidth, height: img.naturalHeight };
}

async function encodeBestFit(
  drawable: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob> {
  if (!width || !height) throw new Error("image has no dimensions");
  let last: Blob | null = null;
  for (const step of LADDER) {
    const blob = await drawToJpeg(drawable, width, height, step.maxEdge, step.quality);
    last = blob;
    if (blob.size <= TARGET_BYTES) return blob;
  }
  if (!last) throw new Error("encode produced nothing");
  return last;
}

function drawToJpeg(
  drawable: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
  quality: number
): Promise<Blob> {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  // White matte so transparent PNGs don't come out black once flattened to JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
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

function extensionFor(file: File, type: string): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  const fromType = type.split("/")[1]?.toLowerCase().replace("+xml", "");
  if (fromType && /^[a-z0-9]{1,5}$/.test(fromType)) return fromType;
  return "bin";
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

async function uploadWithRetry(path: string, blob: Blob, contentType: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      const { error } = await withTimeout(
        supabase.storage.from("audit-photos").upload(path, blob, { contentType, upsert: true }),
        UPLOAD_TIMEOUT_MS
      );
      if (!error) return;
      lastError = error;
      if (!isRetryable(error)) break;
    } catch (e) {
      lastError = e; // timeout — worth retrying on flaky cell data
    }
    if (attempt < UPLOAD_ATTEMPTS) await sleep(600 * attempt);
  }
  throw new Error(friendlyUploadError(lastError));
}

function isRetryable(error: unknown): boolean {
  const msg = messageOf(error).toLowerCase();
  const status = (error as { statusCode?: string | number } | null)?.statusCode;
  const code = typeof status === "string" ? Number(status) : status;
  if (code === 401 || code === 403 || code === 413) return false;
  if (msg.includes("exceeded the maximum allowed size")) return false;
  if (msg.includes("row-level security") || msg.includes("unauthorized")) return false;
  return true;
}

function friendlyUploadError(error: unknown): string {
  const msg = messageOf(error);
  const lower = msg.toLowerCase();
  if (lower.includes("timeout")) return "Upload timed out — check your signal and tap Retry.";
  if (lower.includes("exceeded the maximum allowed size")) return "Photo is too large for the server.";
  if (lower.includes("row-level security") || lower.includes("unauthorized") || lower.includes("403")) {
    return "Not allowed to upload photos right now. Reload the page and try again.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "No connection — tap Retry when you're back online.";
  }
  return msg || "Upload failed.";
}

function messageOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const m = (error as { message?: unknown }).message;
  return typeof m === "string" ? m : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T> | PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
