// Lazy-loaded on-device object detection.
// Used to give the user a soft warning when a photo doesn't appear
// to contain a bin / waste item — never blocks submission.

type Detection = { class: string; score: number };

let modelP: Promise<any> | null = null;

async function loadModel(): Promise<any> {
  if (modelP) return modelP;
  modelP = (async () => {
    const [tf, cocoSsd] = await Promise.all([
      import("@tensorflow/tfjs"),
      import("@tensorflow-models/coco-ssd"),
    ]);
    await tf.ready();
    return cocoSsd.load({ base: "lite_mobilenet_v2" });
  })();
  return modelP;
}

const BIN_PROXIES = new Set([
  // COCO doesn't have "trash bin"; these are the realistic stand-ins.
  "bottle", "cup", "wine glass", "bowl",
  "banana", "apple", "sandwich", "orange", "broccoli", "carrot",
  "hot dog", "pizza", "donut", "cake",
  "suitcase", "backpack", "handbag",
  "book",  // close-up books / cardboard sometimes detected as this
  "refrigerator", "oven", "microwave", "sink",
]);

export async function detectBinish(file: File): Promise<{ ok: boolean; label: string }> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const model = await loadModel();
      const preds = (await model.detect(img)) as Detection[];
      if (preds.length === 0) return { ok: false, label: "no objects detected" };
      const hit = preds.find((p) => BIN_PROXIES.has(p.class));
      if (hit) return { ok: true, label: hit.class };
      return { ok: false, label: preds.slice(0, 2).map((p) => p.class).join(", ") };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return { ok: true, label: "skipped" };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}
