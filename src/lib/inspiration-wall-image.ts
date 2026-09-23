export const INSPIRATION_WALL_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const INSPIRATION_WALL_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_INSPIRATION_WALL_IMAGE_BYTES = 4 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 2400;
const MIN_QUALITY = 0.52;

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  return "webp";
}

function replaceExtension(name: string, extension: string) {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${extension}`;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not optimize image."))),
      type,
      quality,
    );
  });
}

export async function optimizeInspirationWallImage(file: File): Promise<File> {
  if (!INSPIRATION_WALL_IMAGE_TYPES.includes(file.type as (typeof INSPIRATION_WALL_IMAGE_TYPES)[number])) {
    throw new Error("Inspiration Wall images must be JPEG, PNG or WebP.");
  }

  // The product contract explicitly keeps small files unchanged.
  if (file.size <= MAX_INSPIRATION_WALL_IMAGE_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const originalMax = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, MAX_IMAGE_DIMENSION / originalMax);

    for (let pass = 0; pass < 7; pass += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Image optimization is not available in this browser.");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.88, 0.8, 0.72, 0.64, 0.58, MIN_QUALITY]) {
        const blob = await canvasBlob(canvas, "image/webp", quality);
        if (blob.size <= MAX_INSPIRATION_WALL_IMAGE_BYTES) {
          return new File([blob], replaceExtension(file.name, extensionFor(blob.type)), {
            type: blob.type,
            lastModified: Date.now(),
          });
        }
      }

      // Reduce dimensions only when quality reduction is not enough. This never upscales.
      scale *= 0.82;
    }
  } finally {
    bitmap.close();
  }

  throw new Error("The image could not be reduced below 4 MB. Please choose a smaller image.");
}
