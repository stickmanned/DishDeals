export async function prepareWorkflowImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type))
    throw new Error(
      "Choose a PNG, JPG, or WebP image. Save HEIC as JPG first.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose an image smaller than 10 MB.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("We couldn’t read this image. Try a different screenshot.");
  });
  try {
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "Your browser couldn’t prepare the image. Try pasting the offer text.",
      );
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4, 0.25]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.split(",")[1].length <= 450000) return data;
    }
    throw new Error(
      "This image is still too large. Crop it around the offer and try again.",
    );
  } finally {
    bitmap.close();
  }
}
