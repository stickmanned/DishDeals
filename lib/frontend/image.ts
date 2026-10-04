type DecodedImage = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeImage(file: File, progress: (stage: string) => void): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    progress("Decoding image with ImageBitmap");
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch { /* WebKit may decode this file through its regular image loader. */ }
  }
  progress("Decoding image with browser fallback");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Image decoding timed out. Try a smaller JPG screenshot.")), 15000);
      image.onload = () => { clearTimeout(timeout); resolve(); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error("We couldn’t read this image. Try a JPG screenshot.")); };
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    image.onload = null;
    image.onerror = null;
  }
}

export async function prepareWorkflowImage(file: File, progress: (stage: string) => void = () => {}): Promise<string> {
  // Some phone pickers omit MIME metadata. The decoder still verifies the bytes.
  const type = file.type.toLowerCase() || (/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name) ? "image/" + file.name.split(".").at(-1)!.toLowerCase().replace("jpg", "jpeg") : "");
  if (!/^image\/(png|jpeg|webp|heic|heif)$/.test(type))
    throw new Error(
      "Choose a PNG, JPG, or WebP image. If your phone cannot decode HEIC, save it as JPG first.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose an image smaller than 10 MB.");
  if (!file.size) throw new Error("The selected image is empty. Choose it again.");
  const decoded = await decodeImage(file, progress);
  try {
    if (!decoded.width || !decoded.height) throw new Error("This image has no readable dimensions.");
    progress(`Resizing ${decoded.width} × ${decoded.height} image`);
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1280 / Math.max(decoded.width, decoded.height));
    canvas.width = Math.max(1, Math.round(decoded.width * ratio));
    canvas.height = Math.max(1, Math.round(decoded.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "Your browser couldn’t prepare the image. Try pasting the offer text.",
      );
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4, 0.25]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (!data.startsWith("data:image/jpeg;base64,/9j/")) throw new Error("Your browser couldn’t encode a JPG image. Try another screenshot.");
      if (data.split(",")[1].length <= 450000) {
        progress(`Prepared JPG ${canvas.width} × ${canvas.height}; ${data.split(",")[1].length} base64 characters`);
        return data;
      }
    }
    throw new Error(
      "This image is still too large. Crop it around the offer and try again.",
    );
  } finally {
    decoded.release();
  }
}
