/** Resize supplied screenshots before the bounded Convex submission mutation. */
export async function prepareTrialImage(file: File): Promise<{ data: string; mimeType: "image/jpeg" }> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    for (const width of [1280, 960, 640]) {
      const ratio = Math.min(1, width / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot resize images.");
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
      if (data.length <= 450000) return { data, mimeType: "image/jpeg" };
    }
    throw new Error("Image is too detailed. Crop it to the offer text and try again.");
  } finally { bitmap.close(); }
}
