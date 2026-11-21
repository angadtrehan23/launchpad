"use client";

/**
 * Turn an uploaded photo into a small square avatar (data URL), small enough to travel
 * inside the store's link: no image hosting or database needed.
 */
export async function toAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    for (const [size, quality] of [
      [160, 0.72],
      [128, 0.6],
      [96, 0.5],
    ] as const) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= 14000) return data;
    }
    return "";
  } finally {
    URL.revokeObjectURL(url);
  }
}
