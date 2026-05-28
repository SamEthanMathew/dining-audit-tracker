import { supabase } from "./supabase";

export async function uploadAuditPhoto(
  submissionId: string,
  stream: string,
  file: File
): Promise<string> {
  const blob = await resizeJpeg(file, 1280, 0.8);
  const path = `${submissionId}/${stream}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("audit-photos").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
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
  const bmp = await createImageBitmap(file);
  const ratio = Math.min(1, maxWidth / bmp.width);
  const w = Math.round(bmp.width * ratio);
  const h = Math.round(bmp.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality
    );
  });
}
